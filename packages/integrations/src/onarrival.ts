import type { FlightOffer, FlightOrderRequest, FlightOrderResponse, FlightSearchRequest } from '@arrivesuite/types';
import { providerFetch } from './http';

export interface OnArrivalConfig {
  apiKey: string;
  baseUrl: string;
  sandbox: boolean;
}

export function onArrivalConfigFromEnv(env: NodeJS.ProcessEnv = process.env): OnArrivalConfig {
  const key = env.ONARRIVAL_API_KEY ?? '';
  return {
    apiKey: key,
    baseUrl: env.ONARRIVAL_BASE_URL ?? 'https://api.onarrival.com',
    sandbox: !key || key.includes('xxx'),
  };
}

function authHeaders(cfg: OnArrivalConfig): Record<string, string> {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` };
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
  return providerFetch(
    '/offers',
    { method: 'POST', headers: authHeaders(cfg), body: JSON.stringify(req) },
    { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, provider: 'onarrival' },
  );
}

export async function createFlightOrder(
  req: FlightOrderRequest,
  cfg = onArrivalConfigFromEnv(),
): Promise<FlightOrderResponse> {
  if (cfg.sandbox) {
    return { orderId: `ord_${req.offerId}`, pnr: 'ABC123', ticket: 'H-77421', pdf: '/cdn/tickets/H-77421.pdf' };
  }
  return providerFetch(
    '/orders',
    { method: 'POST', headers: authHeaders(cfg), body: JSON.stringify(req) },
    { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, provider: 'onarrival' },
  );
}
