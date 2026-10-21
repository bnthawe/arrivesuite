import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { auditEvents, bookings, db, paymentIntents } from '@arrivesuite/db';
import {
  createDpoToken,
  createStripeCheckoutSession,
  dpoHostedPageUrl,
  initializeFlutterwavePayment,
  initializePaystackTransaction,
} from '@arrivesuite/integrations';
import { traceIdFromRequest } from '@/lib/bookings-core';
import { withIdempotency } from '@/lib/idempotency';

const initSchema = z.object({
  bookingRef: z.string().min(1).max(16),
  email: z.string().email().max(255),
  method: z.enum(['paystack', 'dpo', 'flutterwave', 'stripe']).default('paystack'),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  traceId: z.string().max(100).optional(),
});

export async function POST(request: Request) {
  return withIdempotency(request, { scope: 'payments.init' }, () => handlePost(request));
}

async function handlePost(request: Request) {
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

  const method = parsed.data.method;
  const reference = `ARS-PAY-${Date.now().toString(36).toUpperCase()}`;
  const [intent] = await db
    .insert(paymentIntents)
    .values({
      bookingId: booking.id,
      amountCents: dueCents,
      currency: booking.currency,
      method,
      // Paystack webhooks echo our reference; DPO redirects echo the
      // TransToken, so it becomes the lookup key once known.
      providerRef: reference,
      idempotencyKey,
      expiresAt: new Date(Date.now() + 60 * 60_000),
    })
    .returning();

  const fail = async () => {
    // Don't leave a requires_payment intent behind a failed provider call.
    await db.update(paymentIntents).set({ state: 'failed' }).where(eq(paymentIntents.id, intent.id));
    return NextResponse.json({ error: 'Payment provider unavailable' }, { status: 502 });
  };

  if (method === 'dpo') {
    const appUrl = process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
    let token;
    try {
      token = await createDpoToken({
        amountMajor: (dueCents / 100).toFixed(2),
        currency: booking.currency,
        companyRef: reference,
        email: parsed.data.email,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        serviceDescription: `ArriveSuite booking ${booking.ref.trim()}`,
        redirectUrl: `${appUrl}/api/v1/payments/dpo/return`,
      });
    } catch {
      return fail();
    }
    await db.update(paymentIntents).set({ providerRef: token.transToken }).where(eq(paymentIntents.id, intent.id));
    await db.insert(auditEvents).values({
      actorRealm: null,
      action: 'payment_intent.created',
      entityType: 'payment_intent',
      entityId: intent.id,
      diff: { bookingId: booking.id, method, reference, transRef: token.transRef, amountCents: dueCents },
      traceId,
    });
    return NextResponse.json(
      {
        intentId: intent.id,
        authorizationUrl: dpoHostedPageUrl(token.transToken),
        reference: token.transToken,
        transRef: token.transRef,
        amountMinor: dueCents,
        currency: booking.currency,
      },
      { status: 201 },
    );
  }

  const appUrl = process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
  let authorizationUrl: string;
  let accessCode: string | undefined;
  let providerReference = reference;
  try {
    if (method === 'flutterwave') {
      const fw = await initializeFlutterwavePayment(
        { email: parsed.data.email, amountMinor: dueCents, currency: booking.currency, reference },
        `${appUrl}/api/v1/payments/flutterwave/return?ref=${reference}`,
      );
      authorizationUrl = fw.authorizationUrl;
      accessCode = fw.accessCode;
    } else if (method === 'stripe') {
      const st = await createStripeCheckoutSession(
        { email: parsed.data.email, amountMinor: dueCents, currency: booking.currency, reference },
        `${appUrl}/api/v1/payments/stripe/return?ref=${reference}`,
        `${appUrl}/cart`,
      );
      authorizationUrl = st.authorizationUrl;
      accessCode = st.accessCode;
      providerReference = st.reference;
    } else {
      const initialized = await initializePaystackTransaction(
        {
          email: parsed.data.email,
          amountMinor: dueCents,
          currency: booking.currency,
          reference,
        },
      );
      authorizationUrl = initialized.authorizationUrl;
      accessCode = initialized.accessCode;
      providerReference = initialized.reference;
    }
  } catch {
    return fail();
  }

  if (providerReference !== reference) {
    await db.update(paymentIntents).set({ providerRef: providerReference }).where(eq(paymentIntents.id, intent.id));
  }

  await db.insert(auditEvents).values({
    actorRealm: null,
    action: 'payment_intent.created',
    entityType: 'payment_intent',
    entityId: intent.id,
    diff: { bookingId: booking.id, method, reference: providerReference, amountCents: dueCents },
    traceId,
  });

  return NextResponse.json(
    {
      intentId: intent.id,
      authorizationUrl,
      accessCode,
      reference: providerReference,
      amountMinor: dueCents,
      currency: booking.currency,
    },
    { status: 201 },
  );
}
