# MonadClaw Guild

A Web3 community chat app on Monad: connect your wallet, pay per message with USDC via x402, and chat with an AI agent.

## Stack

- **Next.js 14** — App Router, TypeScript, Tailwind CSS
- **Privy** — wallet auth & embedded smart accounts
- **x402** — HTTP 402 micropayment protocol (`@x402/core`, `@x402/fetch`, `@x402/evm`)
- **OpenClaw** — AI agent backend (Gemini 2.5 Flash via OpenRouter)
- **Facilitator** — `https://x402-facilitator.molandak.org` on Monad Testnet (`eip155:10143`)

---

## Repository Structure

```
monadclaw-guild/
├── app/          # Next.js dapp — wallet connect, x402 chat, OpenClaw agent
├── services/     # Node.js x402 services — Monad price API + CLI pay client
└── skills/       # OpenClaw AgentSkills — monad-price skill
```

---

## How it works

1. User connects wallet via Privy
2. User types a message → server returns `402` with the USDC price (per character)
3. User clicks **Pay now** → wallet signs EIP-712 authorization → payment settles on-chain
4. Server forwards the message to the OpenClaw agent → reply returned inline
5. Chat shows the reply + tx hash link

**Price:** `charCount × $0.00001 USDC` per message, minimum `$0.000001`

---

## Getting Started

### 1. Get testnet USDC

Go to [faucet.circle.com](https://faucet.circle.com/) → select **Monad Testnet** → paste your wallet address.

### 2. Install and configure

```bash
cd app
npm install
cp .env.local.example .env.local
```

Fill in `app/.env.local`:

```
NEXT_PUBLIC_PRIVY_APP_ID=    # from dashboard.privy.io/apps → Settings → App ID
WALLET_ADDRESS=              # wallet that receives USDC payments
OPENCLAW_GATEWAY_URL=        # http://YOUR_VPS_IP:18789  (optional)
OPENCLAW_GATEWAY_TOKEN=      # gateway bearer token      (optional)
```

In your Privy dashboard → **Embedded Wallets** → enable **"Create on login"**.

### 3. Run

```bash
cd app && npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Services

The `services/` folder contains standalone Node.js services that run on the VPS.

### Monad Price API — `GET /monad-price` (port 4001)

x402-gated endpoint that returns the current MON/USD price from CoinGecko. Costs `$0.0001 USDC` per call.

```bash
cd services && npm install && node monad-price-api.js
```

### CLI Pay Client

Pay any x402-protected URL from the command line:

```bash
cd services
AGENT_WALLET_PRIVATE_KEY=0x... node monadclaw-pay.js http://localhost:4001/monad-price
```

See [`services/README.md`](services/README.md) for full details.

---

## OpenClaw Skills

The `skills/` folder contains [AgentSkills](https://agentskills.io)-compatible skills for OpenClaw.

### `monad-price`

Fetches the Monad price by paying the x402 price API. The agent uses this automatically when asked about the MON price.

**Install in OpenClaw** — add to `~/.openclaw/openclaw.json`:

```json
{
  "skills": {
    "load": {
      "extraDirs": ["/path/to/monadclaw-guild/skills"]
    },
    "entries": {
      "monad-price": {
        "env": {
          "AGENT_WALLET_PRIVATE_KEY": "0x..."
        }
      }
    }
  }
}
```

---

## Connecting Your OpenClaw Agent

Add to `~/.openclaw/openclaw.json`:

```json
{
  "gateway": {
    "port": 18789,
    "bind": "0.0.0.0",
    "auth": { "mode": "token", "token": "YOUR_GATEWAY_SECRET" },
    "tools": { "allow": ["sessions_send"] }
  }
}
```

Open the firewall port, restart OpenClaw, then add to `app/.env.local`:

```bash
OPENCLAW_GATEWAY_URL=http://YOUR_VPS_IP:18789
OPENCLAW_GATEWAY_TOKEN=YOUR_GATEWAY_SECRET
```

Full setup guide in the old README sections below if needed. Generate secrets with `openssl rand -hex 16`.
