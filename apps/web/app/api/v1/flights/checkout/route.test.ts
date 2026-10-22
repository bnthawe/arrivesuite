import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCachedOffer } from '@/lib/prebooks';
import { applyRouteMarkup } from '@/lib/route-pricing';
import { createBooking, resolveGuestAccount, traceIdFromRequest } from '@/lib/bookings-core';
import { verifyBookingAccess } from '@/lib/booking-access';
import { POST } from './route';

vi.mock('@/lib/prebooks', () => ({ getCachedOffer: vi.fn() }));
vi.mock('@/lib/route-pricing', () => ({ applyRouteMarkup: vi.fn() }));
vi.mock('@/lib/bookings-core', () => ({
  createBooking: vi.fn(),
  resolveGuestAccount: vi.fn(),
  traceIdFromRequest: vi.fn(() => 'trace-test'),
}));
vi.mock('@/lib/idempotency', () => ({
  withIdempotency: vi.fn(async (_req: Request, _opts: unknown, handler: () => Promise<Response>) =>
    handler(),
  ),
}));

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
    departureDate: '2026-12-10',
  },
  route: { origin: 'GBE', destination: 'MUB' },
  occupancy: { adults: 1, children: 1, infants: 0 },
};

const priced: Awaited<ReturnType<typeof applyRouteMarkup>>[number] = {
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
};

function request(body: unknown): Request {
  return new Request('http://localhost/api/v1/flights/checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': 'checkout-test-key',
    },
    body: JSON.stringify(body),
  });
}

const validBody = {
  offerId: 'off_test',
  quoteToken: 'signed-quote',
  guestInfo: {
    firstName: 'Neo',
    lastName: 'Molefe',
    email: 'neo@example.com',
    phone: '+26771234567',
  },
  passengers: [
    {
      type: 'ADT',
      firstName: 'Neo',
      lastName: 'Molefe',
      dateOfBirth: '1990-04-12',
      passportNumber: 'BW123456',
      nationality: 'BW',
    },
    {
      type: 'CHD',
      firstName: 'Lesedi',
      lastName: 'Molefe',
      dateOfBirth: '2016-08-01',
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BOOKING_ACCESS_SECRET = 'test-booking-access-secret-at-least-32-chars';
  vi.mocked(getCachedOffer).mockResolvedValue(cachedOffer);
  vi.mocked(applyRouteMarkup).mockResolvedValue([priced]);
  vi.mocked(resolveGuestAccount).mockResolvedValue({ id: 'acc_test' } as Awaited<
    ReturnType<typeof resolveGuestAccount>
  >);
  vi.mocked(createBooking).mockResolvedValue({
    ok: true,
    status: 201,
    created: {
      booking: {
        id: 'booking_test',
        ref: 'ARS-2026-000042',
        status: 'pending_payment',
        currency: 'BWP',
        totalCents: 596_200,
      },
      items: [],
      replayed: false,
    },
  } as unknown as Awaited<ReturnType<typeof createBooking>>);
});

describe('POST /api/v1/flights/checkout', () => {
  it('creates a pending-payment booking with frozen offer and guest rows', async () => {
    const res = await POST(request(validBody));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { accessToken?: string };
    expect(body).toMatchObject({
      arsRef: 'ARS-2026-000042',
      status: 'pending_payment',
      totalCents: 596_200,
    });
    expect(verifyBookingAccess('ARS-2026-000042', body.accessToken)).toBe(true);

    expect(createBooking).toHaveBeenCalledTimes(1);
    const input = vi.mocked(createBooking).mock.calls[0]?.[0];
    expect(input).toMatchObject({
      accountId: 'acc_test',
      channel: 'web',
      currency: 'BWP',
      quoteToken: 'signed-quote',
      idempotencyKey: 'checkout-test-key',
      guests: [
        {
          guestType: 'ADT',
          firstName: 'Neo',
          lastName: 'Molefe',
          isLead: true,
          email: 'neo@example.com',
          phoneE164: '+26771234567',
        },
        { guestType: 'CHD', firstName: 'Lesedi', lastName: 'Molefe', isLead: false },
      ],
    });
    expect(input?.items[0]).toMatchObject({
      itemType: 'flight',
      itemRef: 'off_test',
      netCents: 542_000,
      markupCents: 54_200,
      adults: 1,
      children: 1,
      infants: 0,
      snapshot: {
        flightOffer: cachedOffer.offer,
        fulfillment: 'post_payment',
      },
    });
    expect(input?.items[0]?.startDate?.toISOString()).toBe('2026-12-10T00:00:00.000Z');
    expect(traceIdFromRequest).toHaveBeenCalled();
  });

  it('rejects an expired or non-flight offer', async () => {
    vi.mocked(getCachedOffer).mockResolvedValueOnce(null);
    const res = await POST(request(validBody));
    expect(res.status).toBe(409);
    expect(createBooking).not.toHaveBeenCalled();
  });

  it('rejects a changed traveller count without a new search', async () => {
    const res = await POST(
      request({
        ...validBody,
        passengers: validBody.passengers.slice(0, 1),
      }),
    );
    expect(res.status).toBe(409);
    expect(createBooking).not.toHaveBeenCalled();
  });

  it('validates traveller names before creating a booking', async () => {
    const res = await POST(
      request({
        ...validBody,
        passengers: [{ ...validBody.passengers[0], firstName: '' }],
      }),
    );
    expect(res.status).toBe(400);
    expect(createBooking).not.toHaveBeenCalled();
  });
});
