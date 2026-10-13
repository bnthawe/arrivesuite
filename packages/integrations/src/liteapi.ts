import type { GuestInfo, HotelOffer, HotelSearchRequest, PrebookRequest, PrebookResponse } from '@arrivesuite/types';
import { providerFetch, ProviderError } from './http';

export interface LiteApiConfig {
  apiKey: string;
  baseUrl: string;
  sandbox: boolean;
}

export function liteApiConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LiteApiConfig {
  const liveKey = env.LITEAPI_LIVE_KEY ?? '';
  const sandboxKey = env.LITEAPI_SANDBOX_KEY ?? '';
  // A sand_ test key is real sandbox credentials, NOT a mock trigger.
  // Only placeholder/empty keys use the deterministic mock.
  const key = liveKey && !liveKey.includes('xxx') ? liveKey : sandboxKey;
  const sandbox = !key || key.includes('xxx');
  return {
    apiKey: key,
    baseUrl: env.LITEAPI_BASE_URL ?? 'https://api.liteapi.travel/v3.0',
    sandbox,
  };
}

export interface HotelBookRequest {
  prebookId: string;
  guestInfo: GuestInfo;
  payment: { method: 'TRANSACTION_ID'; transactionId: string };
}

export interface HotelBookResponse {
  bookingId: string;
  status: string;
  voucher: string;
}

interface StaticHotel {
  id: string;
  name: string;
  city?: string;
}

// Process-lifetime cache for static hotel data (24h+ stable upstream).
const staticCache = new Map<string, { at: number; hotels: StaticHotel[] }>();

function splitLocation(location: string, nationality: string): { city: string; country: string } {
  const parts = location.split(',').map((s) => s.trim());
  if (parts.length >= 2 && /^[A-Za-z]{2}$/.test(parts[parts.length - 1])) {
    return { city: parts.slice(0, -1).join(', '), country: parts[parts.length - 1].toUpperCase() };
  }
  return { city: location, country: nationality.toUpperCase() };
}

async function staticHotels(city: string, country: string, cfg: LiteApiConfig): Promise<StaticHotel[]> {
  const key = `${country}:${city}`.toLowerCase();
  const hit = staticCache.get(key);
  if (hit && Date.now() - hit.at < 24 * 60 * 60_000) return hit.hotels;
  const qs = new URLSearchParams({ countryCode: country, cityName: city });
  const res = await providerFetch<{ data: StaticHotel[] }>(
    `/data/hotels?${qs}`,
    { method: 'GET', headers: { 'X-API-Key': cfg.apiKey } },
    { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, provider: 'liteapi' },
  );
  staticCache.set(key, { at: Date.now(), hotels: res.data ?? [] });
  return res.data ?? [];
}

const majorToMinor = (n: number) => Math.round(n * 100);

export async function searchHotels(req: HotelSearchRequest, cfg = liteApiConfigFromEnv()): Promise<HotelOffer[]> {
  if (cfg.sandbox) return sandboxSearch(req);
  const { city, country } = splitLocation(req.location, req.guestNationality);
  const hotels = await staticHotels(city, country, cfg);
  if (hotels.length === 0) return [];
  const names = new Map(hotels.map((h) => [h.id, h.name]));

  const rates = await providerFetch<{ data: { hotelId: string; roomTypes: LiteApiRoomType[] }[] }>(
    '/hotels/rates',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': cfg.apiKey },
      body: JSON.stringify({
        hotelIds: hotels.slice(0, 10).map((h) => h.id),
        checkin: req.checkin,
        checkout: req.checkout,
        currency: req.currency,
        guestNationality: req.guestNationality,
        occupancies: req.occupancies,
      }),
    },
    { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, provider: 'liteapi' },
  );

  const offers: HotelOffer[] = [];
  for (const hotel of rates.data ?? []) {
    for (const room of (hotel.roomTypes ?? []).slice(0, 3)) {
      const rate = room.rates?.[0];
      if (!rate) continue;
      const net = rate.retailRate?.total?.[0]?.amount;
      if (typeof net !== 'number') continue;
      const suggested = room.suggestedSellingPrice?.[0]?.amount;
      offers.push({
        hotelId: hotel.hotelId,
        offerId: room.offerId,
        name: `${names.get(hotel.hotelId) ?? hotel.hotelId} — ${rate.name ?? 'Room'}`,
        net: majorToMinor(net),
        retail: typeof suggested === 'number' ? majorToMinor(suggested) : majorToMinor(net),
        freeCancel: null,
        badges: [
          room.supplier ? String(room.supplier) : 'LiteAPI',
          country === 'BW' ? 'Botswana Verified' : 'Verified',
        ],
        imageUrl: '/img/lodge.svg',
      });
    }
  }
  return offers;
}

