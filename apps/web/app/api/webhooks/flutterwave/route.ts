import { NextResponse } from 'next/server';
import { flutterwaveWebhookEventSchema } from '@arrivesuite/types';
import { verifyFlutterwaveWebhook } from '@arrivesuite/integrations';
import { auditEvents, db } from '@arrivesuite/db';
import { traceIdFromRequest } from '@/lib/bookings-core';
import { capturePaymentByProviderRef } from '@/lib/payments-capture';

// Flutterwave server webhook: verif-hash must equal the secret key.
// tx_ref is the idempotency key (same replay semantics as Paystack).
export async function POST(request: Request) {
  if (!verifyFlutterwaveWebhook(request.headers.get('verif-hash'))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = flutterwaveWebhookEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const event = parsed.data;
  const traceId = traceIdFromRequest(request);
  const txRef = event.txRef ?? event.tx_ref!;

  if (event.status !== 'successful') {
    await db.insert(auditEvents).values({
      action: 'payment.webhook_received',
      entityType: 'payment',
      entityId: txRef,
      diff: { event: event.event ?? 'unknown', status: event.status },
      traceId,
    });
    return NextResponse.json({ ok: true });
  }

  const result = await capturePaymentByProviderRef({
    providerRef: txRef,
    amountCents: Math.round(event.amount * 100),
    currency: event.currency,
    providerPaymentId: event.id ? String(event.id) : null,
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
