import { NextResponse } from 'next/server';
import { isStripeCheckoutComplete, verifyStripeWebhook } from '@arrivesuite/integrations';
import { auditEvents, db } from '@arrivesuite/db';
import { traceIdFromRequest } from '@/lib/bookings-core';
import { capturePaymentByProviderRef } from '@/lib/payments-capture';

// Stripe webhook: timestamped HMAC verified before parsing; only
// checkout.session.completed with paid status captures, keyed on
// client_reference_id (our reference).
export async function POST(request: Request) {
  const rawBody = await request.text();
  const verified = verifyStripeWebhook(rawBody, request.headers.get('stripe-signature'));
  if (!verified) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  const traceId = traceIdFromRequest(request);

  if (verified.type !== 'checkout.session.completed') {
    await db.insert(auditEvents).values({
      action: 'payment.webhook_received',
      entityType: 'payment',
      entityId: verified.type,
      diff: { event: verified.type },
      traceId,
    });
    return NextResponse.json({ ok: true });
  }

  const session = isStripeCheckoutComplete(verified.object);
  if (!session?.client_reference_id || session.amount_total == null || !session.currency) {
    return NextResponse.json({ error: 'Incomplete session payload' }, { status: 400 });
  }

  const result = await capturePaymentByProviderRef({
    providerRef: session.client_reference_id,
    amountCents: session.amount_total,
    currency: session.currency,
    providerPaymentId: session.id,
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
