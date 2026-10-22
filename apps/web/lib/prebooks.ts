import type { FlightOffer, HotelOffer } from '@arrivesuite/types';
import { getRedis, waitUntilRedisReady } from './redis';

// Offer snapshots are cached at search time (15 min TTL) so prebook/book
// can resolve an offerId without trusting client-supplied prices.
const OFFER_TTL_SECONDS = 15 * 60;

interface CachedHotelOffer {
  kind: 'hotel';
  offer: HotelOffer;
  currency: string;
  route?: { origin: string; destination: string };
}

interface CachedFlightOffer {
  kind: 'flight';
  offer: FlightOffer;
  currency: string;
  route?: { origin: string; destination: string };
  // The provider prices the fare for the search occupancy. Checkout must not
  // let a caller change the traveller count without a new search/quote.
  occupancy?: { adults: number; children: number; infants: number };
}

export type CachedOffer = CachedHotelOffer | CachedFlightOffer;

export async function cacheOffer(
  offerId: string,
  cached: CachedOffer,
  route?: { origin: string; destination: string },
): Promise<void> {
  const redis = getRedis();
  await waitUntilRedisReady(redis);
  await redis.set(`offer:${offerId}`, JSON.stringify({ ...cached, route }), 'EX', OFFER_TTL_SECONDS);
}

export async function getCachedOffer(offerId: string): Promise<CachedOffer | null> {
  const redis = getRedis();
  await waitUntilRedisReady(redis);
  const raw = await redis.get(`offer:${offerId}`);
  if (!raw) return null;
  return JSON.parse(raw) as CachedOffer;
}

export interface PrebookHold {
  prebookId: string;
  transactionId: string;
  offerId: string;
  expiresAt: string;
}

// Rate holds mirror the provider's 15-minute window (contract §2).
export async function savePrebookHold(hold: PrebookHold): Promise<void> {
  const redis = getRedis();
  await waitUntilRedisReady(redis);
  await redis.set(`prebook:${hold.prebookId}`, JSON.stringify(hold), 'EX', OFFER_TTL_SECONDS);
}

// Single-use: consumes the hold, returns null when expired or unknown.
export async function consumePrebookHold(prebookId: string): Promise<PrebookHold | null> {
  const redis = getRedis();
  await waitUntilRedisReady(redis);
  const raw = await redis.getdel(`prebook:${prebookId}`);
  if (!raw) return null;
  return JSON.parse(raw) as PrebookHold;
}
