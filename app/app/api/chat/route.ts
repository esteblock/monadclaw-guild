import { NextRequest, NextResponse } from 'next/server';
import { x402ResourceServer, HTTPFacilitatorClient } from '@x402/core/server';
import { x402HTTPResourceServer, decodePaymentSignatureHeader } from '@x402/core/http';
import { registerExactEvmScheme } from '@x402/evm/exact/server';

// Force dynamic rendering — prevents Next.js 14 from caching outbound fetch calls
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const FACILITATOR_URL = 'https://x402-facilitator.molandak.org';
const NETWORK = 'eip155:10143' as const; // Monad testnet
const USDC_ASSET = '0x534b2f3A21130d7a60830c2Df862319e593943A3';

console.log('[x402] Phase 4 route — facilitator:', FACILITATOR_URL);
console.log('[x402] WALLET_ADDRESS env:', process.env.WALLET_ADDRESS ?? '⚠️  NOT SET');

const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const resourceServer = new x402ResourceServer(facilitator);
registerExactEvmScheme(resourceServer);
// httpServer is used only for processSettlement — no route config needed
const httpServer = new x402HTTPResourceServer(resourceServer, {});

/**
 * Phase 4: per-character pricing.
 * The response is generated first, its character count determines the exact USDC price,
 * and the 402 is returned with that amount. The client pays exactly that and retries.
 */
function computeResponse(message: string) {
  const responseText = `Message received: ${message}`;
  const charCount = message.length; // bill on the user's message, not the wrapper prefix
  // $0.00001 USDC per character = 10 units/char (USDC has 6 decimals); minimum 1 unit
  // Compute units as integer first, then derive priceUSDC to avoid floating-point noise
  const priceUnitsNum = Math.max(1, charCount * 10);
  const priceUSDC = priceUnitsNum / 1_000_000;
  const priceUnits = String(priceUnitsNum);
  return { responseText, charCount, priceUSDC, priceUnits };
}

export async function POST(req: NextRequest) {
  console.log('\n[x402] ─── Incoming POST /api/chat ───');

  const { message, walletAddress } = await req.json();
  const { responseText, charCount, priceUSDC, priceUnits } = computeResponse(message);

  console.log(`[x402] response="${responseText}" | chars=${charCount} | price=$${priceUSDC} USDC (${priceUnits} units)`);

  const paymentHeader = req.headers.get('payment-signature') ?? req.headers.get('x-payment');

  // ── First request: no payment yet ───────────────────────────────────────────
  if (!paymentHeader) {
    const paymentRequired = {
      x402Version: 2,
      error: 'Payment required',
      resource: { url: req.url, description: 'MonadClaw Guild chat message', mimeType: '' },
      accepts: [{
        scheme: 'exact',
        network: NETWORK,
        amount: priceUnits,
        asset: USDC_ASSET,
        payTo: process.env.WALLET_ADDRESS!,
        maxTimeoutSeconds: 300,
        extra: { name: 'USDC', version: '2' },
      }],
    };

    const encoded = Buffer.from(JSON.stringify(paymentRequired)).toString('base64');

    console.log(`[x402] → 402  chars=${charCount}  price=$${priceUSDC} USDC`);

    return new NextResponse(
      JSON.stringify({ charCount, priceUSDC }),
      {
        status: 402,
        headers: { 'Content-Type': 'application/json', 'PAYMENT-REQUIRED': encoded },
      },
    );
  }

  // ── Retry with payment: verify then settle ───────────────────────────────────
  console.log('[x402] Payment header present — decoding …');

  let paymentPayload: unknown;
  try {
    paymentPayload = decodePaymentSignatureHeader(paymentHeader);
  } catch {
    return NextResponse.json({ error: 'Invalid payment header' }, { status: 400 });
  }

  const requirements = {
    scheme: 'exact' as const,
    network: NETWORK,
    amount: priceUnits,
    asset: USDC_ASSET,
    payTo: process.env.WALLET_ADDRESS!,
    maxTimeoutSeconds: 300,
    extra: { name: 'USDC', version: '2' },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const verifyResult = await resourceServer.verifyPayment(paymentPayload as any, requirements);
  console.log('[x402] verifyResult:', JSON.stringify(verifyResult));

  if (!verifyResult.isValid) {
    console.error('[x402] ❌ Verify failed:', verifyResult.invalidReason);
    return NextResponse.json({ error: verifyResult.invalidReason ?? 'Payment invalid' }, { status: 402 });
  }

  console.log('[x402] ✅ Verified — settling …');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settle = await httpServer.processSettlement(paymentPayload as any, requirements as any);

  if (!settle.success) {
    console.error('[x402] ❌ Settlement failed:', settle.errorReason);
    return NextResponse.json(
      { error: settle.errorReason ?? 'Settlement failed' },
      { status: 402, headers: settle.headers },
    );
  }

  console.log(`[x402] ✅ Settled — tx=${settle.transaction} | chars=${charCount} | $${priceUSDC} USDC`);

  // ── Call OpenClaw agent (falls back to hardcoded reply if not configured) ──
  let replyText: string;
  const ocUrl = process.env.OPENCLAW_GATEWAY_URL;

  if (ocUrl) {
    const sessionKey = 'agent:main:main';
    console.log(`[openclaw] calling sessions_send | session=${sessionKey}`);
    try {
      const ocRes = await fetch(`${ocUrl}/tools/invoke`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENCLAW_GATEWAY_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tool: 'sessions_send',
          args: { sessionKey, message, timeoutSeconds: 60 },
        }),
        signal: AbortSignal.timeout(65_000),
      });

      if (!ocRes.ok) {
        const errBody = await ocRes.text();
        console.error(`[openclaw] gateway error ${ocRes.status}:`, errBody);
        replyText = 'Agent não respondeu. Tente novamente.';
      } else {
        const ocJson = await ocRes.json();
        const details = ocJson?.result?.details;
        const agentReply = details?.reply ?? ocJson?.result?.reply;
        if (agentReply) {
          console.log('[openclaw] reply:', agentReply);
          replyText = agentReply;
        } else if (details?.status === 'timeout') {
          console.error('[openclaw] session timeout — session:', details?.sessionKey);
          replyText = 'Agent demorou demais para responder. Tente novamente.';
        } else {
          console.error('[openclaw] no reply — full response:', JSON.stringify(ocJson));
          replyText = 'Agent não respondeu. Tente novamente.';
        }
      }
    } catch (err) {
      console.error('[openclaw] fetch failed:', err);
      replyText = 'Agent não respondeu. Tente novamente.';
    }
  } else {
    replyText = responseText; // fallback: "Message received: [text]"
  }

  return NextResponse.json(
    { reply: replyText, charCount, priceUSDC },
    { headers: settle.headers },
  );
}
