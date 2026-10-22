import type {
  FlightCancellationQuote,
  FlightCancellationRequest,
  FlightCancellationResult,
  FlightOffer,
  FlightOrderRequest,
  FlightOrderResponse,
  FlightSearchRequest,
} from '@arrivesuite/types';
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

export interface GatewayFlightResult {
  id?: string;
  token?: string;
  api?: { token?: string };
  flight?: string;
  type?: string;
  bags?: string;
  price?: { base?: number; amount?: number };
  [key: string]: unknown;
}

interface SearchRoute {
  origin: string;
  destination: string;
  departureDate: string;
}

function stringField(raw: GatewayFlightResult, key: string): string | undefined {
  const value = raw[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberField(raw: GatewayFlightResult, key: string): number | undefined {
  const value = raw[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function minutesBetween(departure: string, arrival: string): number | undefined {
  const parse = (value: string): number | null => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  };
  const from = parse(departure);
  const to = parse(arrival);
  if (from == null || to == null) return undefined;
  return to >= from ? to - from : 24 * 60 - from + to;
}

// OnArrival's gateway is not consistent across fare sources: some results are
// structured, others only carry the human-readable summary. Parse the summary
// as a fallback so every cached offer can render a useful detail page.
export function mapOnArrivalOffer(raw: GatewayFlightResult, route?: SearchRoute): FlightOffer {
  const offerId =
    raw.api && typeof raw.api.token === 'string' && raw.api.token.length > 0
      ? raw.api.token
      : String(raw.token ?? raw.id ?? '');
  if (!offerId) {
    throw new ProviderError({ provider: 'onarrival', code: 'provider', message: 'offer without id/token', retryable: false });
  }
  const flight = stringField(raw, 'flight') ?? JSON.stringify(raw).slice(0, 200);
  const routeMatch = /([A-Z]{3})\s*(?:→|->|>)\s*([A-Z]{3})/.exec(flight)
    ?? /\b([A-Z]{3})\s*-\s*([A-Z]{3})\b/.exec(flight);
  const timeMatch = /\b(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})\b/.exec(flight);
  const durationMatch = /(\d+)h(?:\s*(\d+)m)?/.exec(flight);
  const stopMatch = /(\d+)\s*stop/i.exec(flight);
  const baseMatch = /\bbase\s+([\d.]+)/i.exec(flight);
  const base = typeof raw.price?.base === 'number' ? Math.round(raw.price.base * 100)
    : typeof raw.price?.amount === 'number' ? Math.round(raw.price.amount * 100)
    : baseMatch ? Math.round(Number(baseMatch[1]) * 100)
    : undefined;
  const departureTime = stringField(raw, 'departureTime') ?? timeMatch?.[1];
  const arrivalTime = stringField(raw, 'arrivalTime') ?? timeMatch?.[2];
  const durationMinutes = numberField(raw, 'durationMinutes')
    ?? (durationMatch
      ? Number(durationMatch[1]) * 60 + Number(durationMatch[2] ?? 0)
      : departureTime && arrivalTime
        ? minutesBetween(departureTime, arrivalTime)
        : undefined);
  const stops = numberField(raw, 'stops')
    ?? (stopMatch ? Number(stopMatch[1]) : /direct/i.test(flight) ? 0 : undefined);
  const refundable = typeof raw.refundable === 'boolean' ? raw.refundable : undefined;

  return {
    offerId,
    flight,
    type: raw.type === 'NDC' || raw.type === 'GDS' || raw.type === 'LCC' ? raw.type : 'GDS',
    bags: typeof raw.bags === 'string' ? raw.bags : undefined,
    baseMinor: base,
    origin: stringField(raw, 'origin')?.toUpperCase() ?? routeMatch?.[1] ?? route?.origin,
    destination: stringField(raw, 'destination')?.toUpperCase() ?? routeMatch?.[2] ?? route?.destination,
    departureDate: stringField(raw, 'departureDate') ?? route?.departureDate,
    departureTime,
    arrivalTime,
    durationMinutes,
    stops,
    airline: stringField(raw, 'airline'),
    fareBrand: stringField(raw, 'fareBrand') ?? stringField(raw, 'cabin'),
    ticketingDeadline: stringField(raw, 'ticketingDeadline'),
    refundable,
  };
}

export async function searchFlightOffers(
  req: FlightSearchRequest,
  cfg = onArrivalConfigFromEnv(),
): Promise<{ offers: FlightOffer[]; medianLatencyMs: number }> {
  if (cfg.sandbox) {
    return {
      offers: [
        {
          offerId: 'off_qr1362',
          flight: `QR1362 ${req.origin}→${req.destination} 10:15-11:55 Direct 23kg base 5420 trust 88`,
          type: 'NDC',
          bags: '23kg checked',
          baseMinor: 542_000,
          imageUrl: '/img/wing.svg',
          origin: req.origin,
          destination: req.destination,
          departureDate: req.departureDate,
          departureTime: '10:15',
          arrivalTime: '11:55',
          durationMinutes: 100,
          stops: 0,
          airline: 'Qatar Airways',
          fareBrand: 'Economy Saver',
          refundable: false,
        },
        {
          offerId: 'off_abc123',
          flight: `Airlink 4Z402 ${req.origin}→${req.destination} 08:00-09:30 Direct 1h30m base 6500 trust 92`,
          type: 'GDS',
          bags: '20kg checked',
          baseMinor: 650_000,
          imageUrl: '/img/wing.svg',
          origin: req.origin,
          destination: req.destination,
          departureDate: req.departureDate,
          departureTime: '08:00',
          arrivalTime: '09:30',
          durationMinutes: 90,
          stops: 0,
          airline: 'Airlink',
          fareBrand: 'Economy Flex',
          refundable: true,
        },
        {
          offerId: 'off_fn303',
          flight: `FastJet FN303 ${req.origin}→${req.destination} via GBE 1 Stop base 4200 LCC direct`,
          type: 'LCC',
          bags: 'Cabin bag only',
          baseMinor: 420_000,
          imageUrl: '/img/wing.svg',
          origin: req.origin,
          destination: req.destination,
          departureDate: req.departureDate,
          departureTime: '12:20',
          arrivalTime: '15:40',
          durationMinutes: 200,
          stops: 1,
          airline: 'FastJet',
          fareBrand: 'Economy Light',
          refundable: false,
        },
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
  const route = {
    origin: req.origin,
    destination: req.destination,
    departureDate: req.departureDate,
  };
  return { offers: results.map((raw) => mapOnArrivalOffer(raw, route)), medianLatencyMs: Date.now() - started };
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

function cancellationPath(orderId: string): string {
  return `/v1/flight/orders/${encodeURIComponent(orderId)}/cancellation`;
}

function cancellationEnvelope(res: Record<string, unknown>): Record<string, unknown> {
  const data = res.data;
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : res;
}

function cancellationReasons(value: unknown): FlightCancellationQuote['reasons'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const row = raw as Record<string, unknown>;
    const code = typeof row.code === 'string' ? row.code : undefined;
    const display = typeof row.display === 'string' ? row.display : undefined;
    if (!code || !display) return [];
    return [
      {
        code,
        display,
        ...(typeof row.additionalReason === 'boolean'
          ? { additionalReason: row.additionalReason }
          : {}),
      },
    ];
  });
}

function refundMinor(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  const amount = (value as Record<string, unknown>).totalRefundAmount;
  return typeof amount === 'number' && Number.isFinite(amount)
    ? Math.max(0, Math.round(amount * 100))
    : null;
}

// GET /v1/flight/orders/{orderId}/cancellation. The quote is advisory; the
// booking layer applies its own refund policy and caps the amount to the
// remaining captured balance.
export async function getFlightCancellationQuote(
  orderId: string,
  cfg = onArrivalConfigFromEnv(),
): Promise<FlightCancellationQuote> {
  if (cfg.sandbox) {
    return {
      cancellable: true,
      supportRequired: false,
      reasons: [{ code: 'CR01', display: 'My plans changed' }],
      estimatedRefundMinor: null,
    };
  }
  const res = await providerFetch<Record<string, unknown>>(
    cancellationPath(orderId),
    {
      method: 'GET',
      headers: authHeaders(cfg),
    },
    { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, provider: 'onarrival' },
  );
  const data = cancellationEnvelope(res);
  return {
    cancellable: data.cancellable === true,
    supportRequired: data.supportRequired === true,
    reasons: cancellationReasons(data.reasons),
    estimatedRefundMinor: refundMinor(data.refund),
  };
}

// POST /v1/flight/orders/{orderId}/cancellation. The gateway records the
// refund asynchronously; callers must not treat this response alone as a
// completed refund.
export async function cancelFlightOrder(
  req: FlightCancellationRequest,
  cfg = onArrivalConfigFromEnv(),
): Promise<FlightCancellationResult> {
  if (cfg.sandbox) {
    return {
      orderId: req.orderId,
      bookingStatus: 'CANCELLED',
      cancellationId: `cancel_${req.orderId}`,
    };
  }
  const res = await providerFetch<Record<string, unknown>>(
    cancellationPath(req.orderId),
    {
      method: 'POST',
      headers: authHeaders(cfg),
      body: JSON.stringify({
        reason: req.reason,
        code: req.code,
        additionalReason: req.additionalReason ?? false,
        ...(req.remarks ? { remarks: req.remarks } : {}),
      }),
    },
    { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, provider: 'onarrival' },
  );
  const data = cancellationEnvelope(res);
  const transactions = Array.isArray(data.cancellationTransactionInfos)
    ? data.cancellationTransactionInfos
    : [];
  const cancellationId = transactions
    .map((row) =>
      row && typeof row === 'object'
        ? (row as Record<string, unknown>).cancellationId
        : undefined,
    )
    .find((value): value is string => typeof value === 'string' && value.length > 0);

  return {
    orderId:
      typeof data.id === 'string' && data.id.length > 0 ? data.id : req.orderId,
    bookingStatus:
      typeof data.bookingStatus === 'string' && data.bookingStatus.length > 0
        ? data.bookingStatus
        : 'CANCELLATION_REQUESTED',
    ...(cancellationId ? { cancellationId } : {}),
  };
}
