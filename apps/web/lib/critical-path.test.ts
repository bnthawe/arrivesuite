import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { IdempotencyStore } from './idempotency';

// Booking creation enqueues reconciliation as a best-effort side effect. Keep
// this test focused on the database state machine and capture transaction.
vi.mock('./queues', () => ({
  enqueueReconciliation: vi.fn(async () => {}),
}));

type DbModule = typeof import('@arrivesuite/db');
type BookingModule = typeof import('./bookings-core');
type CaptureModule = typeof import('./payments-capture');
type IdempotencyModule = typeof import('./idempotency');
type DrizzleModule = typeof import('drizzle-orm');

const testDatabase = process.env.TEST_DATABASE_URL;
const suite = testDatabase ? describe : describe.skip;

class MemoryStore implements IdempotencyStore {
  private entries = new Map<string, string>();

  async claim(key: string, value: string): Promise<boolean> {
    if (this.entries.has(key)) return false;
    this.entries.set(key, value);
    return true;
  }

  async get(key: string): Promise<string | null> {
    return this.entries.get(key) ?? null;
  }

  async complete(key: string, claimValue: string, value: string): Promise<boolean> {
    if (this.entries.get(key) !== claimValue) return false;
    this.entries.set(key, value);
    return true;
  }

  async release(key: string, claimValue: string): Promise<boolean> {
    if (this.entries.get(key) !== claimValue) return false;
    this.entries.delete(key);
    return true;
  }
}

