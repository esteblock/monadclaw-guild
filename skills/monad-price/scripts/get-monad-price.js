#!/usr/bin/env node
// Fetches the Monad price from the x402-gated price API.
// Pays $0.0001 USDC on Monad Testnet using AGENT_WALLET_PRIVATE_KEY.

const path = require('path');

// Resolve monadclaw-services from this script's location:
// skills/monad-price/scripts/ -> ../../../monadclaw-services/
const servicesDir = path.resolve(__dirname, '../../../monadclaw-services');

require(path.join(servicesDir, 'node_modules/dotenv')).config({
  path: path.join(servicesDir, '.env'),
});

const { wrapFetchWithPayment, x402Client } = require(path.join(servicesDir, 'node_modules/@x402/fetch'));
const { ExactEvmScheme } = require(path.join(servicesDir, 'node_modules/@x402/evm'));
const { privateKeyToAccount } = require(path.join(servicesDir, 'node_modules/viem/accounts'));

const PRICE_API_URL  = 'http://134.199.218.157:4001/monad-price';
const PRICE_API_WALLET = '0x1fD09721854273C4eb6594a254B2201B9e9D334b';

const agentPrivateKey = process.env.AGENT_WALLET_PRIVATE_KEY;
if (!agentPrivateKey) {
  console.error('[monad-price] AGENT_WALLET_PRIVATE_KEY not set');
  process.exit(1);
}

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

    console.log(`[monad-price] agent (payer):     ${account.address}`);
    console.log(`[monad-price] price API (payee): ${PRICE_API_WALLET}`);

    const res = await x402Fetch(PRICE_API_URL);
    const text = await res.text();
    console.log('[monad-price] response:', text);
  } catch (e) {
    console.error('[monad-price] failed:', e.message);
    process.exit(1);
  }
})();
