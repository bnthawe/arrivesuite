import { NextResponse } from 'next/server';
import { paystackWebhookEventSchema } from '@arrivesuite/types';
import { isChargeSuccess, verifyPaystackWebhook } from '@arrivesuite/integrations';
import { auditEvents, db } from '@arrivesuite/db';
import { traceIdFromRequest } from '@/lib/bookings-core';

// Paystack `charge.success`: signature verified BEFORE parsing, reference is
// the idempotency key (duplicate deliveries replay the same audit outcome).
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-paystack-signature');
  if (!verifyPaystackWebhook(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = paystackWebhookEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const traceId = traceIdFromRequest(request);
  await db.insert(auditEvents).values({
    action: isChargeSuccess(parsed.data) ? 'payment.captured' : 'payment.webhook_received',
    entityType: 'payment',
    entityId: parsed.data.data.reference,
    diff: {
      event: parsed.data.event,
      status: parsed.data.data.status,
      amount: parsed.data.data.amount,
      currency: parsed.data.data.currency,
    },
    traceId,
  });

  return NextResponse.json({ ok: true });
}