suite('critical path: booking creation and payment capture', () => {
  let dbm: DbModule;
  let bookingm: BookingModule;
  let capturem: CaptureModule;
  let idempotencym: IdempotencyModule;
  let dz: DrizzleModule;

  const bookingIds: string[] = [];
  const intentIds: string[] = [];
  const snapshotIds: string[] = [];
  const traces: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabase;
    dbm = await import('@arrivesuite/db');
    bookingm = await import('./bookings-core');
    capturem = await import('./payments-capture');
    idempotencym = await import('./idempotency');
    dz = await import('drizzle-orm');
  });

  afterAll(async () => {
    if (!dbm) return;
    try {
      if (traces.length > 0) {
        await dbm.db.delete(dbm.auditEvents).where(dz.inArray(dbm.auditEvents.traceId, traces));
      }
      if (intentIds.length > 0) {
        await dbm.db.delete(dbm.payments).where(dz.inArray(dbm.payments.intentId, intentIds));
        await dbm.db.delete(dbm.paymentIntents).where(dz.inArray(dbm.paymentIntents.id, intentIds));
      }
      if (bookingIds.length > 0) {
        await dbm.db.delete(dbm.bookingItems).where(dz.inArray(dbm.bookingItems.bookingId, bookingIds));
        await dbm.db.delete(dbm.bookings).where(dz.inArray(dbm.bookings.id, bookingIds));
      }
      if (snapshotIds.length > 0) {
        await dbm.db
          .delete(dbm.pricingSnapshots)
          .where(dz.inArray(dbm.pricingSnapshots.id, snapshotIds));
      }
    } finally {
      await dbm.client.end({ timeout: 5 });
    }
  });

  async function createTestBooking() {
    const [account] = await dbm.db
      .select()
      .from(dbm.accounts)
      .where(dz.eq(dbm.accounts.email, 'customer@arrivesuite.com'))
      .limit(1);
    if (!account) throw new Error('Seed account customer@arrivesuite.com is missing');

    const traceId = randomUUID();
    traces.push(traceId);
    const created = await bookingm.createBooking({
      accountId: account.id,
      channel: 'web',
      currency: 'BWP',
      idempotencyKey: randomUUID(),
      traceId,
      items: [
        {
          itemType: 'test',
          itemRef: 'critical-path',
          itemSupplierType: 'test',
          netCents: 10000,
        },
      ],
    });
    if (!created.ok) throw new Error(created.error);

    bookingIds.push(created.created.booking.id);
    if (created.created.booking.pricingSnapshotId) {
      snapshotIds.push(created.created.booking.pricingSnapshotId);
    }
    return created.created.booking;
  }

  async function createTestIntent(bookingId: string) {
    const providerRef = `TEST-${randomUUID()}`;
    const [intent] = await dbm.db
      .insert(dbm.paymentIntents)
      .values({
        bookingId,
        amountCents: 10000,
        currency: 'BWP',
        method: 'paystack',
        providerRef,
        expiresAt: new Date(Date.now() + 3_600_000),
      })
      .returning();
    intentIds.push(intent.id);
    return { intent, providerRef };
  }

  it('captures once and transitions pending_payment to confirmed', async () => {
    const booking = await createTestBooking();
    expect(booking.status).toBe('pending_payment');

    const { intent, providerRef } = await createTestIntent(booking.id);
    const traceId = randomUUID();
    traces.push(traceId);

    const captured = await capturem.capturePaymentByProviderRef({
      providerRef,
      amountCents: 10000,
      currency: 'BWP',
      providerPaymentId: 'TEST-PAYMENT-1',
      traceId,
    });
    expect(captured).toMatchObject({ ok: true, replayed: false });

    const [afterCapture] = await dbm.db
      .select()
      .from(dbm.bookings)
      .where(dz.eq(dbm.bookings.id, booking.id))
      .limit(1);
    expect(afterCapture.status).toBe('confirmed');
    expect(afterCapture.paidCents).toBe(10000);

    const paymentRows = await dbm.db
      .select()
      .from(dbm.payments)
      .where(dz.eq(dbm.payments.intentId, intent.id));
    expect(paymentRows).toHaveLength(1);

    const transitions = await dbm.db
      .select()
      .from(dbm.auditEvents)
      .where(
        dz.and(
          dz.eq(dbm.auditEvents.action, 'booking.transition'),
          dz.eq(dbm.auditEvents.entityId, booking.id),
        ),
      );
    expect(transitions).toHaveLength(1);

    const replay = await capturem.capturePaymentByProviderRef({
      providerRef,
      amountCents: 10000,
      currency: 'BWP',
      providerPaymentId: 'TEST-PAYMENT-1',
      traceId,
    });
    expect(replay).toMatchObject({ ok: true, replayed: true });

    const [afterReplay] = await dbm.db
      .select()
      .from(dbm.bookings)
      .where(dz.eq(dbm.bookings.id, booking.id))
      .limit(1);
    expect(afterReplay.paidCents).toBe(10000);
    const paymentsAfterReplay = await dbm.db
      .select()
      .from(dbm.payments)
      .where(dz.eq(dbm.payments.intentId, intent.id));
    expect(paymentsAfterReplay).toHaveLength(1);
  });

  it('rolls back capture when the booking state transition is illegal', async () => {
    const booking = await createTestBooking();
    const { intent, providerRef } = await createTestIntent(booking.id);

    await dbm.db
      .update(dbm.bookings)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(dz.eq(dbm.bookings.id, booking.id));

    const traceId = randomUUID();
    traces.push(traceId);
    const result = await capturem.capturePaymentByProviderRef({
      providerRef,
      amountCents: 10000,
      currency: 'BWP',
      providerPaymentId: 'TEST-PAYMENT-2',
      traceId,
    });
    expect(result).toEqual({ ok: false, status: 409, error: 'Booking is cancelled' });

    const [intentAfter] = await dbm.db
      .select()
      .from(dbm.paymentIntents)
      .where(dz.eq(dbm.paymentIntents.id, intent.id))
      .limit(1);
    expect(intentAfter.state).toBe('requires_payment');

    const paymentRows = await dbm.db
      .select()
      .from(dbm.payments)
      .where(dz.eq(dbm.payments.intentId, intent.id));
    expect(paymentRows).toHaveLength(0);

    const [bookingAfter] = await dbm.db
      .select()
      .from(dbm.bookings)
      .where(dz.eq(dbm.bookings.id, booking.id))
      .limit(1);
    expect(bookingAfter.status).toBe('cancelled');
    expect(bookingAfter.paidCents).toBe(0);
  });

  it('writes one request audit row per write and none for an idempotent replay', async () => {
    const store = new MemoryStore();
    const key = randomUUID();
    const traceId = randomUUID();
    traces.push(traceId);

    const makeRequest = () =>
      new Request('https://example.com/api/v1/test-audit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': key,
          'X-Forwarded-For': '203.0.113.9',
          'X-Trace-Id': traceId,
        },
        body: JSON.stringify({ secret: 'never-log-this' }),
      });
    const handler = async () => Response.json({ ok: true }, { status: 201 });

    const first = await idempotencym.withIdempotency(
      makeRequest(),
      { scope: 'test.audit' },
      handler,
      store,
    );
    const replay = await idempotencym.withIdempotency(
      makeRequest(),
      { scope: 'test.audit' },
      handler,
      store,
    );

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.headers.get('Idempotent-Replayed')).toBe('true');

    const rows = await dbm.db
      .select()
      .from(dbm.auditEvents)
      .where(dz.eq(dbm.auditEvents.traceId, traceId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'api.write',
      entityType: 'api_route',
      entityId: 'POST /api/v1/test-audit',
      ip: '203.0.113.9',
      traceId,
    });
    expect(JSON.stringify(rows[0].diff)).not.toContain('never-log-this');
  });
});
