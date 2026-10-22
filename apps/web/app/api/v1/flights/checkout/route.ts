import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guestInfoSchema, passengerSchema } from '@arrivesuite/types';
import { getCachedOffer } from '@/lib/prebooks';
import { applyRouteMarkup } from '@/lib/route-pricing';
import { createBooking, resolveGuestAccount, traceIdFromRequest } from '@/lib/bookings-core';
import { withIdempotency } from '@/lib/idempotency';
import { signBookingAccess } from '@/lib/booking-access';

const checkoutPassengerSchema = passengerSchema.extend({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
});

const checkoutSchema = z.object({
  offerId: z.string().min(1).max(512),
  quoteToken: z.string().min(1),
  guestInfo: guestInfoSchema,
  passengers: z.array(checkoutPassengerSchema).min(1).max(9),
  traceId: z.string().max(100).optional(),
});

// Payment-first flight checkout. This creates the booking and passengers but
// deliberately does not call OnArrival: the provider order is created only
// after capture, by lib/ticketing.ts.
export async function POST(request: Request) {
  return withIdempotency(
    request,
    { scope: 'flights.checkout', required: true, audit: false },
    () => handlePost(request),
  );
}

async function handlePost(request: Request) {
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

  let cached: Awaited<ReturnType<typeof getCachedOffer>>;
  try {
    cached = await getCachedOffer(input.offerId);
  } catch (err) {
    console.error('[flights.checkout] offer cache unavailable', err);
    return NextResponse.json({ error: 'Checkout temporarily unavailable' }, { status: 503 });
  }

  if (!cached || cached.kind !== 'flight') {
    return NextResponse.json({ error: 'Offer expired — search again' }, { status: 409 });
  }
  const offer = cached.offer;
  if (offer.baseMinor == null) {
    return NextResponse.json({ error: 'Fare unavailable — search again' }, { status: 409 });
  }

  let priced: Awaited<ReturnType<typeof applyRouteMarkup>>[number];
  try {
    [priced] = await applyRouteMarkup(
      [
        {
          itemType: 'flight',
          itemRef: offer.offerId,
          netCents: offer.baseMinor,
          origin: offer.origin ?? cached.route?.origin,
          destination: offer.destination ?? cached.route?.destination,
        },
      ],
      'b2c',
    );
  } catch (err) {
    console.error('[flights.checkout] pricing failed', err);
    return NextResponse.json({ error: 'Checkout temporarily unavailable' }, { status: 503 });
  }

  const adults = input.passengers.filter((p) => p.type === 'ADT').length;
  const children = input.passengers.filter((p) => p.type === 'CHD').length;
  const infants = input.passengers.filter((p) => p.type === 'INF').length;
  // The cached fare was priced for the search occupancy. A changed count is a
  // different fare, so require a fresh search instead of silently reusing it.
  if (!cached.occupancy) {
    return NextResponse.json({ error: 'Offer expired — search again' }, { status: 409 });
  }
  if (
    adults !== cached.occupancy.adults ||
    children !== cached.occupancy.children ||
    infants !== cached.occupancy.infants
  ) {
    return NextResponse.json(
      { error: 'Traveller count changed — search again for the current fare' },
      { status: 409 },
    );
  }
  const startDate =
    offer.departureDate && /^\d{4}-\d{2}-\d{2}$/.test(offer.departureDate)
      ? new Date(`${offer.departureDate}T00:00:00.000Z`)
      : undefined;

  const account = await resolveGuestAccount(
    input.guestInfo.email,
    `${input.guestInfo.firstName} ${input.guestInfo.lastName}`,
  );

  const result = await createBooking({
    accountId: account.id,
    channel: 'web',
    currency: cached.currency,
    items: [
      {
        itemType: 'flight',
        itemRef: offer.offerId,
        itemSupplierType: 'sourced',
        quantity: 1,
        netCents: priced.netCents,
        markupCents: priced.markupCents,
        snapshot: {
          flightOffer: offer,
          route: cached.route ?? { origin: offer.origin, destination: offer.destination },
          ticketingDeadline: offer.ticketingDeadline ?? null,
          fulfillment: 'post_payment',
        },
        startDate,
        adults,
        children,
        infants,
      },
    ],
    guests: input.passengers.map((passenger, index) => ({
      guestType: passenger.type,
      firstName: passenger.firstName,
      lastName: passenger.lastName,
      dateOfBirth: passenger.dateOfBirth ?? null,
      passportNumber: passenger.passportNumber ?? null,
      nationality: passenger.nationality ?? null,
      email: index === 0 ? input.guestInfo.email : null,
      phoneE164: index === 0 ? input.guestInfo.phone : null,
      isLead: index === 0,
    })),
    pricingMeta: {
      segment: 'b2c',
      rules: [
        {
          itemRef: offer.offerId,
          commissionCents: priced.markupCents,
          routePctBps: priced.applied.routeRule.pctBps,
          routeFixedCents: priced.applied.routeRule.fixedCents,
          channel: priced.applied.channel,
          channelMode: priced.applied.channelMode,
        },
      ],
    },
    traceId,
    idempotencyKey: request.headers.get('Idempotency-Key')?.slice(0, 100) ?? null,
    quoteToken: input.quoteToken,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const booking = result.created.booking;
  let accessToken: string;
  try {
    accessToken = signBookingAccess(booking.ref);
  } catch (err) {
    console.error('[flights.checkout] booking access signing unavailable', err);
    return NextResponse.json(
      { error: 'Booking created but checkout could not be secured — contact support' },
      { status: 503 },
    );
  }
  const response = NextResponse.json(
    {
      arsRef: booking.ref,
      bookingId: booking.id,
      status: booking.status,
      currency: booking.currency,
      totalCents: booking.totalCents,
      accessToken,
    },
    { status: result.status },
  );
  if (result.created.replayed) response.headers.set('Idempotent-Replayed', 'true');
  return response;
}
