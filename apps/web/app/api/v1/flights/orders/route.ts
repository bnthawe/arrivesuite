import { NextResponse } from 'next/server';
import { z } from 'zod';
import { flightOrderRequestSchema } from '@arrivesuite/types';
import { createFlightOrder } from '@arrivesuite/integrations';
import { getCachedOffer } from '@/lib/prebooks';
import { applyRouteMarkup } from '@/lib/route-pricing';
import { createBooking, resolveGuestAccount, traceIdFromRequest } from '@/lib/bookings-core';
import { withIdempotency } from '@/lib/idempotency';
import { sendBookingConfirmation } from '@/lib/notifications';
import { qrDataUrl, qrPngBuffer, verifyUrlFor } from '@/lib/qr';
import { generateVoucherPdf, voucherPathFor } from '@/lib/vouchers';

const orderSchema = flightOrderRequestSchema.extend({
  accountId: z.string().uuid().optional(),
  traceId: z.string().max(100).optional(),
  quoteToken: z.string().min(1).optional(),
  agencyId: z.string().uuid().optional(),
  segment: z.enum(['b2c', 'b2b', 'agent', 'govt']).default('b2c'),
});

export async function POST(request: Request) {
  return withIdempotency(request, { scope: 'flights.order' }, () => handlePost(request));
}

async function handlePost(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = orderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const traceId = traceIdFromRequest(request, input.traceId);

  const cached = await getCachedOffer(input.offerId);
  if (!cached || cached.kind !== 'flight') {
    return NextResponse.json({ error: 'Offer unknown or expired — search again' }, { status: 404 });
  }

  const order = await createFlightOrder({
    offerId: input.offerId,
    paymentToken: input.paymentToken,
    passengers: input.passengers,
  });

  const guestEmail = input.guestInfo?.email;
  if (!input.accountId && !guestEmail) {
    return NextResponse.json({ error: 'accountId or guestInfo.email is required' }, { status: 400 });
  }
  const account = input.accountId
    ? null
    : await resolveGuestAccount(
        guestEmail!,
        input.guestInfo ? `${input.guestInfo.firstName} ${input.guestInfo.lastName}` : null,
      );

  const [priced] = await applyRouteMarkup(
    [
      {
        itemType: 'flight',
        itemRef: input.offerId,
        netCents: cached.offer.baseMinor ?? 0,
        origin: cached.route?.origin,
        destination: cached.route?.destination,
      },
    ],
    input.segment,
  );

  const result = await createBooking({
    accountId: input.accountId ?? account!.id,
    channel: 'web',
    currency: cached.currency,
    items: [
      {
        itemType: 'flight',
        itemRef: input.offerId,
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
          itemRef: input.offerId,
          commissionCents: priced.markupCents,
          routePctBps: priced.applied.routeRule.pctBps,
          routeFixedCents: priced.applied.routeRule.fixedCents,
          channel: priced.applied.channel,
          channelMode: priced.applied.channelMode,
        },
      ],
    },
    traceId,
    idempotencyKey: request.headers.get('Idempotency-Key')?.slice(0, 100) ?? `flight-${input.offerId}`,
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
    phone: input.guestInfo?.phone ?? null,
    arsRef: booking.ref,
    totalLine: `${booking.currency} ${(booking.totalCents / 100).toFixed(2)}`,
    traceId,
    bookingId: booking.id,
  });
  try {
    await generateVoucherPdf({
      ref: booking.ref,
      status: booking.status,
      currency: booking.currency,
      subtotalCents: booking.subtotalCents,
      taxCents: booking.taxCents,
      totalCents: booking.totalCents,
      traceId: booking.traceId,
      guestName: input.guestInfo ? `${input.guestInfo.firstName} ${input.guestInfo.lastName}` : null,
      verifyUrl,
      qrPng: qrPngBuffer(qr),
      providerRefs: [{ kind: 'flight', providerRef: order.orderId, status: 'confirmed' }],
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
      orderId: order.orderId,
      pnr: order.pnr,
      ticket: order.ticket,
      pdf: order.pdf,
      arsRef: booking.ref,
      voucher: voucherPathFor(booking.ref),
      qrDataUrl: qr,
    },
    { status: 201 },
  );
}
