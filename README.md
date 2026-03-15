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

## Phase 4: Per-Character Pricing

Instead of a flat fee, the cost of each message is determined by the length of the server's response.

**How it works:**

1. The chatbox sends `POST /api/chat` with no payment header
2. The server generates the response string (`"Message received: [text]"`), counts its characters, and calculates the exact price
3. The server returns `402` with the computed price in the `PAYMENT-REQUIRED` header and `{ charCount, priceUSDC }` in the body
4. The chatbox displays **"Need to pay $X.XXXXXX USDC (N chars)"** with a **Pay now** button
5. The user clicks **Pay now** — the wallet signs an EIP-712 transfer authorization for that exact amount
6. The chatbox retries with the `PAYMENT-SIGNATURE` header
7. The server verifies the payment via the OpenX402 facilitator, settles on-chain, and returns the reply
8. The chatbox shows **"Paid $X.XXXXXX USDC (N chars) ✓"** and the bot reply with a tx link

**Price formula:**

```
price = max($0.000001, charCount × $0.00001) USDC
```

Character count is taken from the **user's message** (not the response wrapper), so a 4-character input bills as 4 chars. When a real LLM replaces the echo response, this will switch to counting the generated output length instead. The server computes the response before issuing the 402 so the price is exact — the same message always produces the same response and price on retry.

---

## Phase 5: Real OpenClaw Agent

After payment settles, the server forwards the user's message to a real OpenClaw agent
and returns its reply. Each connected wallet gets its own persistent session with memory,
so users can refer to previous messages across browser sessions.

**How it works:**

1. Payment is verified and settled (same as Phase 4)
2. The server calls `POST /tools/invoke` on the OpenClaw Gateway with `sessions_send`
3. The session key is `agent:main:monadclaw:0xYourWalletAddress` — unique per wallet
4. OpenClaw runs the agent turn synchronously and returns the reply inline (no polling)
5. The server returns the reply with the settled tx hash

**Agent model:** `openrouter/google/gemini-2.5-flash` via OpenRouter

**Fallback:** If `OPENCLAW_GATEWAY_URL` is not set, the server falls back to
`"Message received: [text]"` so the app stays deployable without a VPS.

**Session ID:** Shown in small muted text at the top of the chat (`Sessão: monadclaw:0x…`).

