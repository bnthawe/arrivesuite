import { NextResponse } from 'next/server';
import { flightSearchRequestSchema } from '@arrivesuite/types';
import { searchFlightOffers } from '@arrivesuite/integrations';
import { cacheOffer } from '@/lib/prebooks';

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
  for (const offer of offers) {
    await cacheOffer(offer.offerId, { kind: 'flight', offer, currency: parsed.data.currency });
  }
  return NextResponse.json({ offers, medianLatencyMs });
}
