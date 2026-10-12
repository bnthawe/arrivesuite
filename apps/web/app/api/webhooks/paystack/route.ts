import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { paystackWebhookEventSchema } from '@arrivesuite/types';
import { isChargeSuccess, verifyPaystackWebhook } from '@arrivesuite/integrations';
import { auditEvents, bookings, db, paymentIntents, payments } from '@arrivesuite/db';
import { traceIdFromRequest } from '@/lib/bookings-core';

// Paystack `charge.success`: signature verified BEFORE parsing. The intent
// reference is the idempotency key — duplicate deliveries find an already
// captured intent and replay without a second payment row (FR-5.17.7).
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

  const [intent] = await db
    .select()
    .from(paymentIntents)
    .where(eq(paymentIntents.providerRef, event.data.reference))
    .limit(1);
  if (!intent) {
    await db.insert(auditEvents).values({
      action: 'payment.webhook_unmatched',
      entityType: 'payment',
      entityId: event.data.reference,
      diff: { event: event.event, amount: event.data.amount },
      traceId,
    });
    return NextResponse.json({ error: 'Unknown payment reference' }, { status: 404 });
  }

  if (intent.state === 'captured') {
    return NextResponse.json({ ok: true, replayed: true });
  }

  const [payment] = await db
    .insert(payments)
    .values({
      intentId: intent.id,
      providerPaymentId: event.data.id ? String(event.data.id) : null,
      amountCents: event.data.amount,
      currency: event.data.currency.toUpperCase(),
      status: 'captured',
      capturedAt: new Date(),
    })
    .returning();

  await db.update(paymentIntents).set({ state: 'captured' }).where(eq(paymentIntents.id, intent.id));
  await db
    .update(bookings)
    .set({ paidCents: sql`${bookings.paidCents} + ${event.data.amount}` })
    .where(eq(bookings.id, intent.bookingId));

  await db.insert(auditEvents).values({
    action: 'payment.captured',
    entityType: 'payment',
    entityId: payment.id,
    diff: {
      intentId: intent.id,
      bookingId: intent.bookingId,
      reference: event.data.reference,
      amount: event.data.amount,
      currency: event.data.currency,
    },
    traceId,
  });

  return NextResponse.json({ ok: true, paymentId: payment.id });
}