See [Connecting Your OpenClaw Agent](#connecting-your-openclaw-agent) for VPS setup.

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
cd app && npm install
```

### 2. Configure environment variables

```bash
cd app && cp .env.local.example .env.local
```

Fill in `.env.local`:

```
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id
WALLET_ADDRESS=your-recipient-wallet-address
```

- **`NEXT_PUBLIC_PRIVY_APP_ID`** — from your app at [dashboard.privy.io/apps](https://dashboard.privy.io/apps) → Settings → App ID
- **`WALLET_ADDRESS`** — the wallet that receives USDC payments (can be your own wallet address)

### 3. Enable Embedded Wallets in Privy

In your Privy dashboard → **Embedded Wallets** → toggle on **"Create on login"**.
This allows email users to get an auto-generated smart account.

### 4. Run the dev server

```bash
cd app && npm run dev
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

### Phase 4
- Per-character pricing: `charCount × $0.00001 USDC`, minimum `$0.000001`
- Two-step UI: server quotes the exact price first → user clicks **Pay now** to confirm → payment signed and submitted
- Bubble states: `Getting price…` → `Need to pay $X USDC (N chars)` → `Paying $X USDC…` → `Paid $X USDC (N chars) ✓`
- Bot reply appended separately with tx hash hyperlink to `testnet.monadvision.com`

### Phase 5
- Real OpenClaw agent replaces hardcoded stub — replies via `sessions_send` (synchronous, no polling)
- Per-wallet persistent sessions: `agent:main:monadclaw:0xYourAddress` — agent remembers previous messages
- Session ID displayed at top of chat (`Sessão: monadclaw:0x…`)
- Graceful fallback to `"Message received: [text]"` when `OPENCLAW_GATEWAY_URL` is unset

---

## Repository Structure

This is a monorepo. Each subfolder is an independent project with its own `package.json`.

```
monadclaw-guild/
├── app/                        # Next.js 14 dapp (the chat UI)
│   ├── app/
│   │   ├── api/chat/route.ts   # x402-gated POST endpoint + OpenClaw agent call
│   │   ├── layout.tsx          # Root layout, wraps app in PrivyProvider
│   │   └── page.tsx            # Main page (Header + Chatbox)
│   └── components/
│       ├── PrivyProviderWrapper.tsx  # Client-side Privy provider
│       ├── Header.tsx                # Nav bar with wallet connect
│       └── Chatbox.tsx               # Chat UI — two-step pay flow
│
├── services/                   # Standalone Node.js x402 services (VPS)
│   ├── monad-price-api.js      # GET /monad-price — x402-gated Monad price feed
│   └── monadclaw-pay.js        # CLI client to pay any x402 URL from a private key
│
└── skills/                     # AgentSkills-compatible OpenClaw skills
    └── monad-price/
        ├── SKILL.md            # Skill metadata and instructions
        └── scripts/
            └── get-monad-price.js  # Pays the price API and returns MON/USD
```

### Running each part

| Part | Command | Port |
|---|---|---|
| Next.js dapp | `cd app && npm run dev` | 3000 |
| Price API service | `cd services && node monad-price-api.js` | 4001 |

---

## Connecting Your OpenClaw Agent

MonadClaw Guild uses an OpenClaw instance as the AI agent backend. Any OpenClaw
instance running on a VPS can be connected. Follow these steps:

### Prerequisites
- OpenClaw already installed and configured on a VPS with a public IP
- Your `~/.openclaw/openclaw.json` exists and has a working agent
- Port 18789 open on your VPS firewall

### Step 1 — Update your openclaw.json

Add or merge these sections into your existing `~/.openclaw/openclaw.json`.
Do not replace the whole file — only add the missing keys:

```json
{
  "hooks": {
    "enabled": true,
    "token": "YOUR_HOOKS_SECRET",
    "path": "/hooks",
    "allowRequestSessionKey": true,
    "allowedSessionKeyPrefixes": ["monadclaw:"]
  },
  "gateway": {
    "port": 18789,
    "bind": "0.0.0.0",
    "auth": {
      "mode": "token",
      "token": "YOUR_GATEWAY_SECRET"
    },
    "tools": {
      "allow": ["sessions_send"]
    }
  }
}
```

Two important changes from a default OpenClaw config:
- `bind: "0.0.0.0"` — allows external connections (default is `"loopback"` which
  blocks everything outside the VPS)
- `tools.allow: ["sessions_send"]` — enables the synchronous request→reply path
  that MonadClaw uses to get responses without polling

Generate strong secrets with:
```bash
openssl rand -hex 16
```

### Step 2 — Open the firewall port

```bash
ufw allow 18789/tcp
ufw status
```

For production, restrict to only your Next.js server IP:
```bash
ufw allow from YOUR_NEXTJS_SERVER_IP to any port 18789
```

### Step 3 — Restart OpenClaw Gateway

```bash
pkill -f "openclaw" || true
sleep 2
nohup npx openclaw > ~/.openclaw/gateway.log 2>&1 &
sleep 5
ss -tlnp | grep 18789
```

### Step 4 — Test the connection

From your VPS, confirm sessions_send works synchronously:

```bash
curl -s -X POST http://localhost:18789/tools/invoke \
  -H 'Authorization: Bearer YOUR_GATEWAY_SECRET' \
  -H 'Content-Type: application/json' \
  -d '{
    "tool": "sessions_send",
    "args": {
      "sessionKey": "monadclaw:test",
      "message": "Reply with the word READY",
      "timeoutSeconds": 30
    }
  }'
```

Expected response:
```json
{ "result": { "status": "ok", "reply": "READY" } }
```

### Step 5 — Add env vars to MonadClaw Guild

Find your VPS public IP:
```bash
curl -s ifconfig.me
```

Add to your `.env.local`:
```bash
OPENCLAW_GATEWAY_URL=http://YOUR_VPS_PUBLIC_IP:18789
OPENCLAW_GATEWAY_TOKEN=YOUR_GATEWAY_SECRET
OPENCLAW_AGENT_ID=main
```

If you have multiple agents configured (like `main` and `tania`), set
`OPENCLAW_AGENT_ID` to whichever agent you want MonadClaw to talk to.

### Session isolation

Each connected wallet gets its own OpenClaw session automatically via
`monadclaw:0xYourWalletAddress`. OpenClaw maintains conversation memory
per session — users can refer to previous messages across browser sessions.

### Security note

The gateway token is your only authentication layer. Never commit it to git.
For production, put OpenClaw behind a reverse proxy (nginx/Caddy) with TLS
so traffic to port 18789 is encrypted.

---

## OpenClaw Webhook API

The OpenClaw gateway exposes HTTP webhook endpoints for triggering agent turns from external systems.

### Configuration

Add to `~/.openclaw/openclaw.json`:

```json
{
  "hooks": {
    "enabled": true,
    "token": "YOUR_HOOKS_SECRET",
    "path": "/hooks",
    "allowedAgentIds": ["hooks", "main"]
  }
}
```

### Authentication

All requests require the hook token:
- `Authorization: Bearer <token>` (recommended)
- `x-openclaw-token: <token>`

Query string tokens are rejected with a 400.

### Endpoints

#### `POST /hooks/wake`

Enqueues a system event for the main session.

| Field | Required | Description |
|-------|----------|-------------|
| `text` | ✓ | String describing the event |
| `mode` | — | `now` \| `next-heartbeat` (default: `now`) |

#### `POST /hooks/agent`

Runs an isolated agent turn and posts results to the main session.

| Field | Required | Description |
|-------|----------|-------------|
| `message` | ✓ | Prompt for processing |
| `name` | — | Human-readable hook identifier |
| `agentId` | — | Route to a specific agent |
| `sessionKey` | — | Session identifier (disabled by default) |
| `wakeMode` | — | Trigger timing |
| `deliver` | — | Send response to a messaging channel |
| `channel` | — | Messaging platform (slack, discord, telegram, …) |
| `to` | — | Recipient identifier |
| `model` | — | Model override |
| `thinking` | — | Thinking level override |
| `timeoutSeconds` | — | Maximum run duration |

#### `POST /hooks/<name>`

Maps arbitrary external payloads to wake or agent actions via configured mappings.

### Session key security

Request `sessionKey` overrides are disabled by default. Recommended config:

```json
{
  "hooks": {
    "enabled": true,
    "token": "YOUR_HOOKS_SECRET",
    "defaultSessionKey": "hook:ingress",
    "allowRequestSessionKey": false,
    "allowedSessionKeyPrefixes": ["hook:"]
  }
}
```

### HTTP response codes

| Code | Meaning |
|------|---------|
| 200 | Successful execution |
| 400 | Invalid payload |
| 401 | Authentication failure |
| 413 | Oversized payload |
| 429 | Rate-limited after repeated failures |

### Security recommendations

- Restrict webhooks behind loopback or trusted proxy
- Use a dedicated hook token (separate from gateway token)
- Set `hooks.allowedAgentIds` to control multi-agent routing
- Keep `allowRequestSessionKey: false` unless necessary
- Restrict `allowedSessionKeyPrefixes` if enabling request overrides

---

## Improvements

### Phase 4: Switch to `upto` scheme for true usage-based billing

Currently, per-character pricing is simulated by computing the response before issuing
the 402, then charging the exact amount. This works but has a limitation: the server
does the work before payment is guaranteed.

The proper solution is the `upto` scheme: the client pre-authorizes a maximum amount,
the server does the work, then settles only the actual amount consumed.
This requires a facilitator that supports `upto` — Thirdweb's facilitator supports it
on 170+ EVM chains including Monad (eip155:10143 testnet, eip155:143 mainnet).

Migration path:
- Replace OpenX402 middleware with Thirdweb's facilitator (`thirdweb/x402`)
- Use `verifyPayment()` with `scheme: "upto"` and a price ceiling (e.g. `"$0.01"`)
- Generate the LLM response, count characters
- Call `settlePayment()` with the actual computed price
- Add env vars: `THIRDWEB_SECRET_KEY`, `THIRDWEB_SERVER_WALLET_ADDRESS`

Reference: https://blog.thirdweb.com/changelog/dynamic-pricing-for-x402-resources/

### Phase 5+: Replace hardcoded response with real LLM

The response is still `"Message received: [text]"`. Plugging in a real LLM (Claude,
GPT-4, etc.) behind the same x402 gate turns this into a paid AI chatbot with
per-character billing reflecting real inference cost.

Important:
- Do not change the Privy setup, UI layout, or any Phase 1/2 code outside of `/api/chat` and the message display component
- Keep OpenX402 as the facilitator — do not introduce Thirdweb packages in this phase
- The `Improvements` section in the README is documentation only, no code changes needed for it
