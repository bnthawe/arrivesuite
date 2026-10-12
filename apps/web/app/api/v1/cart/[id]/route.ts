import { NextResponse } from 'next/server';
import { cartTotals, getCart } from '@/lib/cart';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cart = await getCart(id);
  if (!cart) {
    return NextResponse.json({ error: 'Cart empty or expired' }, { status: 404 });
  }
  return NextResponse.json({ cart, ...cartTotals(cart) });
}
