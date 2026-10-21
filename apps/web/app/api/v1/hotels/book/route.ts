import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guestInfoSchema } from '@arrivesuite/types';
import { bookRate } from '@arrivesuite/integrations';
import { consumePrebookHold, getCachedOffer } from '@/lib/prebooks';
import { applyRouteMarkup } from '@/lib/route-pricing';
import { createBooking, resolveGuestAccount, traceIdFromRequest } from '@/lib/bookings-core';
import { withIdempotency } from '@/lib/idempotency';
import { sendBookingConfirmation } from '@/lib/notifications';
import { qrDataUrl, qrPngBuffer, verifyUrlFor } from '@/lib/qr';
import { generateVoucherPdf, voucherPathFor } from '@/lib/vouchers';

const bookSchema = z.object({
  prebookId: z.string().min(1),
  guestInfo: guestInfoSchema,
  payment: z.object({ method: z.literal('TRANSACTION_ID'), transactionId: z.string().min(1) }),
  accountId: z.string().uuid().optional(),
  traceId: z.string().max(100).optional(),
  quoteToken: z.string().min(1).optional(),
  agencyId: z.string().uuid().optional(),
  segment: z.enum(['b2c', 'b2b', 'agent', 'govt']).default('b2c'),
});

export async function POST(request: Request) {
  return withIdempotency(request, { scope: 'hotels.book', audit: false }, () => handlePost(request));
}

async function handlePost(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = bookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const traceId = traceIdFromRequest(request, input.traceId);

  const hold = await consumePrebookHold(input.prebookId);
  if (!hold) {
    return NextResponse.json({ error: 'Prebook expired or unknown — search and prebook again' }, { status: 410 });
  }
  const cached = await getCachedOffer(hold.offerId);
  if (!cached || cached.kind !== 'hotel') {
    return NextResponse.json({ error: 'Offer expired — search again' }, { status: 410 });
  }
  const offer = cached.offer;

  const provider = await bookRate({
    prebookId: hold.prebookId,
    guestInfo: input.guestInfo,
    payment: input.payment,
  });

  const account = input.accountId
    ? null
    : await resolveGuestAccount(
        input.guestInfo.email,
        `${input.guestInfo.firstName} ${input.guestInfo.lastName}`,
      );

  // Totals come from the route engine over the held snapshot, never the client.
  const [priced] = await applyRouteMarkup(
    [{ itemType: 'hotel', itemRef: offer.hotelId, netCents: offer.net }],
    input.segment,
  );
  const result = await createBooking({
    accountId: input.accountId ?? account!.id,
    channel: 'web',
    currency: cached.currency,
    items: [
      {
        itemType: 'hotel',
        itemRef: offer.hotelId,
        itemSupplierType: 'sourced',
        quantity: 1,
        netCents: priced.netCents,
        markupCents: priced.markupCents,
      },
    ],
    pricingMeta: {
      segment: input.segment,
      rules: [
        {
          itemRef: offer.hotelId,
          commissionCents: priced.markupCents,
          routePctBps: priced.applied.routeRule.pctBps,
          routeFixedCents: priced.applied.routeRule.fixedCents,
          channel: priced.applied.channel,
          channelMode: priced.applied.channelMode,
        },
      ],
    },
    traceId,
    idempotencyKey: request.headers.get('Idempotency-Key')?.slice(0, 100) ?? `hotel-${hold.prebookId}`,
    quoteToken: input.quoteToken ?? null,
    agencyId: input.agencyId ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const booking = result.created.booking;
  const verifyUrl = verifyUrlFor(booking.ref);
  const qr = await qrDataUrl(verifyUrl);
  await sendBookingConfirmation({
    phone: input.guestInfo.phone,
    arsRef: booking.ref,
    totalLine: `${booking.currency} ${(booking.totalCents / 100).toFixed(2)}`,
    traceId,
    bookingId: booking.id,
  });
  let voucher = voucherPathFor(booking.ref);
  try {
    voucher = await generateVoucherPdf({
      ref: booking.ref,
      status: booking.status,
      currency: booking.currency,
      subtotalCents: booking.subtotalCents,
      taxCents: booking.taxCents,
      totalCents: booking.totalCents,
      traceId: booking.traceId,
      guestName: `${input.guestInfo.firstName} ${input.guestInfo.lastName}`,
      verifyUrl,
      qrPng: qrPngBuffer(qr),
      providerRefs: [{ kind: 'hotel', providerRef: provider.bookingId, status: provider.status }],
      items: result.created.items.map((i) => ({
        label: i.itemRef,
        itemRef: i.itemRef,
        quantity: i.quantity,
        totalCents: i.totalCents,
        status: i.status,
      })),
    });
  } catch (err) {
    console.error('[vouchers] generation failed, returning path only', err);
  }

  return NextResponse.json(
    {
      bookingId: provider.bookingId,
      status: provider.status,
      arsRef: booking.ref,
      voucher,
      qrDataUrl: qr,
    },
    { status: 201 },
  );
}
