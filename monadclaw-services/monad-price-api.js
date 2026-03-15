require('dotenv').config();
const express = require('express');
const { x402ResourceServer, HTTPFacilitatorClient, x402HTTPResourceServer } = require('@x402/core/server');
const { decodePaymentSignatureHeader } = require('@x402/core/http');
const { registerExactEvmScheme } = require('@x402/evm/exact/server');

const app = express();
app.use(express.json());

const PORT     = 4001;
const WALLET   = process.env.PRICE_API_WALLET;
if (!WALLET) { console.error('PRICE_API_WALLET not set in .env'); process.exit(1); }
console.log(`[monad-price-api] payTo wallet: ${WALLET}`);
const NETWORK  = 'eip155:10143';
const USDC     = '0x534b2f3A21130d7a60830c2Df862319e593943A3';
const PRICE_UNITS = '100'; // $0.0001 USDC (6 decimals: 100 units = 0.0001)
const FACILITATOR_URL = 'https://x402-facilitator.molandak.org';

const facilitator  = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const resourceServer = new x402ResourceServer(facilitator);
registerExactEvmScheme(resourceServer);
const httpServer   = new x402HTTPResourceServer(resourceServer, {});

const REQUIREMENTS = {
  scheme: 'exact',
  network: NETWORK,
  amount: PRICE_UNITS,
  asset: USDC,
  payTo: WALLET,
  maxTimeoutSeconds: 300,
  extra: { name: 'USDC', version: '2' },
};

function build402(reqUrl) {
  const payload = {
    x402Version: 2,
    error: 'Payment required',
    resource: { url: reqUrl, description: 'Monad price feed', mimeType: 'application/json' },
    accepts: [REQUIREMENTS],
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

app.get('/monad-price', async (req, res) => {
  const paymentHeader = req.headers['payment-signature'] ?? req.headers['x-payment'];

  // ── No payment: return 402 ────────────────────────────────────────────────
  if (!paymentHeader) {
    const reqUrl = `http://${req.headers.host}${req.url}`;
    return res.status(402)
      .set('PAYMENT-REQUIRED', build402(reqUrl))
      .json({ error: 'Payment required' });
  }

  // ── Payment present: verify → settle → respond ───────────────────────────
  let paymentPayload;
  try {
    paymentPayload = decodePaymentSignatureHeader(paymentHeader);
  } catch {
    return res.status(400).json({ error: 'Invalid payment header' });
  }

  const verifyResult = await resourceServer.verifyPayment(paymentPayload, REQUIREMENTS);
  if (!verifyResult.isValid) {
    return res.status(402).json({ error: verifyResult.invalidReason ?? 'Payment invalid' });
  }

  const settle = await httpServer.processSettlement(paymentPayload, REQUIREMENTS);
  if (!settle.success) {
    return res.status(402).set(settle.headers ?? {}).json({ error: settle.errorReason ?? 'Settlement failed' });
  }

  console.log(`[monad-price-api] settled tx=${settle.transaction} payer=${verifyResult.payer}`);

  // ── Fetch Monad price ─────────────────────────────────────────────────────
  try {
    const r = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=monad-2,monad&vs_currencies=usd',
      { headers: { Accept: 'application/json' } }
    );
    const data = await r.json();
    const price = data?.['monad-2']?.usd ?? data?.['monad']?.usd ?? 'unavailable';
    console.log(`[monad-price-api] price=${price}`);
    res.set(settle.headers ?? {}).json({ price, currency: 'USD', source: 'CoinGecko', paid: true, tx: settle.transaction });
  } catch (e) {
    res.set(settle.headers ?? {}).status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`Monad price API listening on http://localhost:${PORT}`));
