import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guestInfoSchema } from '@arrivesuite/types';
import { bookRate, createFlightOrder, prebookRate } from '@arrivesuite/integrations';
import { clearCart, getCart } from '@/lib/cart';
import { getCachedOffer } from '@/lib/prebooks';
import { applyRouteMarkup } from '@/lib/route-pricing';
import { createBooking, resolveGuestAccount, traceIdFromRequest } from '@/lib/bookings-core';
import { sendBookingConfirmation } from '@/lib/notifications';
import { qrDataUrl, qrPngBuffer, verifyUrlFor } from '@/lib/qr';
import { generateVoucherPdf, voucherPathFor } from '@/lib/vouchers';

const checkoutSchema = z.object({
  guestInfo: guestInfoSchema,
  payment: z.object({ transactionId: z.string().min(1), paymentToken: z.string().min(1).optional() }),
  passengers: z.array(z.object({ type: z.enum(['ADT', 'CHD', 'INF']), age: z.number().int().min(0).max(120).optional() })).optional(),
  accountId: z.string().uuid().optional(),
  traceId: z.string().max(100).optional(),
  quoteToken: z.string().min(1).optional(),
  agencyId: z.string().uuid().optional(),
  segment: z.enum(['b2c', 'b2b', 'agent', 'govt']).default('b2c'),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const traceId = traceIdFromRequest(request, input.traceId);

  const cart = await getCart(id);
  if (!cart || cart.items.length === 0) {
    return NextResponse.json({ error: 'Cart empty or expired' }, { status: 404 });
  }

  // Revalidate every offer against the cache; one stale item fails the
  // whole checkout with the item identified (no partial charges).
  for (const item of cart.items) {
    const cached = await getCachedOffer(item.offerId);
    if (!cached) {
      return NextResponse.json(
        { error: `Offer expired: ${item.label} — search again and rebuild the cart` },
        { status: 409 },
      );
    }
  }

  const providerRefs: { kind: string; providerRef: string; status: string }[] = [];
  const pricedItems = await applyRouteMarkup(
    cart.items.map((item) => ({
      itemType: item.kind,
      itemRef: item.offerId,
      netCents: item.netCents,
      origin: item.origin,
      destination: item.destination,
    })),
    input.segment,
  );

  const bookingItems = [];

  for (let idx = 0; idx < cart.items.length; idx++) {
    const item = cart.items[idx];
    const priced = pricedItems[idx];
    if (item.kind === 'hotel') {
      const hold = await prebookRate({ offerId: item.offerId, usePaymentSdk: false });
      const booked = await bookRate({
        prebookId: hold.prebookId,
        guestInfo: input.guestInfo,
        payment: { method: 'TRANSACTION_ID', transactionId: input.payment.transactionId },
      });
      providerRefs.push({ kind: 'hotel', providerRef: booked.bookingId, status: booked.status });
      bookingItems.push({
        itemType: 'hotel',
        itemRef: item.offerId,
        itemSupplierType: 'sourced',
        quantity: 1,
        netCents: priced.netCents,
        markupCents: priced.markupCents,
      });
    } else {
      const order = await createFlightOrder({
        offerId: item.offerId,
        paymentToken: input.payment.paymentToken ?? input.payment.transactionId,
        passengers: input.passengers ?? [{ type: 'ADT' }],
      });
      providerRefs.push({ kind: 'flight', providerRef: order.orderId, status: 'confirmed' });
      bookingItems.push({
        itemType: 'flight',
        itemRef: item.offerId,
        itemSupplierType: 'sourced',
        quantity: 1,
        netCents: priced.netCents,
        markupCents: priced.markupCents,
      });
    }
  }

  const account = input.accountId
    ? null
    : await resolveGuestAccount(
        input.guestInfo.email,
        `${input.guestInfo.firstName} ${input.guestInfo.lastName}`,
      );

  const result = await createBooking({
    accountId: input.accountId ?? account!.id,
    channel: 'web',
    currency: cart.currency,
    items: bookingItems,
    pricingMeta: {
      segment: input.segment,
      rules: pricedItems.map((p, i) => ({
        itemRef: cart.items[i].offerId,
        commissionCents: p.markupCents,
        routePctBps: p.applied.routeRule.pctBps,
        routeFixedCents: p.applied.routeRule.fixedCents,
        channel: p.applied.channel,
        channelMode: p.applied.channelMode,
      })),
    },
    traceId,
    idempotencyKey: request.headers.get('Idempotency-Key')?.slice(0, 100) ?? `cart-${id}`,
    quoteToken: input.quoteToken ?? null,
    agencyId: input.agencyId ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await clearCart(id);

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
      providerRefs,
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
      arsRef: booking.ref,
      voucher,
      qrDataUrl: qr,
      providers: providerRefs,
      booking,
      items: result.created.items,
    },
    { status: 201 },
  );
}
