import { NextResponse } from 'next/server';
import { z } from 'zod';
import { mintQuote } from '@arrivesuite/pricing';
import { getCachedOffer } from '@/lib/prebooks';
import { applyRouteMarkup } from '@/lib/route-pricing';

const quoteRequestSchema = z.object({
  offerId: z.string().min(1).max(512),
});

// Server-side retail quote for a cached flight offer. The client sends only
// the offer id: net fare, route markup, and the signed total are resolved
// from the server-side offer snapshot.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = quoteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  let cached: Awaited<ReturnType<typeof getCachedOffer>>;
  try {
    cached = await getCachedOffer(parsed.data.offerId);
  } catch (err) {
    console.error('[flights.quote] offer cache unavailable', err);
    return NextResponse.json({ error: 'Pricing temporarily unavailable' }, { status: 503 });
  }

  if (!cached || cached.kind !== 'flight') {
    return NextResponse.json(
      { error: 'Offer expired — search again' },
      { status: 409 },
    );
  }

  const offer = cached.offer;
  if (offer.baseMinor == null) {
    return NextResponse.json(
      { error: 'Fare unavailable — search again' },
      { status: 409 },
    );
  }

  const [priced] = await applyRouteMarkup(
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

  const { token, quote } = mintQuote(
    [
      {
        itemType: priced.itemType,
        itemRef: priced.itemRef,
        quantity: 1,
        netCents: priced.netCents,
        markupCents: priced.markupCents,
        taxCents: priced.taxCents ?? 0,
      },
    ],
    cached.currency,
  );

  return NextResponse.json(
    {
      quoteToken: token,
      currency: quote.currency,
      netCents: priced.netCents,
      markupCents: priced.markupCents,
      taxCents: quote.taxCents,
      totalCents: quote.totalCents,
      expiresAt: new Date(quote.expiresAt).toISOString(),
    },
    { status: 201 },
  );
}
