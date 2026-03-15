'use client';

import { useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function CopyIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function Header() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const address = wallets[0]?.address;
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center justify-between shrink-0">
      {/* Logo + Name */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center font-bold text-sm select-none">
          M
        </div>
        <span className="text-lg font-bold tracking-tight text-white">
          MonadClaw Guild
        </span>
      </div>

      {/* Wallet section */}
      <div>
        {!ready ? (
          <button disabled className="px-4 py-2 rounded-lg bg-gray-800 text-gray-500 text-sm cursor-not-allowed">
            Loading...
          </button>
        ) : authenticated && address ? (
          <div className="flex items-center gap-2">
            {/* Address + copy button */}
            <div className="flex items-center gap-1.5 bg-gray-800 px-3 py-1.5 rounded-lg">
              <span className="text-sm font-mono text-gray-400">{truncateAddress(address)}</span>
              <button
                onClick={copyAddress}
                title="Copy full address"
                className={`transition-colors ${copied ? 'text-green-400' : 'text-gray-500 hover:text-gray-300'}`}
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
              </button>
            </div>
            <button
              onClick={logout}
              className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm transition-colors"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={login}
            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors"
          >
            Connect Wallet
          </button>
        )}
      </div>
    </header>
  );
}
