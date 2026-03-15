import { NextRequest, NextResponse } from 'next/server';
import { x402ResourceServer, HTTPFacilitatorClient } from '@x402/core/server';
import { x402HTTPResourceServer } from '@x402/core/http';
import { registerExactEvmScheme } from '@x402/evm/exact/server';

// Force dynamic rendering and prevent Next.js 14 from caching/patching outbound fetch calls
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const FACILITATOR_URL = 'https://x402-facilitator.molandak.org';
const NETWORK = 'eip155:10143'; // Monad testnet

console.log('[x402] Initializing route — facilitator:', FACILITATOR_URL);
console.log('[x402] WALLET_ADDRESS env:', process.env.WALLET_ADDRESS ?? '⚠️  NOT SET');

const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const resourceServer = new x402ResourceServer(facilitator);
registerExactEvmScheme(resourceServer);

const httpServer = new x402HTTPResourceServer(resourceServer, {
  'POST /api/chat': {
    accepts: {
      scheme: 'exact',
      payTo: process.env.WALLET_ADDRESS!,
      price: {
        amount: '10', // 0.00001 USDC (6 decimals)
        asset: '0x534b2f3A21130d7a60830c2Df862319e593943A3', // Monad testnet USDC
        extra: { name: 'USDC', version: '2' },
      },
      network: NETWORK,
    },
    description: 'MonadClaw Guild chat message',
  },
});

// Lazy init — fetches /supported from the facilitator once
let initPromise: Promise<void> | null = null;
function ensureInitialized() {
  if (!initPromise) {
    console.log('[x402] Calling facilitator /supported …');
    initPromise = httpServer.initialize()
      .then(() => console.log('[x402] Facilitator /supported OK'))
      .catch((err) => {
        console.error('[x402] Facilitator /supported FAILED:', err);
        initPromise = null;
        throw err;
      });
  }
  return initPromise;
}

export async function POST(req: NextRequest) {
  console.log('\n[x402] ─── Incoming POST /api/chat ───');
  console.log('[x402] Request headers:', Object.fromEntries(req.headers.entries()));

  await ensureInitialized();

  const paymentHeader = req.headers.get('payment-signature') ?? req.headers.get('x-payment');
  const hasPayment = !!paymentHeader;
  console.log('[x402] Has payment header:', hasPayment, '| header name used:', req.headers.get('payment-signature') ? 'payment-signature' : req.headers.get('x-payment') ? 'x-payment' : 'none');
  if (hasPayment) {
    console.log('[x402] payment header value:', paymentHeader);
  }

  console.log('[x402] Calling processHTTPRequest …');
  const result = await httpServer.processHTTPRequest({
    adapter: {
      getHeader: (name) => req.headers.get(name) ?? undefined,
      getMethod: () => req.method,
      getPath: () => '/api/chat',
      getUrl: () => req.url,
      getAcceptHeader: () => req.headers.get('accept') ?? '',
      getUserAgent: () => req.headers.get('user-agent') ?? '',
    },
    path: '/api/chat',
    method: 'POST',
  });

  console.log('[x402] processHTTPRequest result type:', result.type);

  if (result.type === 'payment-error') {
    const r = result.response;
    console.log('[x402] payment-error — status:', r.status);
    console.log('[x402] payment-error — response body:', JSON.stringify(r.body));
    console.log('[x402] payment-error — response headers:', JSON.stringify(r.headers));

    if (hasPayment) {
      // Payment was provided but rejected — decode the error from headers or body
      let reason = 'Payment verification failed';
      const rawBody = r.body as Record<string, unknown> | null | undefined;
      if (rawBody?.error) reason = String(rawBody.error);

      const headerEntries = Object.entries(r.headers as Record<string, string>);
      const reqHeader = headerEntries.find(([k]) => k.toLowerCase() === 'payment-required')?.[1];
      if (reqHeader) {
        try {
          const decoded = JSON.parse(Buffer.from(reqHeader, 'base64').toString()) as { error?: string };
          console.log('[x402] Decoded PAYMENT-REQUIRED header:', JSON.stringify(decoded, null, 2));
          if (decoded.error) reason = decoded.error;
        } catch (e) {
          console.error('[x402] Failed to decode PAYMENT-REQUIRED header:', e);
        }
      }

      console.error('[x402] ❌ Payment REJECTED — reason:', reason);
      return new NextResponse(JSON.stringify({ error: reason }), {
        status: r.status,
        headers: { 'Content-Type': 'application/json', ...r.headers },
      });
    }

    // Initial 402 — no payment provided yet, return requirements to client
    console.log('[x402] No payment provided — returning 402 with requirements');
    return new NextResponse(JSON.stringify(r.body ?? {}), {
      status: r.status,
      headers: { 'Content-Type': 'application/json', ...r.headers },
    });
  }

  if (result.type !== 'payment-verified') {
    console.error('[x402] Unexpected result type:', result.type);
    return NextResponse.json({ error: 'Route not configured' }, { status: 500 });
  }

  console.log('[x402] ✅ Payment VERIFIED');
  console.log('[x402] paymentPayload:', JSON.stringify(result.paymentPayload, null, 2));
  console.log('[x402] paymentRequirements:', JSON.stringify(result.paymentRequirements, null, 2));

  const { message } = await req.json();
  console.log('[x402] Message body received:', message);

  console.log('[x402] Calling processSettlement …');
  const settle = await httpServer.processSettlement(
    result.paymentPayload,
    result.paymentRequirements,
  );

  console.log('[x402] Settlement result — success:', settle.success);
  if (!settle.success) {
    console.error('[x402] ❌ Settlement FAILED — reason:', settle.errorReason);
    console.error('[x402] Settlement error message:', settle.errorMessage ?? '(none)');
    console.error('[x402] Settlement full result:', JSON.stringify(settle, null, 2));
    return NextResponse.json(
      { error: settle.errorReason ?? 'Settlement failed' },
      { status: 402, headers: settle.headers },
    );
  }

  console.log('[x402] ✅ Settlement OK — tx:', settle.transaction, '| network:', settle.network);
  return NextResponse.json(
    { reply: `Message received: ${message}` },
    { headers: settle.headers },
  );
}
