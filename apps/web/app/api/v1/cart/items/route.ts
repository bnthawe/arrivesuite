import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedOffer } from '@/lib/prebooks';
import { addCartItem, cartTotals, snapshotFromFlightOffer, snapshotFromHotelOffer } from '@/lib/cart';

const addItemSchema = z.object({
  cartId: z.string().min(1).max(100),
  kind: z.enum(['hotel', 'flight']),
  offerId: z.string().min(1),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = addItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const cached = await getCachedOffer(parsed.data.offerId);
  if (!cached || cached.kind !== parsed.data.kind) {
    return NextResponse.json({ error: 'Offer unknown or expired — search again' }, { status: 404 });
  }

  const snapshot =
    cached.kind === 'hotel'
      ? snapshotFromHotelOffer(cached.offer, cached.currency)
      : snapshotFromFlightOffer(cached.offer, cached.currency);
  const cart = await addCartItem(parsed.data.cartId, snapshot);
  return NextResponse.json({ cart, ...cartTotals(cart) }, { status: 201 });
}
