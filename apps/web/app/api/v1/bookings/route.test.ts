import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('@arrivesuite/db', () => ({
  db,
  bookings: { id: 'bookings.id', accountId: 'bookings.account_id', ref: 'bookings.ref' },
  accounts: { id: 'accounts.id', email: 'accounts.email' },
  auditEvents: {},
}));

vi.mock('@/lib/auth', () => ({
  getSessionAccount: vi.fn(),
}));

vi.mock('@/lib/bookings-core', () => ({
  createBooking: vi.fn(),
}));

vi.mock('@/lib/idempotency', () => ({
  withIdempotency: (
    _request: Request,
    _options: unknown,
    handler: () => Promise<Response>,
  ) => handler(),
}));

import { getSessionAccount } from '@/lib/auth';
import { createBooking } from '@/lib/bookings-core';
import { POST } from './route';

const CUSTOMER_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_ID = '55555555-5555-4555-8555-555555555555';
const ADMIN_ID = '66666666-6666-4666-8666-666666666666';

const customer = {
  id: CUSTOMER_ID,
  email: 'customer@example.com',
  realm: 'customer' as const,
  name: 'Customer',
};
const admin = {
  id: ADMIN_ID,
  email: 'admin@arrivesuite.com',
  realm: 'admin' as const,
  name: 'Admin',
};

const validBody = {
  accountId: CUSTOMER_ID,
  channel: 'web' as const,
  currency: 'BWP',
  items: [
    {
      itemType: 'test',
      itemRef: 'test-item',
      itemSupplierType: 'test',
      netCents: 10000,
      markupCents: 0,
      taxCents: 0,
      quantity: 1,
    },
  ],
};

const created = {
  booking: {
    id: '77777777-7777-4777-8777-777777777777',
    ref: 'ARS-2026-000123',
    status: 'pending_payment',
    currency: 'BWP',
    totalCents: 10000,
  },
  items: [],
  replayed: false,
};

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/v1/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/bookings auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createBooking).mockResolvedValue({
      ok: true,
      status: 201,
      created: created as never,
    });
  });

  it('rejects an anonymous request', async () => {
    vi.mocked(getSessionAccount).mockResolvedValue(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(401);
    expect(createBooking).not.toHaveBeenCalled();
  });

  it('rejects a non-admin booking for another account', async () => {
    vi.mocked(getSessionAccount).mockResolvedValue(customer);
    const res = await POST(makeRequest({ ...validBody, accountId: OTHER_ID }));
    expect(res.status).toBe(403);
    expect(createBooking).not.toHaveBeenCalled();
  });

  it('allows a non-admin to book for themselves', async () => {
    vi.mocked(getSessionAccount).mockResolvedValue(customer);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(201);
    expect(vi.mocked(createBooking).mock.calls[0]?.[0]).toMatchObject({
      accountId: CUSTOMER_ID,
      channel: 'web',
      currency: 'BWP',
    });
  });

  it('allows an admin to book on behalf of another account', async () => {
    vi.mocked(getSessionAccount).mockResolvedValue(admin);
    const res = await POST(makeRequest({ ...validBody, accountId: OTHER_ID }));
    expect(res.status).toBe(201);
    expect(vi.mocked(createBooking).mock.calls[0]?.[0]).toMatchObject({
      accountId: OTHER_ID,
    });
  });

  it('validates the body before auth', async () => {
    const res = await POST(makeRequest({ accountId: 'not-a-uuid' }));
    expect(res.status).toBe(400);
    expect(getSessionAccount).not.toHaveBeenCalled();
    expect(createBooking).not.toHaveBeenCalled();
  });

  it('propagates a createBooking failure', async () => {
    vi.mocked(getSessionAccount).mockResolvedValue(customer);
    vi.mocked(createBooking).mockResolvedValue({
      ok: false,
      status: 409,
      error: 'Quote already used',
    } as never);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: 'Quote already used' });
  });

  it('marks an idempotent replay in the response headers', async () => {
    vi.mocked(getSessionAccount).mockResolvedValue(customer);
    vi.mocked(createBooking).mockResolvedValue({
      ok: true,
      status: 200,
      created: { ...created, replayed: true },
    } as never);
    const res = await POST(
      makeRequest(validBody, { 'Idempotency-Key': '11111111-1111-4111-8111-111111111111' }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Idempotent-Replayed')).toBe('true');
  });
});
