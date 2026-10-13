import type { FlightOffer, FlightOrderRequest, FlightOrderResponse, FlightSearchRequest } from '@arrivesuite/types';
import { providerFetch, ProviderError } from './http';

export interface OnArrivalConfig {
  apiKey: string;
  baseUrl: string;
  sandbox: boolean;
}

export function onArrivalConfigFromEnv(env: NodeJS.ProcessEnv = process.env): OnArrivalConfig {
  const key = env.ONARRIVAL_API_KEY ?? '';
  return {
    apiKey: key,
    // Staging gateway per docs quickstart; production is
    // https://gateway.onarrival.com/v1 (http, per docs page).
    baseUrl: env.ONARRIVAL_BASE_URL ?? 'https://dev.gateway.onarrival.com/v1',
    sandbox: !key || key.includes('xxx'),
  };
}

function authHeaders(cfg: OnArrivalConfig): Record<string, string> {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` };
}

interface GatewayFlightResult {
  id?: string;
  token?: string;
  api?: { token?: string };
  flight?: string;
  type?: string;
  bags?: string;
  price?: { base?: number; amount?: number };
  [key: string]: unknown;
}

function mapOffer(raw: GatewayFlightResult): FlightOffer {
  const offerId =
    raw.api && typeof raw.api.token === 'string' && raw.api.token.length > 0
      ? raw.api.token
      : String(raw.token ?? raw.id ?? '');
  if (!offerId) {
    throw new ProviderError({ provider: 'onarrival', code: 'provider', message: 'offer without id/token', retryable: false });
  }
  const type = raw.type === 'NDC' || raw.type === 'GDS' || raw.type === 'LCC' ? raw.type : 'GDS';
  const base = typeof raw.price?.base === 'number' ? Math.round(raw.price.base * 100)
    : typeof raw.price?.amount === 'number' ? Math.round(raw.price.amount * 100)
    : undefined;
  return {
    offerId,
    flight: typeof raw.flight === 'string' ? raw.flight : JSON.stringify(raw).slice(0, 200),
    type,
    bags: typeof raw.bags === 'string' ? raw.bags : undefined,
    baseMinor: base,
  };
}

export async function searchFlightOffers(
  req: FlightSearchRequest,
  cfg = onArrivalConfigFromEnv(),
): Promise<{ offers: FlightOffer[]; medianLatencyMs: number }> {
  if (cfg.sandbox) {
    return {
      offers: [
        { offerId: 'off_qr1362', flight: 'QR1362 GAB→JNB 10:15-11:55 Direct 23kg base 5420 trust 88', type: 'NDC', baseMinor: 5420, imageUrl: '/img/wing.svg' },
        { offerId: 'off_abc123', flight: 'Airlink 4Z402 JNB→MUB 08:00-09:30 Direct 1h30m base 6500 trust 92', type: 'GDS', baseMinor: 6500, imageUrl: '/img/wing.svg' },
        { offerId: 'off_fn303', flight: 'FastJet FN303 via GBE 1 Stop base 4200 LCC direct', type: 'LCC', bags: 'direct', baseMinor: 4200, imageUrl: '/img/wing.svg' },
      ],
      medianLatencyMs: 290,
    };
  }
  const started = Date.now();
  // Docs quickstart: POST /v1/flight/search with from/to + travellers.
  // Results carry an encrypted api.token — the whole flight object is
  // what you book with, so the token becomes our offerId.
  const res = await providerFetch<{ data?: GatewayFlightResult[]; results?: GatewayFlightResult[]; offers?: GatewayFlightResult[] }>(
    '/v1/flight/search',
    {
      method: 'POST',
      headers: authHeaders(cfg),
      body: JSON.stringify({
        from: req.origin,
        to: req.destination,
        departureDate: req.departureDate,
        cabin: 'ECONOMY',
        travellers: {
          adults: req.adults,
          children: req.children,
          infants: req.infants,
        },
        fareGroup: 'REGULAR',
        currency: req.currency,
      }),
    },
    { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, provider: 'onarrival' },
  );
  const results = res.data ?? res.results ?? res.offers ?? [];
  return { offers: results.map(mapOffer), medianLatencyMs: Date.now() - started };
}

export async function createFlightOrder(
  req: FlightOrderRequest,
  cfg = onArrivalConfigFromEnv(),
): Promise<FlightOrderResponse> {
  if (cfg.sandbox) {
    return { orderId: `ord_${req.offerId}`, pnr: 'ABC123', ticket: 'H-77421', pdf: '/cdn/tickets/H-77421.pdf' };
  }
  const res = await providerFetch<{ data?: Record<string, unknown> } & Record<string, unknown>>(
    '/v1/flight/orders',
    {
      method: 'POST',
      headers: authHeaders(cfg),
      body: JSON.stringify({
        offerId: req.offerId,
        paymentToken: req.paymentToken,
        passengers: req.passengers,
      }),
    },
    { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, provider: 'onarrival' },
  );
  const data = (res.data ?? res) as Record<string, string | undefined>;
  const orderId = data.orderId ?? data.id;
  if (!orderId) {
    throw new ProviderError({ provider: 'onarrival', code: 'provider', message: 'order returned no id', retryable: false });
  }
  return {
    orderId,
    pnr: data.pnr ?? '',
    ticket: data.ticket ?? '',
    pdf: data.pdf ?? '',
  };
}
