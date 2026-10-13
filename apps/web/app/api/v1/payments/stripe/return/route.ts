import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, paymentIntents } from '@arrivesuite/db';

// Stripe redirects here after Checkout. Capture itself arrives via the
// webhook; this endpoint reports intent state for return-page polling.
export async function GET(request: Request) {
  const ref = new URL(request.url).searchParams.get('ref');
  if (!ref) {
    return NextResponse.json({ error: 'ref is required' }, { status: 400 });
  }
  const [intent] = await db
    .select()
    .from(paymentIntents)
    .where(eq(paymentIntents.providerRef, ref))
    .limit(1);
  if (!intent) {
    return NextResponse.json({ error: 'Unknown payment reference' }, { status: 404 });
  }
  return NextResponse.json({
    state: intent.state,
    paid: intent.state === 'captured',
    amountMinor: intent.amountCents,
    currency: intent.currency,
  });
}
