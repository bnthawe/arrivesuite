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
  const pricing = offers.map((offer) => {
    const item = pricedById.get(offer.offerId);
    return {
      offerId: offer.offerId,
      netCents: item?.netCents ?? null,
      markupCents: item?.markupCents ?? null,
      totalCents: item ? item.netCents + item.markupCents : null,
      currency: parsed.data.currency,
    };
  });

  for (const offer of offers) {
    await cacheOffer(
      offer.offerId,
      { kind: 'flight', offer, currency: parsed.data.currency },
      { origin: offer.origin ?? parsed.data.origin, destination: offer.destination ?? parsed.data.destination },
    );
  }
  return NextResponse.json({ offers, pricing, medianLatencyMs });
}
