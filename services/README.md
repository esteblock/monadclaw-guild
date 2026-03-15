# monadclaw-services

Standalone Node.js services for MonadClaw Guild. Runs alongside the Next.js app, either locally or on a VPS.

## Stack

- **Express** — HTTP server
- **x402-express** — payment middleware (`paymentMiddleware`)
- **@x402/fetch** + **@x402/evm** — client-side payment signing
- **viem** — EIP-712 typed data signing from a private key
- **Facilitator:** `https://x402-facilitator.molandak.org` (Monad Testnet)
- **Network:** `eip155:10143` (Monad Testnet)

---

## Services

### `monad-price-api.js` — x402-gated price endpoint

Exposes `GET /monad-price` behind an x402 payment wall. Callers must pay `$0.0001 USDC` on Monad Testnet to receive the current Monad price from CoinGecko.

**Port:** `4001`

**Response:**
```json
{ "price": 1.23, "currency": "USD", "source": "CoinGecko", "paid": true }
```

Start:
```bash
node monad-price-api.js
```

---

### `monadclaw-pay.js` — CLI payment client

Pays any x402-protected URL using a wallet private key and prints the response. Used to test x402 endpoints from the command line without a browser.

**Usage:**
```bash
AGENT_WALLET_PRIVATE_KEY=0x... node monadclaw-pay.js <url>
```

**Example:**
```bash
AGENT_WALLET_PRIVATE_KEY=0x... node monadclaw-pay.js http://localhost:4001/monad-price
```

**Output:**
```
[monadclaw-pay] paying for http://localhost:4001/monad-price
[monadclaw-pay] wallet: 0xYourAddress
[monadclaw-pay] response: {"price":1.23,"currency":"USD","source":"CoinGecko","paid":true}
```

---

## Setup

```bash
npm install
```

No `.env` file needed — the wallet key is passed as an environment variable at runtime. Never commit private keys.

---

## Testing end to end

Terminal 1 — start the price API:
```bash
node monad-price-api.js
```

Terminal 2:
```bash
# Test 1: confirm 402 is returned without payment
curl -s http://localhost:4001/monad-price -w "\nHTTP:%{http_code}"

# Test 2: pay and get price
AGENT_WALLET_PRIVATE_KEY=0x... node monadclaw-pay.js http://localhost:4001/monad-price
```

Test 1 should return HTTP 402 with a base64-encoded `PAYMENT-REQUIRED` header.
Test 2 should print the wallet address and then the price JSON.

---

## Deploying to VPS

Copy the folder to your VPS and run with a process manager:

```bash
npm install
node monad-price-api.js
```

For production, use `pm2` or `nohup` and put it behind nginx with TLS.

Open the required port:
```bash
ufw allow 4001/tcp
```
