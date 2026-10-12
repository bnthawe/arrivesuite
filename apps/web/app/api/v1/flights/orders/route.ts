import { NextResponse } from 'next/server';
import { z } from 'zod';
import { flightOrderRequestSchema } from '@arrivesuite/types';
import { createFlightOrder } from '@arrivesuite/integrations';
import { getCachedOffer } from '@/lib/prebooks';
import { createBooking, resolveGuestAccount, traceIdFromRequest } from '@/lib/bookings-core';
import { generateVoucherPdf, voucherPathFor } from '@/lib/vouchers';

const orderSchema = flightOrderRequestSchema.extend({
  accountId: z.string().uuid().optional(),
  traceId: z.string().max(100).optional(),
});

export async function POST(request: Request) {
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
        netCents: cached.offer.baseMinor ?? 0,
      },
    ],
    traceId,
    idempotencyKey: request.headers.get('Idempotency-Key')?.slice(0, 100) ?? `flight-${input.offerId}`,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const booking = result.created.booking;
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
    },
    { status: 201 },
  );
}
