import { NextResponse } from 'next/server';
import { paystackWebhookEventSchema } from '@arrivesuite/types';
import { isChargeSuccess, verifyPaystackWebhook } from '@arrivesuite/integrations';
import { auditEvents, db } from '@arrivesuite/db';
import { traceIdFromRequest } from '@/lib/bookings-core';
import { capturePaymentByProviderRef } from '@/lib/payments-capture';

// Paystack `charge.success`: signature verified BEFORE parsing, reference is
// the idempotency key (duplicate deliveries replay — FR-5.17.7).
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
  const event = parsed.data;
  const traceId = traceIdFromRequest(request);

  if (!isChargeSuccess(event)) {
    await db.insert(auditEvents).values({
      action: 'payment.webhook_received',
      entityType: 'payment',
      entityId: event.data.reference,
      diff: { event: event.event, status: event.data.status },
      traceId,
    });
    return NextResponse.json({ ok: true });
  }

  const result = await capturePaymentByProviderRef({
    providerRef: event.data.reference,
    amountCents: event.data.amount,
    currency: event.data.currency,
    providerPaymentId: event.data.id ? String(event.data.id) : null,
    traceId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  if (result.replayed) {
    return NextResponse.json({ ok: true, replayed: true });
  }
  return NextResponse.json({ ok: true, paymentId: result.paymentId });
}
