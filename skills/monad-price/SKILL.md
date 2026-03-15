---
name: monad-price
description: Fetches the current Monad (MON) price in USD from a live x402-gated API. Pays $0.0001 USDC on Monad Testnet per request using the agent wallet. Use when the user asks about the Monad price, MON price, or current token price.
compatibility: Requires Node.js 18+, monadclaw-services installed at ../../../monadclaw-services relative to this skill, and AGENT_WALLET_PRIVATE_KEY set in the environment.
metadata:
  author: monadclaw-guild
  version: "1.0"
  openclaw.requires.env: AGENT_WALLET_PRIVATE_KEY
  openclaw.emoji: 💰
---

## Overview

This skill calls `http://134.199.218.157:4001/monad-price` — an x402-gated Express API that returns the Monad price from CoinGecko. The request automatically triggers a micropayment of `$0.0001 USDC` on Monad Testnet signed by the agent wallet before the price is returned.

## How to use

Run the script:

```bash
node skills/monad-price/scripts/get-monad-price.js
```

Or from the skill directory:

```bash
node scripts/get-monad-price.js
```

## Required environment variables

| Variable | Description |
|---|---|
| `AGENT_WALLET_PRIVATE_KEY` | Private key of the wallet that pays for the request (must hold testnet USDC) |

## Expected output

```
[monad-price] agent (payer):     0xYourAgentWallet
[monad-price] price API (payee): 0x1fD09721854273C4eb6594a254B2201B9e9D334b
[monad-price] response: {"price":1.23,"currency":"USD","source":"CoinGecko","paid":true,"tx":"0x..."}
```

## Payment details

- **Cost:** `$0.0001 USDC` per call
- **Network:** Monad Testnet (`eip155:10143`)
- **Facilitator:** `https://x402-facilitator.molandak.org`
- **Payee:** `0x1fD09721854273C4eb6594a254B2201B9e9D334b`

## Getting testnet USDC

If the agent wallet has no USDC, get some at [faucet.circle.com](https://faucet.circle.com/) → Monad Testnet.
