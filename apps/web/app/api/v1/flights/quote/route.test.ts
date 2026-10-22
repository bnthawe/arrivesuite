import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyQuoteToken } from '@arrivesuite/pricing';
import { getCachedOffer } from '@/lib/prebooks';
import { applyRouteMarkup } from '@/lib/route-pricing';
import { POST } from './route';

vi.mock('@/lib/prebooks', () => ({ getCachedOffer: vi.fn() }));
vi.mock('@/lib/route-pricing', () => ({ applyRouteMarkup: vi.fn() }));

const cachedOffer = {
  kind: 'flight' as const,
  currency: 'BWP',
  offer: {
    offerId: 'off_test',
    flight: 'QR1362 GBE→MUB 10:15-11:55 Direct',
    type: 'NDC' as const,
    baseMinor: 542_000,
    origin: 'GBE',
    destination: 'MUB',
  },
  route: { origin: 'GBE', destination: 'MUB' },
};

function request(body: unknown): Request {
  return new Request('http://localhost/api/v1/flights/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PRICING_SIGNING_SECRET = 'test-signing-secret-at-least-32-characters';
});

describe('POST /api/v1/flights/quote', () => {
  it('mints a signed quote from the cached offer and server markup', async () => {
    vi.mocked(getCachedOffer).mockResolvedValue(cachedOffer);
    vi.mocked(applyRouteMarkup).mockResolvedValue([
      {
        itemType: 'flight',
        itemRef: 'off_test',
        quantity: 1,
        netCents: 542_000,
        taxCents: 0,
        markupCents: 54_200,
        applied: {
          commissionCents: 54_200,
          routeRule: { pctBps: 1000, fixedCents: 0 },
          channel: 'b2c',
          channelMode: 'route',
        },
      },
    ]);

    const res = await POST(request({ offerId: 'off_test' }));
    expect(res.status).toBe(201);

    const data = (await res.json()) as {
      quoteToken: string;
      currency: string;
      totalCents: number;
      netCents: number;
      markupCents: number;
    };
    expect(data).toMatchObject({
      currency: 'BWP',
      netCents: 542_000,
      markupCents: 54_200,
      totalCents: 596_200,
    });

    const verified = verifyQuoteToken(data.quoteToken);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.quote.items[0]).toMatchObject({
        itemType: 'flight',
        itemRef: 'off_test',
        netCents: 542_000,
        markupCents: 54_200,
        totalCents: 596_200,
      });
    }
  });

  it('rejects an unknown or expired offer', async () => {
    vi.mocked(getCachedOffer).mockResolvedValue(null);
    const res = await POST(request({ offerId: 'off_missing' }));
    expect(res.status).toBe(409);
  });

  it('requires an offer id', async () => {
    const res = await POST(request({}));
    expect(res.status).toBe(400);
    expect(getCachedOffer).not.toHaveBeenCalled();
  });
});
