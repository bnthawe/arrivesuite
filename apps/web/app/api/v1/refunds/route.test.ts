import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('@arrivesuite/db', () => ({
  db,
  refunds: {
    id: 'refunds.id',
    paymentId: 'refunds.payment_id',
    state: 'refunds.state',
    amountCents: 'refunds.amount_cents',
  },
  payments: { id: 'payments.id', intentId: 'payments.intent_id' },
  paymentIntents: { id: 'payment_intents.id', bookingId: 'payment_intents.booking_id' },
  bookings: { id: 'bookings.id', accountId: 'bookings.account_id' },
  auditEvents: {},
}));

vi.mock('@/lib/auth', () => ({
  getSessionAccount: vi.fn(),
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

vi.mock('@/lib/refunds', () => ({
  createRefundRequest: vi.fn(),
}));

import { getSessionAccount } from '@/lib/auth';
import { createRefundRequest } from '@/lib/refunds';
import { GET, POST } from './route';

const refundRow = {
  id: '22222222-2222-4222-8222-222222222222',
  paymentId: '33333333-3333-4333-8333-333333333333',
  amountCents: 5000,
  reason: 'guest request',
  state: 'pending',
  approvedBy: null,
  createdAt: new Date('2026-10-21T10:00:00Z'),
};

const account = {
  id: '44444444-4444-4444-8444-444444444444',
  email: 'customer@example.com',
  realm: 'customer' as const,
  name: 'Customer',
};

const admin = {
  id: '55555555-5555-4555-8555-555555555555',
  email: 'admin@arrivesuite.com',
  realm: 'admin' as const,
  name: 'Admin',
};

function makeGet(search = ''): Request {
  return new Request(`http://localhost/api/v1/refunds${search}`, { method: 'GET' });
}

function makePost(body: unknown): Request {
  return new Request('http://localhost/api/v1/refunds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Every Drizzle chain method returns the same thenable, so
// `.from(t).where(...)`, `.from(t).innerJoin(...).where(...).limit(1)`,
// and bare `await db.select().from(t)` all resolve to the queued rows.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chainable(rows: unknown[]): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = Promise.resolve(rows) as any;
  p.where = () => p;
  p.innerJoin = () => p;
  p.leftJoin = () => p;
  p.groupBy = () => p;
  p.having = () => p;
  p.orderBy = () => p;
  p.limit = (n: number) => Promise.resolve(rows.slice(0, n));
  return p;
}

function queueSelectResults(...results: unknown[][]): void {
  const queue = [...results];
  vi.mocked(db.select).mockReturnValue({
    from: () => chainable(queue.shift() ?? []),
  } as never);
}

describe('GET /api/v1/refunds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects an anonymous request', async () => {
    vi.mocked(getSessionAccount).mockResolvedValue(null);
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('returns every refund to an admin', async () => {
    vi.mocked(getSessionAccount).mockResolvedValue(admin);
    queueSelectResults([refundRow]);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { refunds: typeof refundRow[] };
    expect(body.refunds).toHaveLength(1);
    expect(body.refunds[0].id).toBe(refundRow.id);
  });

  it('scopes a non-admin to their own bookings', async () => {
    vi.mocked(getSessionAccount).mockResolvedValue(account);
    queueSelectResults([{ refund: refundRow }]);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { refunds: (typeof refundRow)[] };
    expect(body.refunds).toEqual([{ ...refundRow, createdAt: refundRow.createdAt.toISOString() }]);
  });

  it('returns an empty list for a non-admin with no bookings', async () => {
    vi.mocked(getSessionAccount).mockResolvedValue(account);
    queueSelectResults([]);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ refunds: [] });
  });
});

describe('POST /api/v1/refunds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createRefundRequest).mockResolvedValue({
      ok: true,
      refund: refundRow as never,
    });
  });

  it('rejects an anonymous request', async () => {
    vi.mocked(getSessionAccount).mockResolvedValue(null);
    const res = await POST(
      makePost({ paymentId: '33333333-3333-4333-8333-333333333333', amountCents: 5000 }),
    );
    expect(res.status).toBe(401);
    expect(createRefundRequest).not.toHaveBeenCalled();
  });

  it('lets an admin request a refund for any payment', async () => {
    vi.mocked(getSessionAccount).mockResolvedValue(admin);
    const res = await POST(
      makePost({ paymentId: '33333333-3333-4333-8333-333333333333', amountCents: 5000 }),
    );
    expect(res.status).toBe(201);
    expect(createRefundRequest).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-admin requesting a refund on someone else\'s payment', async () => {
    vi.mocked(getSessionAccount).mockResolvedValue(account);
    queueSelectResults([]);
    const res = await POST(
      makePost({ paymentId: '33333333-3333-4333-8333-333333333333', amountCents: 5000 }),
    );
    expect(res.status).toBe(404);
    expect(createRefundRequest).not.toHaveBeenCalled();
  });

  it('lets a non-admin request a refund on their own payment', async () => {
    vi.mocked(getSessionAccount).mockResolvedValue(account);
    queueSelectResults([{ id: '33333333-3333-4333-8333-333333333333' }]);
    const res = await POST(
      makePost({ paymentId: '33333333-3333-4333-8333-333333333333', amountCents: 5000 }),
    );
    expect(res.status).toBe(201);
    expect(createRefundRequest).toHaveBeenCalledTimes(1);
  });

  it('validates the body before auth', async () => {
    vi.mocked(getSessionAccount).mockResolvedValue(account);
    const res = await POST(makePost({ paymentId: 'not-a-uuid' }));
    expect(res.status).toBe(400);
    expect(createRefundRequest).not.toHaveBeenCalled();
  });
});
