#!/usr/bin/env node
// Usage: node monadclaw-pay.js <url>

require('dotenv').config();
const { wrapFetchWithPayment, x402Client } = require('@x402/fetch');
const { ExactEvmScheme } = require('@x402/evm');
const { privateKeyToAccount } = require('viem/accounts');

const url = process.argv[2];
if (!url) {
  console.error('Usage: node monadclaw-pay.js <url>');
  process.exit(1);
}

// Agent wallet — the one that PAYS for x402-gated requests
const agentPrivateKey = process.env.AGENT_WALLET_PRIVATE_KEY;
if (!agentPrivateKey) {
  console.error('AGENT_WALLET_PRIVATE_KEY not set');
  process.exit(1);
}

// Price API wallet — the one that RECEIVES the payment
const priceApiWallet = process.env.PRICE_API_WALLET;

(async () => {
  try {
    const account = privateKeyToAccount(agentPrivateKey);
    const signer = {
      address: account.address,
      signTypedData: ({ domain, types, primaryType, message }) =>
        account.signTypedData({ domain, types, primaryType, message }),
    };
    const exactScheme = new ExactEvmScheme(signer);
    const client = new x402Client().register('eip155:10143', exactScheme);
    const x402Fetch = wrapFetchWithPayment(fetch, client);

    console.log(`[monadclaw-pay] paying for ${url}`);
    console.log(`[monadclaw-pay] agent (payer):     ${account.address}`);
    console.log(`[monadclaw-pay] price API (payee): ${priceApiWallet ?? '(not set)'}`);
    const res = await x402Fetch(url);
    const text = await res.text();
    console.log(`[monadclaw-pay] response:`, text);
  } catch (e) {
    console.error('[monadclaw-pay] failed:', e.message);
    process.exit(1);
  }
})();
