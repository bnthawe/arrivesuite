import { NextResponse } from 'next/server';
import { z } from 'zod';

// WhatsApp Cloud API inbound webhook.
// Handles verification (GET) and incoming messages (POST).
// Message routing: suppliers can reply with commands like:
//   "confirm <booking_ref>" / "decline <booking_ref>"
//   "availability <property> <date> <units>"
//   "payout confirm <payout_id>"

const verifySchema = z.object({
  'hub.mode': z.string(),
  'hub.verify_token': z.string(),
  'hub.challenge': z.string(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN ?? 'arrivesuite-verify';

  if (mode === 'subscribe' && token === expectedToken && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Log the inbound message for now. Full routing (confirm/decline/availability/payout)
  // will be implemented per-command as the supplier flows are built out.
  console.log('[whatsapp-webhook] inbound:', JSON.stringify(body).slice(0, 500));

  // Always return 200 to acknowledge receipt (Meta retries on non-2xx)
  return NextResponse.json({ ok: true });
}