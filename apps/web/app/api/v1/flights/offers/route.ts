import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { flightSearchRequestSchema } from '@arrivesuite/types';
import { searchFlightOffers } from '@arrivesuite/integrations';
import { cacheOffer } from '@/lib/prebooks';
import { applyRouteMarkup } from '@/lib/route-pricing';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = flightSearchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { offers, medianLatencyMs } = await searchFlightOffers(parsed.data);

  // Search results show the same retail total the detail page and checkout
  // will use. The client never computes markup from the provider's net fare.
  const quotable = offers.filter((offer) => offer.baseMinor != null);
  const priced = await applyRouteMarkup(
    quotable.map((offer) => ({
      itemType: 'flight',
      itemRef: offer.offerId,
      netCents: offer.baseMinor ?? 0,
      origin: offer.origin ?? parsed.data.origin,
      destination: offer.destination ?? parsed.data.destination,
    })),
    'b2c',
  );
  const pricedById = new Map(priced.map((item) => [item.itemRef, item]));
  const cachedOffers: typeof offers = [];
  const pricing: Array<{
    offerId: string;
    netCents: number | null;
    markupCents: number | null;
    totalCents: number | null;
    currency: string;
  }> = [];

  for (const offer of offers) {
    // `offerId` on the wire is an opaque, search-scoped cache key. Sandbox
    // provider ids are reused across searches, so keying the payment-first
    // flow by the provider id lets concurrent searches overwrite each other's
    // occupancy and route. The provider token stays inside the cached offer
    // and is what the order API receives.
    const cacheKey = `ars_off_${randomUUID()}`;
    const cached = {
      kind: 'flight' as const,
      offer,
      currency: parsed.data.currency,
      occupancy: {
        adults: parsed.data.adults,
        children: parsed.data.children.length,
        infants: parsed.data.infants,
      },
    };
    const route = {
      origin: offer.origin ?? parsed.data.origin,
      destination: offer.destination ?? parsed.data.destination,
    };
    await cacheOffer(cacheKey, cached, route);
    // The legacy cart path still resolves offers by provider id. Keep that
    // copy for compatibility; the payment-first checkout uses the unique key.
    await cacheOffer(offer.offerId, cached, route);

    const item = pricedById.get(offer.offerId);
    cachedOffers.push({ ...offer, offerId: cacheKey });
    pricing.push({
      offerId: cacheKey,
      netCents: item?.netCents ?? null,
      markupCents: item?.markupCents ?? null,
      totalCents: item ? item.netCents + item.markupCents : null,
      currency: parsed.data.currency,
    });
  }

  return NextResponse.json({ offers: cachedOffers, pricing, medianLatencyMs });
}
