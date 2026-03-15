'use client';

import { usePrivy, useWallets } from '@privy-io/react-auth';

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function Header() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const address = wallets[0]?.address;

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

      {/* Wallet button */}
      <div>
        {!ready ? (
          <button
            disabled
            className="px-4 py-2 rounded-lg bg-gray-800 text-gray-500 text-sm cursor-not-allowed"
          >
            Loading...
          </button>
        ) : authenticated && address ? (
          <div className="flex items-center gap-3">
            <span className="text-sm font-mono text-gray-400 bg-gray-800 px-3 py-1.5 rounded-lg">
              {truncateAddress(address)}
            </span>
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
