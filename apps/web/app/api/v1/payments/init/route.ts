import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { auditEvents, bookings, db, paymentIntents } from '@arrivesuite/db';
import { initializePaystackTransaction } from '@arrivesuite/integrations';
import { traceIdFromRequest } from '@/lib/bookings-core';

const initSchema = z.object({
  bookingRef: z.string().min(1).max(16),
  email: z.string().email().max(255),
  traceId: z.string().max(100).optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = initSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const traceId = traceIdFromRequest(request, parsed.data.traceId);
  const idempotencyKey = request.headers.get('Idempotency-Key')?.slice(0, 100) ?? null;

  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.ref, parsed.data.bookingRef.trim()))
    .limit(1);
  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  const dueCents = booking.totalCents - booking.paidCents;
  if (dueCents <= 0) {
    return NextResponse.json({ error: 'Booking already paid in full' }, { status: 409 });
  }

  if (idempotencyKey) {
    const [existing] = await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.idempotencyKey, idempotencyKey))
      .limit(1);
    if (existing) {
      return NextResponse.json(
        {
          intentId: existing.id,
          reference: existing.providerRef,
          amountMinor: existing.amountCents,
          currency: existing.currency,
          state: existing.state,
          replayed: true,
        },
        { headers: { 'Idempotent-Replayed': 'true' } },
      );
    }
  }

  const reference = `ARS-PAY-${Date.now().toString(36).toUpperCase()}`;
  const [intent] = await db
    .insert(paymentIntents)
    .values({
      bookingId: booking.id,
      amountCents: dueCents,
      currency: booking.currency,
      method: 'paystack',
      providerRef: reference,
      idempotencyKey,
      expiresAt: new Date(Date.now() + 60 * 60_000),
    })
    .returning();

  let initialized;
  try {
    initialized = await initializePaystackTransaction(
      {
        email: parsed.data.email,
        amountMinor: dueCents,
        currency: booking.currency,
        reference,
      },
    );
  } catch (err) {
    // Don't leave a requires_payment intent behind a failed provider call.
    await db.update(paymentIntents).set({ state: 'failed' }).where(eq(paymentIntents.id, intent.id));
    return NextResponse.json({ error: 'Payment provider unavailable' }, { status: 502 });
  }

  await db.insert(auditEvents).values({
    actorRealm: null,
    action: 'payment_intent.created',
    entityType: 'payment_intent',
    entityId: intent.id,
    diff: { bookingId: booking.id, reference, amountCents: dueCents },
    traceId,
  });

  return NextResponse.json(
    {
      intentId: intent.id,
      authorizationUrl: initialized.authorizationUrl,
      accessCode: initialized.accessCode,
      reference: initialized.reference,
      amountMinor: dueCents,
      currency: booking.currency,
    },
    { status: 201 },
  );
}
