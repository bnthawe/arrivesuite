import type { FlightOffer, HotelOffer } from '@arrivesuite/types';
import { getRedis } from './redis';

// Single cart, single ARS ref, single voucher (contract v1.0 §4).
// Carts live in Redis with a TTL (go-live "cart expiry cron" is this TTL
// plus the worker sweep); items carry server-side snapshots, never prices.
const CART_TTL_SECONDS = 30 * 60;

export interface CartItemSnapshot {
  kind: 'hotel' | 'flight';
  offerId: string;
  label: string;
  netCents: number;
  markupCents: number;
  currency: string;
  origin?: string;
  destination?: string;
}

export interface Cart {
  id: string;
  items: CartItemSnapshot[];
  currency: string;
  createdAt: string;
}

export function cartTotals(cart: Cart): { subtotalCents: number; totalCents: number } {
  const subtotalCents = cart.items.reduce((s, i) => s + i.netCents + i.markupCents, 0);
  return { subtotalCents, totalCents: subtotalCents };
}

export async function getCart(id: string): Promise<Cart | null> {
  const raw = await getRedis().get(`cart:${id}`);
  if (!raw) return null;
  return JSON.parse(raw) as Cart;
}

// Seconds until the cart expires (for the live countdown tick).
export async function getCartTtlSeconds(id: string): Promise<number | null> {
  const ttl = await getRedis().ttl(`cart:${id}`);
  return ttl >= 0 ? ttl : null;
}

async function saveCart(cart: Cart): Promise<void> {
  await getRedis().set(`cart:${cart.id}`, JSON.stringify(cart), 'EX', CART_TTL_SECONDS);
}

export async function addCartItem(
  cartId: string,
  item: CartItemSnapshot,
): Promise<Cart> {
  const existing = (await getCart(cartId)) ?? {
    id: cartId,
    items: [],
    currency: item.currency,
    createdAt: new Date().toISOString(),
  };
  existing.items.push(item);
  await saveCart(existing);
  return existing;
}

export async function clearCart(id: string): Promise<void> {
  await getRedis().del(`cart:${id}`);
}

export function snapshotFromHotelOffer(offer: HotelOffer, currency: string): CartItemSnapshot {
  return {
    kind: 'hotel',
    offerId: offer.offerId,
    label: offer.name,
    netCents: offer.net,
    markupCents: Math.max(0, offer.retail - offer.net),
    currency,
  };
}

export function snapshotFromFlightOffer(
  offer: FlightOffer,
  currency: string,
  route?: { origin: string; destination: string },
): CartItemSnapshot {
  return {
    kind: 'flight',
    offerId: offer.offerId,
    label: offer.flight,
    netCents: offer.baseMinor ?? 0,
    markupCents: 0,
    currency,
    origin: route?.origin,
    destination: route?.destination,
  };
}
