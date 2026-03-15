# MonadClaw Guild

A Web3 community chat app built on Next.js with Privy wallet authentication and x402 payment-gated API on Monad.

## Stack

- **Next.js 14** (App Router, TypeScript)
- **Privy** — wallet authentication & embedded smart accounts (`@privy-io/react-auth`)
- **x402** — HTTP 402 payment middleware (`@x402/core`, `@x402/fetch`, `@x402/evm`)
- **OpenX402** facilitator at `https://facilitator.openx402.ai`
- **Tailwind CSS** — dark-themed UI

---

## Phase 2: x402 Payment Flow

Every chat message triggers a micro-payment on Monad Testnet before the API responds.

**How it works:**

1. The chatbox calls `POST /api/chat` via `wrapFetchWithPayment` (from `@x402/fetch`)
2. The server returns `402 Payment Required` with USDC payment requirements
3. `wrapFetchWithPayment` reads the requirements, signs an EIP-712 transfer authorization with the connected Privy wallet, and retries the request with an `X-PAYMENT` header
4. The server forwards the signed payment to the OpenX402 facilitator, which settles the on-chain USDC transfer
5. If settlement succeeds, the server returns `200` with the chat reply

**Cost:** `$0.00001 USDC` per message on Monad Testnet.

---

## Getting Testnet USDC

You need testnet USDC on Monad to send messages. Do this before running the app:

1. Go to [https://faucet.circle.com/](https://faucet.circle.com/)
2. Select **"Monad Testnet"** as the network
3. Paste your wallet address and request USDC
4. Wait ~30 seconds for it to arrive
5. You're ready to test Phase 2

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.local.example .env.local
```

Fill in `.env.local`:

```
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id
WALLET_ADDRESS=your-recipient-wallet-address
```

- **`NEXT_PUBLIC_PRIVY_APP_ID`** — from your app at [privy.io](https://privy.io) (Settings → App ID)
- **`WALLET_ADDRESS`** — the wallet that receives USDC payments (can be your own wallet address)

### 3. Enable Embedded Wallets in Privy

In your Privy dashboard → **Embedded Wallets** → toggle on **"Create on login"**.
This allows email users to get an auto-generated smart account.

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Features

### Phase 1
- Connect wallet via Privy (MetaMask, WalletConnect, embedded smart account via email)
- Header shows truncated wallet address + Disconnect button
- Chatbox with message history, input field, Send / Enter key

### Phase 2
- `POST /api/chat` gated by x402 payment middleware
- `$0.00001 USDC` per message, settled on-chain via OpenX402 facilitator on Monad Testnet
- Loading state ("Paying and sending…") while the payment is being signed and settled
- Clear error messages if the payment fails or the wallet has no USDC

---

## Project Structure

```
app/
  api/chat/route.ts   # x402-gated POST endpoint
  layout.tsx          # Root layout, wraps app in PrivyProvider
  page.tsx            # Main page (Header + Chatbox)
  globals.css         # Tailwind base styles
components/
  PrivyProviderWrapper.tsx  # Client-side Privy provider
  Header.tsx                # Nav bar with wallet connect
  Chatbox.tsx               # Chat UI — calls /api/chat via wrapFetchWithPayment
```
