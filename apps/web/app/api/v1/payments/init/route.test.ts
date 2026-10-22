import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signBookingAccess } from '@/lib/booking-access';

const db = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@arrivesuite/db', () => ({
  db,
  bookings: { ref: 'bookings.ref' },
  paymentIntents: {
    idempotencyKey: 'payment_intents.idempotency_key',
    bookingId: 'payment_intents.booking_id',
    state: 'payment_intents.state',
    expiresAt: 'payment_intents.expires_at',
    createdAt: 'payment_intents.created_at',
  },
  auditEvents: {},
}));

vi.mock('@/lib/bookings-core', () => ({
  traceIdFromRequest: () => 'trace-test',
}));

vi.mock('@/lib/idempotency', () => ({
  withIdempotency: (
    _request: Request,
    _options: unknown,
    handler: () => Promise<Response>,
  ) => handler(),
}));

vi.mock('@arrivesuite/integrations', () => ({
  createDpoToken: vi.fn(),
  dpoHostedPageUrl: vi.fn((token: string) => `https://dpo.test/${token}`),
  createStripeCheckoutSession: vi.fn(),
  initializeFlutterwavePayment: vi.fn(),
  initializePaystackTransaction: vi.fn(),
}));

import { createDpoToken, dpoHostedPageUrl } from '@arrivesuite/integrations';
import { POST } from './route';

const booking = {
  id: '11111111-1111-4111-8111-111111111111',
  ref: 'ARS-2026-000042',
  totalCents: 596_200,
  paidCents: 0,
  currency: 'BWP',
};

const intent = {
  id: '22222222-2222-4222-8222-222222222222',
  bookingId: booking.id,
  amountCents: booking.totalCents,
  currency: booking.currency,
  method: 'dpo',
  providerRef: 'TT-new',
  idempotencyKey: null,
  expiresAt: new Date(Date.now() + 60 * 60_000),
  createdAt: new Date(),
};

function request(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/v1/payments/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function queueSelectResults(...results: unknown[][]): void {
  const limit = vi.fn(async () => results.shift() ?? []);
  const orderBy = vi.fn(() => ({ limit }));
  const where = vi.fn(() => ({ limit, orderBy }));
  const from = vi.fn(() => ({ where }));
  vi.mocked(db.select).mockReturnValue({ from } as never);
}

describe('POST /api/v1/payments/init access control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BOOKING_ACCESS_SECRET = 'test-booking-access-secret-at-least-32-chars';
    process.env.APP_URL = 'http://localhost:3000';

    const returning = vi.fn(async () => [intent]);
    vi.mocked(db.insert).mockReturnValue({
      // Synchronous so the insert chain exposes .returning(); awaiting the
      // returned object for audit inserts still works.
      values: vi.fn(() => ({ returning })),
    } as never);
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn(() => ({ where: vi.fn(async () => []) })),
    } as never);
    vi.mocked(createDpoToken).mockResolvedValue({
      transToken: 'TT-new',
      transRef: 'TR-new',
    });
  });

  it('rejects a confirmation redirect without a signed access token', async () => {
    const res = await POST(
      request({
        bookingRef: booking.ref,
        email: 'guest@example.com',
        method: 'dpo',
        returnTo: 'confirmation',
      }),
    );

    expect(res.status).toBe(401);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('rejects an access token for a different booking', async () => {
    const res = await POST(
      request({
        bookingRef: 'ARS-2026-000099',
        email: 'guest@example.com',
        method: 'dpo',
        returnTo: 'confirmation',
        accessToken: signBookingAccess(booking.ref),
      }),
    );

    expect(res.status).toBe(401);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('creates a DPO intent for a valid signed access token', async () => {
    queueSelectResults([booking], []);

    const res = await POST(
      request({
        bookingRef: booking.ref,
        email: 'guest@example.com',
        method: 'dpo',
        returnTo: 'confirmation',
        accessToken: signBookingAccess(booking.ref),
      }),
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      authorizationUrl: 'https://dpo.test/TT-new',
      amountMinor: booking.totalCents,
      currency: booking.currency,
    });
    expect(createDpoToken).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUrl: 'http://localhost:3000/api/v1/payments/dpo/return/confirmation',
      }),
    );
  });

  it('returns a resumable DPO page instead of a second active intent', async () => {
    queueSelectResults([booking], [{ ...intent, providerRef: 'TT-existing' }]);

    const res = await POST(
      request({
        bookingRef: booking.ref,
        email: 'guest@example.com',
        method: 'dpo',
        returnTo: 'confirmation',
        accessToken: signBookingAccess(booking.ref),
      }),
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      authorizationUrl: 'https://dpo.test/TT-existing',
    });
    expect(dpoHostedPageUrl).toHaveBeenCalledWith('TT-existing');
    expect(createDpoToken).not.toHaveBeenCalled();
  });

  it('keeps the legacy ref + email API working without a token', async () => {
    queueSelectResults([booking], []);

    const res = await POST(
      request({
        bookingRef: booking.ref,
        email: 'guest@example.com',
        method: 'dpo',
      }),
    );

    expect(res.status).toBe(201);
  });
});
