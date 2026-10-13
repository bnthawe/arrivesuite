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
  const sandbox = !liveKey || liveKey.includes('xxx');
  return {
    apiKey: sandbox ? sandboxKey : liveKey,
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

function authHeaders(cfg: LiteApiConfig): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-API-Key': cfg.apiKey };
}

export async function searchHotels(req: HotelSearchRequest, cfg = liteApiConfigFromEnv()): Promise<HotelOffer[]> {
  if (cfg.sandbox) return sandboxSearch(req);
  const res = await providerFetch<{ data: HotelOffer[] }>(
    '/hotels/rates',
    { method: 'POST', headers: authHeaders(cfg), body: JSON.stringify(req) },
    { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, provider: 'liteapi' },
  );
  return res.data;
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
  return providerFetch<PrebookResponse>(
    '/rates/prebook',
    { method: 'POST', headers: authHeaders(cfg), body: JSON.stringify(req) },
    { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, provider: 'liteapi' },
  );
}

export async function bookRate(req: HotelBookRequest, cfg = liteApiConfigFromEnv()): Promise<HotelBookResponse> {
  if (cfg.sandbox) {
    if (!req.prebookId) {
      throw new ProviderError({ provider: 'liteapi', code: 'validation', message: 'prebookId required', retryable: false });
    }
    return { bookingId: `liteapi_bk_${req.prebookId}`, status: 'confirmed', voucher: '' };
  }
  return providerFetch<HotelBookResponse>(
    '/rates/book',
    { method: 'POST', headers: authHeaders(cfg), body: JSON.stringify(req) },
    { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, provider: 'liteapi' },
  );
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
