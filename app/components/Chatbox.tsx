'use client';

import { useState, useRef, useEffect } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { decodePaymentResponseHeader } from '@x402/fetch';
import { x402Client, x402HTTPClient } from '@x402/core/client';
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

interface PendingPayment {
  loadingId: string;
  priceUSDC: number;
  charCount: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  paymentRequired: Record<string, any>;
  message: string;
}

function formatUSDC(amount: number): string {
  return amount.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

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
  const [pendingPayment, setPendingPayment] = useState<PendingPayment | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { wallets } = useWallets();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Step 1: fetch price (first request, no payment) ──────────────────────────
  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isSending || !!pendingPayment) return;

    setInput('');
    setIsSending(true);

    const loadingId = `${Date.now()}-loading`;
    setMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-user`, text, sender: 'user' },
      { id: loadingId, text: 'Getting price…', sender: 'bot' },
    ]);

    try {
      const res1 = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });

      if (res1.status !== 402) {
        throw new Error(`Expected 402 pricing response, got ${res1.status}`);
      }

      const body402 = await res1.json().catch(() => ({})) as { charCount?: number; priceUSDC?: number };
      const charCount = body402.charCount ?? 0;
      const priceUSDC = body402.priceUSDC ?? 0;

      const paymentRequiredRaw = res1.headers.get('payment-required') ?? res1.headers.get('PAYMENT-REQUIRED');
      if (!paymentRequiredRaw) throw new Error('Server did not return payment requirements');

      const paymentRequired = JSON.parse(atob(paymentRequiredRaw));

      console.log('[chat] 402 received — chars:', charCount, '| price: $', priceUSDC, 'USDC');

      // Show price with inline Pay button
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === loadingId
            ? { ...msg, text: `Need to pay $${formatUSDC(priceUSDC)} USDC (${charCount} chars)` }
            : msg,
        ),
      );

      setPendingPayment({ loadingId, priceUSDC, charCount, paymentRequired, message: text });
    } catch (err) {
      console.error('[chat] price fetch error:', err);
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

  // ── Step 2: user confirms → sign and submit payment ──────────────────────────
  const executePay = async () => {
    if (!pendingPayment) return;
    const { loadingId, priceUSDC, charCount, paymentRequired, message } = pendingPayment;

    setPendingPayment(null);
    setIsSending(true);

    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === loadingId
          ? { ...msg, text: `Paying $${formatUSDC(priceUSDC)} USDC…` }
          : msg,
      ),
    );

    try {
      const wallet = wallets[0];
      console.log('[chat] executing pay — wallet:', wallet?.address ?? 'none');
      if (!wallet) throw new Error('No wallet connected. Please connect first.');

      const provider = await wallet.getEthereumProvider();
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
          console.log('[chat] signTypedData — primaryType:', msg.primaryType, '| domain:', JSON.stringify(msg.domain));
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exactScheme = new ExactEvmScheme(evmSigner as any);
      const client = new x402Client().register('eip155:10143', exactScheme);
      const httpClient = new x402HTTPClient(client);

      console.log('[chat] creating payment payload …');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const paymentPayload = await client.createPaymentPayload(paymentRequired as any);
      const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);

      console.log('[chat] retrying with payment …');
      const res2 = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Expose-Headers': 'PAYMENT-RESPONSE,X-PAYMENT-RESPONSE',
          ...paymentHeaders,
        },
        body: JSON.stringify({ message, walletAddress: wallet.address }),
      });

      console.log('[chat] retry status:', res2.status, res2.statusText);

      if (res2.status === 402) {
        const body = await res2.json().catch(() => ({})) as { error?: string };
        const reason = body.error ?? 'Payment verification failed';
        const isNoFunds =
          reason.toLowerCase().includes('insufficient') ||
          reason.toLowerCase().includes('funds');
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === loadingId
              ? {
                  ...msg,
                  text: isNoFunds
                    ? `Not enough USDC. Get testnet USDC:`
                    : `Payment failed: ${reason}. If you need testnet USDC:`,
                  link: { label: 'Get USDC at faucet.circle.com', url: 'https://faucet.circle.com/' },
                }
              : msg,
          ),
        );
        return;
      }

      if (!res2.ok) {
        const err = await res2.json().catch(() => ({})) as { error?: string };
        console.error('[chat] non-ok response:', res2.status, err);
        throw new Error(err.error ?? `HTTP ${res2.status}`);
      }

      const data = await res2.json() as { reply?: string; charCount?: number; priceUSDC?: number };
      console.log('[chat] success — reply:', data.reply, '| chars:', data.charCount, '| price:', data.priceUSDC);

      const paidPrice = data.priceUSDC ?? priceUSDC;
      const paidChars = data.charCount ?? charCount;

      // Decode PAYMENT-RESPONSE header for tx hash
      let txHash: string | null = null;
      const paymentResponseRaw = res2.headers.get('payment-response') ?? res2.headers.get('PAYMENT-RESPONSE');
      if (paymentResponseRaw) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const settlement = decodePaymentResponseHeader(paymentResponseRaw) as any;
          txHash = settlement?.transaction ?? null;
          console.log('[chat] settlement decoded:', JSON.stringify(settlement));
        } catch (e) {
          console.error('[chat] failed to decode PAYMENT-RESPONSE:', e);
        }
      }

      const replyId = `${Date.now()}-reply`;
      setMessages((prev) => [
        // "Paying..." → "Paid $X (N chars) ✓"
        ...prev.map((msg) =>
          msg.id === loadingId
            ? { ...msg, text: `Paid $${formatUSDC(paidPrice)} USDC (${paidChars} chars) ✓` }
            : msg,
        ),
        // Bot reply with tx link
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
      console.error('[chat] pay error:', err);
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

  const isBlocked = isSending || !!pendingPayment;

  const sessionAddress = wallets[0]?.address;

  return (
    <div className="flex flex-col h-full">
      {/* Session ID */}
      {sessionAddress && (
        <div className="px-4 pt-2 pb-0 text-xs text-gray-600 select-none">
          Sessão: monadclaw:{sessionAddress.slice(0, 6)}…{sessionAddress.slice(-4)}
        </div>
      )}

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

              {/* Pay button — appears only on the pending payment bubble */}
              {pendingPayment?.loadingId === msg.id && (
                <button
                  onClick={executePay}
                  className="mt-2 w-full py-1.5 px-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  Pay now →
                </button>
              )}

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
            placeholder={
              isSending
                ? 'Processing…'
                : pendingPayment
                  ? 'Confirm payment above…'
                  : 'Type a message…'
            }
            disabled={isBlocked}
            className="flex-1 bg-gray-800 text-white placeholder-gray-500 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-600 transition-all disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isBlocked}
            className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-colors"
          >
            {isSending ? '…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
