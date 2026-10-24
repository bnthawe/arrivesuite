import { NextResponse } from 'next/server';
import { routeInboundMessage } from '@/lib/whatsapp-routing';

// WhatsApp Cloud API inbound webhook.
// Handles verification (GET) and incoming messages (POST).
// Message routing: suppliers can reply with commands like:
//   "CONFIRM <booking_ref>" / "DECLINE <booking_ref> <reason>"
//   "availability <property> <date> <units>"
//   "payout confirm <payout_id>"

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

  try {
    const payload = body as Record<string, unknown>;
    const entry = (payload?.entry as Array<Record<string, unknown>>)?.[0];
    const changes = (entry?.changes as Array<Record<string, unknown>>)?.[0];
    const value = changes?.value as Record<string, unknown> | undefined;
    const messages = (value?.messages as Array<Record<string, unknown>>) || [];

    for (const message of messages) {
      if (message.type === 'text' && (message.text as Record<string, unknown>)?.body) {
        await routeInboundMessage({
          from: message.from as string,
          text: ((message.text as Record<string, unknown>).body) as string,
          messageId: message.id as string | undefined,
        });
      }
    }
  } catch (err) {
    console.error('[whatsapp-webhook] routing error', err);
  }

  // Always return 200 to acknowledge receipt (Meta retries on non-2xx)
  return NextResponse.json({ ok: true });
}