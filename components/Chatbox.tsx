'use client';

import { useState, useRef, useEffect } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { wrapFetchWithPayment, decodePaymentResponseHeader } from '@x402/fetch';
import { x402Client } from '@x402/core/client';
import { ExactEvmScheme } from '@x402/evm';
import { createWalletClient, custom, defineChain } from 'viem';

const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://testnet-rpc.monad.xyz'] },
  },
});

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  link?: { label: string; url: string };
}

// Price matches route.ts: amount "10" with 6 USDC decimals
const PRICE_USDC = '0.00001 USDC';

const INITIAL_MESSAGES: Message[] = [
  {
    id: '0',
    text: 'Welcome to MonadClaw Guild. How can I help you?',
    sender: 'bot',
  },
];

export default function Chatbox() {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { wallets } = useWallets();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isSending) return;

    setInput('');
    setIsSending(true);

    const loadingId = `${Date.now()}-loading`;
    setMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-user`, text, sender: 'user' },
      { id: loadingId, text: `Paying ${PRICE_USDC}…`, sender: 'bot' },
    ]);

    try {
      const wallet = wallets[0];
      console.log('[chat] wallets available:', wallets.length, '| using:', wallet?.address ?? 'none');
      if (!wallet) throw new Error('No wallet connected. Please connect first.');

      const provider = await wallet.getEthereumProvider();
      console.log('[chat] got EthereumProvider from Privy wallet');

      const walletClient = createWalletClient({
        account: wallet.address as `0x${string}`,
        chain: monadTestnet,
        transport: custom(provider),
      });

      const evmSigner = {
        address: wallet.address as `0x${string}`,
        signTypedData: async (msg: {
          domain: Record<string, unknown>;
          types: Record<string, unknown>;
          primaryType: string;
          message: Record<string, unknown>;
        }) => {
          console.log('[chat] signTypedData called — primaryType:', msg.primaryType, '| domain:', JSON.stringify(msg.domain));
          return walletClient.signTypedData({
            account: wallet.address as `0x${string}`,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            domain: msg.domain as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            types: msg.types as any,
            primaryType: msg.primaryType,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            message: msg.message as any,
          });
        },
      };

      const exactScheme = new ExactEvmScheme(evmSigner);
      const client = new x402Client().register('eip155:10143', exactScheme);
      console.log('[chat] x402 client ready — registered for eip155:10143, calling fetchWithPayment …');

      const fetchWithPayment = wrapFetchWithPayment(fetch, client);

      const res = await fetchWithPayment('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });

      console.log('[chat] fetchWithPayment response — status:', res.status, res.statusText);

      if (res.status === 402) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        console.log('[chat] 402 body:', JSON.stringify(body));
        const reason = body.error ?? 'Payment verification failed';
        const isNoFunds =
          reason.toLowerCase().includes('insufficient') ||
          reason.toLowerCase().includes('transfer') ||
          reason.toLowerCase().includes('funds');

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === loadingId
              ? {
                  ...msg,
                  text: isNoFunds
                    ? `Not enough USDC to pay for this message (${reason}). Get free testnet USDC:`
                    : `Payment failed: ${reason}. If you need testnet USDC:`,
                  link: {
                    label: 'Get USDC at faucet.circle.com',
                    url: 'https://faucet.circle.com/',
                  },
                }
              : msg,
          ),
        );
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        console.error('[chat] non-ok response:', res.status, err);
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as { reply?: string };
      console.log('[chat] success — reply:', data.reply);

      // Decode settlement response to get tx hash
      let txHash: string | null = null;
      const paymentResponseRaw = res.headers.get('payment-response') ?? res.headers.get('PAYMENT-RESPONSE');
      if (paymentResponseRaw) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const paymentResponse = decodePaymentResponseHeader(paymentResponseRaw) as any;
          txHash = paymentResponse?.transaction ?? null;
          console.log('[chat] payment response decoded:', JSON.stringify(paymentResponse));
        } catch (e) {
          console.error('[chat] failed to decode PAYMENT-RESPONSE:', e);
        }
      }

      const replyId = `${Date.now()}-reply`;
      setMessages((prev) => [
        // Update "Paying…" → "Paid ✓ 0.00001 USDC"
        ...prev.map((msg) =>
          msg.id === loadingId ? { ...msg, text: `Paid ${PRICE_USDC} ✓` } : msg,
        ),
        // New bubble: bot reply + tx link
        {
          id: replyId,
          text: data.reply ?? 'Reply received',
          sender: 'bot' as const,
          link: txHash
            ? {
                label: `Tx: ${txHash.slice(0, 10)}…${txHash.slice(-6)}`,
                url: `https://testnet.monadvision.com/tx/${txHash}`,
              }
            : undefined,
        },
      ]);
    } catch (err) {
      console.error('[chat] caught error:', err);
      const errMsg = err instanceof Error ? err.message : 'Something went wrong';
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === loadingId ? { ...msg, text: `Error: ${errMsg}` } : msg,
        ),
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') sendMessage();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Message history */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs lg:max-w-md px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                msg.sender === 'user'
                  ? 'bg-purple-600 text-white rounded-br-sm'
                  : 'bg-gray-800 text-gray-100 rounded-bl-sm'
              }`}
            >
              {msg.text}
              {msg.link && (
                <a
                  href={msg.link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 flex items-center gap-1 text-purple-400 hover:text-purple-300 text-xs underline underline-offset-2"
                >
                  {msg.link.label} →
                </a>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-gray-800 px-4 py-4 shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isSending ? 'Processing payment…' : 'Type a message…'}
            disabled={isSending}
            className="flex-1 bg-gray-800 text-white placeholder-gray-500 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-600 transition-all disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isSending}
            className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-colors"
          >
            {isSending ? '…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