interface LiteApiRoomType {
  roomTypeId: string;
  offerId: string;
  supplier?: string;
  rates?: {
    rateId: string;
    name?: string;
    retailRate?: { total?: { amount: number }[] };
  }[];
  suggestedSellingPrice?: { amount: number }[];
}

export async function prebookRate(req: PrebookRequest, cfg = liteApiConfigFromEnv()): Promise<PrebookResponse> {
  if (cfg.sandbox) {
    return {
      prebookId: `pb-${req.offerId}`,
      transactionId: `tx_${Date.now()}`,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      expiresIn: '15m',
    };
  }
  // Live prebook returns { data: { prebookId, ... } } with no transaction
  // id or expiry: the hold window is enforced by our 15-minute Redis TTL.
  const res = await providerFetch<{ data: { prebookId: string } }>(
    '/rates/prebook',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': cfg.apiKey },
      body: JSON.stringify({ offerId: req.offerId, usePaymentSdk: req.usePaymentSdk }),
    },
    { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, provider: 'liteapi' },
  );
  if (!res.data?.prebookId) {
    throw new ProviderError({ provider: 'liteapi', code: 'provider', message: 'prebook returned no id', retryable: false });
  }
  return {
    prebookId: res.data.prebookId,
    transactionId: res.data.prebookId,
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    expiresIn: '15m',
  };
}

export async function bookRate(req: HotelBookRequest, cfg = liteApiConfigFromEnv()): Promise<HotelBookResponse> {
  if (cfg.sandbox) {
    if (!req.prebookId) {
      throw new ProviderError({ provider: 'liteapi', code: 'validation', message: 'prebookId required', retryable: false });
    }
    return { bookingId: `liteapi_bk_${req.prebookId}`, status: 'confirmed', voucher: '' };
  }
  const res = await providerFetch<{ data?: Record<string, unknown>; error?: { message?: string } }>(
    '/rates/book',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': cfg.apiKey },
      body: JSON.stringify(req),
    },
    { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, provider: 'liteapi' },
  );
  const data = res.data ?? {};
  const bookingId = (data.bookingId ?? data.id ?? data.bookingReference) as string | undefined;
  if (!bookingId) {
    throw new ProviderError({ provider: 'liteapi', code: 'provider', message: 'book returned no id', retryable: false });
  }
  return { bookingId, status: String(data.status ?? 'confirmed'), voucher: '' };
}

// Deterministic sandbox shaped like contract v1.0 §2 examples.
function sandboxSearch(req: HotelSearchRequest): HotelOffer[] {
  void req;
  return [
    {
      hotelId: 'xigera-safari-lodge',
      offerId: 'r-abc123',
      name: 'Sitatunga Private Island Maun',
      net: 12500,
      retail: 14375,
      freeCancel: '2026-12-08T14:00:00Z',
      badges: ['LiteAPI FREE', 'Botswana Verified', '85% trust', 'owned 2 units'],
      imageUrl: '/img/lodge.svg',
    },
  ];
}
