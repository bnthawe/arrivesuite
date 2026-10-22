import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { verifyDpoToken } from '@arrivesuite/integrations';
import { bookings, db, paymentIntents } from '@arrivesuite/db';
import { traceIdFromRequest } from './bookings-core';
import { capturePaymentByProviderRef } from './payments-capture';
import { signBookingAccess } from './booking-access';
import { fulfillPaidBooking } from './ticketing';

const returnSchema = z.object({
  TransToken: z.string().min(1).optional(),
  TransactionToken: z.string().min(1).optional(),
  CompanyRef: z.string().min(1).optional(),
});

function appBase(request: Request): string {
  return (process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? new URL(request.url).origin).replace(
    /\/$/,
    '',
  );
}

async function confirmationUrl(
  request: Request,
  bookingId: string,
  paymentState?: 'pending' | 'error',
): Promise<string | null> {
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!booking) return null;
  const ref = booking.ref.trim();
  let token: string;
  try {
    token = signBookingAccess(ref);
  } catch (err) {
    console.error('[payments.dpo.return] confirmation signing unavailable', err);
    return null;
  }
  const params = new URLSearchParams({ token });
  if (paymentState) params.set('payment', paymentState);
  return `${appBase(request)}/bookings/${encodeURIComponent(ref)}/confirmation?${params.toString()}`;
}

// DPO redirects to the return route with TransToken + CompanyRef. verifyToken
// confirms paid status (docs: verify within 30 min), then the shared capture
// path records it — same idempotency as webhooks. Browser checkouts use the
// /confirmation child route so the redirect flag is in the path, not a query
// string that DPO may need to append to.
export async function handleDpoReturn(
  request: Request,
  options: { forceRedirect?: boolean } = {},
): Promise<Response> {
  const url = new URL(request.url);
  const parsed = returnSchema.safeParse({
    TransToken: url.searchParams.get('TransToken') ?? undefined,
    TransactionToken: url.searchParams.get('TransactionToken') ?? undefined,
    CompanyRef: url.searchParams.get('CompanyRef') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const transToken = parsed.data.TransToken ?? parsed.data.TransactionToken;
  if (!transToken) {
    return NextResponse.json({ error: 'Transaction token required' }, { status: 400 });
  }
  const wantsRedirect =
    options.forceRedirect || url.searchParams.get('redirect') === '1';

  // Resolve the intent before verification so a browser can always reach a
  // confirmation screen, even when the payment is still pending or fails.
  const [intent] = await db
    .select()
    .from(paymentIntents)
    .where(eq(paymentIntents.providerRef, transToken))
    .limit(1);

  const traceId = traceIdFromRequest(request);
  let verification: Awaited<ReturnType<typeof verifyDpoToken>>;
  try {
    verification = await verifyDpoToken(transToken);
  } catch (err) {
    console.error('[payments.dpo.return] verification failed', err);
    if (wantsRedirect && intent) {
      const redirect = await confirmationUrl(request, intent.bookingId, 'pending');
      if (redirect) return NextResponse.redirect(redirect, 303);
    }
    return NextResponse.json(
      { error: 'Payment verification temporarily unavailable' },
      { status: 502 },
    );
  }
  if (!verification.paid) {
    if (wantsRedirect && intent) {
      const redirect = await confirmationUrl(request, intent.bookingId, 'pending');
      if (redirect) return NextResponse.redirect(redirect, 303);
    }
    return NextResponse.json(
      { ok: false, status: verification.resultExplanation || 'Not paid' },
      { status: 402 },
    );
  }

  // Live verifyToken carries the paid amount; sandbox does not, so the
  // intent's expected amount applies (capture still enforces equality).
  let amountCents: number;
  let currency: string;
  if (verification.amountMajor) {
    amountCents = Math.round(parseFloat(verification.amountMajor) * 100);
    currency = verification.currency ?? 'BWP';
  } else {
    if (!intent) {
      return NextResponse.json({ error: 'Unknown payment reference' }, { status: 404 });
    }
    amountCents = intent.amountCents;
    currency = intent.currency;
  }

  let result: Awaited<ReturnType<typeof capturePaymentByProviderRef>>;
  try {
    result = await capturePaymentByProviderRef({
      providerRef: transToken,
      amountCents,
      currency,
      providerPaymentId: verification.approval ?? null,
      traceId,
    });
  } catch (err) {
    console.error('[payments.dpo.return] capture failed', err);
    if (wantsRedirect && intent) {
      const redirect = await confirmationUrl(request, intent.bookingId, 'error');
      if (redirect) return NextResponse.redirect(redirect, 303);
    }
    return NextResponse.json({ error: 'Payment capture temporarily unavailable' }, { status: 502 });
  }
  if (!result.ok) {
    if (wantsRedirect && intent) {
      const redirect = await confirmationUrl(request, intent.bookingId, 'error');
      if (redirect) return NextResponse.redirect(redirect, 303);
    }
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  if (intent) {
    const fulfillment = await fulfillPaidBooking(intent.bookingId, traceId);
    if (!fulfillment.ok) {
      console.error('[payments.dpo.return] ticketing failed', fulfillment.error);
    }
    if (wantsRedirect) {
      const redirect = await confirmationUrl(request, intent.bookingId);
      if (redirect) return NextResponse.redirect(redirect, 303);
    }
  }

  return NextResponse.json({
    ok: true,
    paymentId: result.paymentId || undefined,
    replayed: result.replayed || undefined,
  });
}
