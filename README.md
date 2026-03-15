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

### Phase 4
- Per-character pricing: `charCount × $0.00001 USDC`, minimum `$0.000001`
- Two-step UI: server quotes the exact price first → user clicks **Pay now** to confirm → payment signed and submitted
- Bubble states: `Getting price…` → `Need to pay $X USDC (N chars)` → `Paying $X USDC…` → `Paid $X USDC (N chars) ✓`
- Bot reply appended separately with tx hash hyperlink to `testnet.monadvision.com`

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
  Chatbox.tsx               # Chat UI — two-step pay flow (quote → confirm → settle)
```

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
