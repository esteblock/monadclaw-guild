# MonadClaw Guild

A Web3 community chat app built on Next.js with Privy wallet authentication.

## Stack

- **Next.js 14** (App Router, TypeScript)
- **Privy** — wallet authentication (`@privy-io/react-auth`)
- **Tailwind CSS** — dark-themed UI

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy the example env file and fill in your Privy App ID:

```bash
cp .env.local.example .env.local
```

Open `.env.local` and set your Privy App ID:

```
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id
```

Get a free App ID at [privy.io](https://privy.io) — create a new project and copy the App ID from the dashboard.

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Features (Phase 1)

- **Connect Wallet** via Privy modal — supports MetaMask, Coinbase Wallet, WalletConnect, and more
- **Header** shows truncated wallet address once connected, with a Disconnect button
- **Chatbox** with message history, input field, and Send button (Enter key also works)
- Messages stored in local state — replies with a hardcoded `"Message received"` response

## Project Structure

```
app/
  layout.tsx          # Root layout, wraps app in PrivyProvider
  page.tsx            # Main page (Header + Chatbox)
  globals.css         # Tailwind base styles
components/
  PrivyProviderWrapper.tsx  # Client-side Privy provider
  Header.tsx                # Nav bar with wallet connect
  Chatbox.tsx               # Chat UI (messages + input)
```
