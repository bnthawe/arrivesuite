import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Job } from 'bullmq';
import type { Queue } from 'bullmq';
import type { ReconcileJobData } from '../queues';
import type { WorkerRuntime } from '../runtime';

type DbModule = typeof import('@arrivesuite/db');
type ReconcileModule = typeof import('./reconcile');
type QueueModule = typeof import('../queues');
type RuntimeModule = typeof import('../runtime');
type DrizzleModule = typeof import('drizzle-orm');

const testDatabase = process.env.TEST_DATABASE_URL;
const testRedis = process.env.TEST_REDIS_URL;
const suite = testDatabase && testRedis ? describe : describe.skip;

suite('worker reconciliation (database + Redis)', () => {
  let dbm: DbModule;
  let reconcilem: ReconcileModule;
  let queuesm: QueueModule;
  let runtimem: RuntimeModule;
  let dz: DrizzleModule;
  let queue: Queue<ReconcileJobData>;
  let runtime: WorkerRuntime;

  const bookingIds: string[] = [];
  const intentIds: string[] = [];
  const paymentIds: string[] = [];
  const traces: string[] = [];
  const alertRefs: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabase!;
    process.env.REDIS_URL = testRedis!;

    dbm = await import('@arrivesuite/db');
    reconcilem = await import('./reconcile');
    queuesm = await import('../queues');
    runtimem = await import('../runtime');
    dz = await import('drizzle-orm');

    queue = queuesm.getReconciliationQueue();
    await queue.obliterate({ force: true }).catch(() => {});
    runtime = await runtimem.startWorker({ port: 0, registerSweep: false, concurrency: 1 });
  }, 30_000);

  afterAll(async () => {
    try {
      if (runtime) await runtime.close().catch(() => {});
      if (queue) {
        await queue.obliterate({ force: true }).catch(() => {});
        await queuesm?.closeReconciliationQueue().catch(() => {});
      }
      if (!dbm || !dz) return;

      if (traces.length > 0) {
        await dbm.db
          .delete(dbm.auditEvents)
          .where(dz.inArray(dbm.auditEvents.traceId, traces));
      }
      if (alertRefs.length > 0) {
        await dbm.db
          .delete(dbm.alertStates)
          .where(dz.inArray(dbm.alertStates.reference, alertRefs));
      }
      if (paymentIds.length > 0) {
        await dbm.db
          .delete(dbm.ledgerEntries)
          .where(dz.inArray(dbm.ledgerEntries.referenceId, paymentIds));
        await dbm.db
          .delete(dbm.refunds)
          .where(dz.inArray(dbm.refunds.paymentId, paymentIds));
        await dbm.db.delete(dbm.payments).where(dz.inArray(dbm.payments.id, paymentIds));
      }
      if (intentIds.length > 0) {
        await dbm.db
          .delete(dbm.paymentIntents)
          .where(dz.inArray(dbm.paymentIntents.id, intentIds));
      }
      if (bookingIds.length > 0) {
        await dbm.db
          .delete(dbm.bookingItems)
          .where(dz.inArray(dbm.bookingItems.bookingId, bookingIds));
        await dbm.db.delete(dbm.bookings).where(dz.inArray(dbm.bookings.id, bookingIds));
      }
    } finally {
      if (dbm) await dbm.client.end({ timeout: 5 });
    }
  }, 30_000);

  async function customerAccount() {
    const [account] = await dbm.db
      .select()
      .from(dbm.accounts)
      .where(dz.eq(dbm.accounts.email, 'customer@arrivesuite.com'))
      .limit(1);
    if (!account) throw new Error('Seed account customer@arrivesuite.com is missing');
    return account;
  }

  async function createBooking(options: {
    status: 'pending_payment' | 'confirmed';
    withItems?: boolean;
    paidCents?: number;
  }) {
    const account = await customerAccount();
    const traceId = randomUUID();
    traces.push(traceId);
    const [booking] = await dbm.db
      .insert(dbm.bookings)
      .values({
        ref: `WRK${randomUUID().replace(/-/g, '').slice(0, 10)}`.toUpperCase(),
        accountId: account.id,
        channel: 'web',
        status: options.status,
        currency: 'BWP',
        baseCurrency: 'BWP',
        subtotalCents: 10000,
        taxCents: 0,
        totalCents: 10000,
        paidCents: options.paidCents ?? 0,
        idempotencyKey: randomUUID(),
        traceId,
      })
      .returning();
    bookingIds.push(booking.id);

    if (options.withItems !== false) {
      await dbm.db.insert(dbm.bookingItems).values({
        bookingId: booking.id,
        itemType: 'test',
        itemRef: 'worker-reconcile',
        itemSupplierType: 'test',
        snapshot: { test: true },
        netCents: 10000,
        markupCents: 0,
        taxCents: 0,
        totalCents: 10000,
      });
    }
    return booking;
  }

  async function createIntent(bookingId: string, state: 'requires_payment' | 'captured', expiresAt: Date) {
    const [intent] = await dbm.db
      .insert(dbm.paymentIntents)
      .values({
        bookingId,
        amountCents: 10000,
        currency: 'BWP',
        method: 'paystack',
        state,
        providerRef: `WRK-${randomUUID()}`,
        expiresAt,
      })
      .returning();
    intentIds.push(intent.id);
    return intent;
  }

  async function createCapturedPayment(bookingId: string) {
    const intent = await createIntent(bookingId, 'captured', new Date(Date.now() + 3_600_000));
    const [payment] = await dbm.db
      .insert(dbm.payments)
      .values({
        intentId: intent.id,
        providerPaymentId: `WRK-${randomUUID()}`,
        amountCents: 10000,
        currency: 'BWP',
        status: 'captured',
        capturedAt: new Date(),
      })
      .returning();
    paymentIds.push(payment.id);
    return payment;
  }

  async function waitForAudit(jobId: string, traceId: string) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const [row] = await dbm.db
        .select()
        .from(dbm.auditEvents)
        .where(
          dz.and(
            dz.eq(dbm.auditEvents.action, 'reconciliation.completed'),
            dz.eq(dbm.auditEvents.entityId, jobId),
            dz.eq(dbm.auditEvents.traceId, traceId),
          ),
        )
        .limit(1);
      if (row) return row;
      await delay(100);
    }
    throw new Error(`Timed out waiting for reconciliation audit for job ${jobId}`);
  }

  it('checks a single booking and appends reconciliation.completed', async () => {
    const booking = await createBooking({ status: 'confirmed', paidCents: 10000 });
    const traceId = randomUUID();
    traces.push(traceId);
    const runId = `single-${randomUUID()}`;

    const job = {
      id: runId,
      data: { bookingId: booking.id, traceId },
      updateProgress: async () => {},
    } as unknown as Job<ReconcileJobData>;

    const result = await reconcilem.reconcileBookings(job);
    expect(result.checked).toBe(1);
    expect(result.paymentMismatches).toContain(booking.ref);
    expect(result.mismatched).not.toContain(booking.ref);

    const [audit] = await dbm.db
      .select()
      .from(dbm.auditEvents)
      .where(
        dz.and(
          dz.eq(dbm.auditEvents.action, 'reconciliation.completed'),
          dz.eq(dbm.auditEvents.entityId, runId),
        ),
      )
      .limit(1);
    expect(audit?.traceId).toBe(traceId);
    expect(audit?.diff).toMatchObject({ scope: 'booking', checked: 1 });
    expect((audit?.diff as { findings: string[] }).findings).toContain(
      `payment_mismatch:${booking.ref}`,
    );
  });

  it('sweeps pending_payment and confirmed bookings through BullMQ', async () => {
    const malformed = await createBooking({ status: 'pending_payment', withItems: false });
    const expiring = await createBooking({ status: 'pending_payment' });
    const expiringIntent = await createIntent(
      expiring.id,
      'requires_payment',
      new Date(Date.now() - 60_000),
    );
    const captured = await createBooking({ status: 'confirmed', paidCents: 10000 });
    const payment = await createCapturedPayment(captured.id);
    alertRefs.push(malformed.ref, `payment:${payment.id}`);

    const traceId = randomUUID();
    traces.push(traceId);
    const jobId = await queuesm.enqueueReconciliation({ traceId });
    expect(jobId).toBeTruthy();

    const audit = await waitForAudit(jobId!, traceId);
    const diff = audit.diff as {
      checked: number;
      findings: string[];
      intentsExpired: number;
      scope: string;
    };
    expect(diff.scope).toBe('sweep');
    expect(diff.checked).toBeGreaterThanOrEqual(3);
    expect(diff.findings).toContain(`booking_mismatch:${malformed.ref}`);
    expect(diff.findings).toContain(`ledger_missing:payment:${payment.id}`);
    expect(diff.intentsExpired).toBeGreaterThanOrEqual(1);

    const [intentAfter] = await dbm.db
      .select()
      .from(dbm.paymentIntents)
      .where(dz.eq(dbm.paymentIntents.id, expiringIntent.id))
      .limit(1);
    expect(intentAfter.state).toBe('expired');

    const alerts = await dbm.db
      .select()
      .from(dbm.alertStates)
      .where(dz.inArray(dbm.alertStates.reference, [malformed.ref, `payment:${payment.id}`]));
    expect(alerts).toHaveLength(2);

    // Resolving an alert does not delete it. A recurrence must reopen the
    // existing row; inserting again would violate the (kind, reference) index.
    const [resolvedManually] = alerts;
    await dbm.db
      .update(dbm.alertStates)
      .set({ resolvedAt: new Date() })
      .where(dz.eq(dbm.alertStates.id, resolvedManually.id));

    const secondTraceId = randomUUID();
    traces.push(secondTraceId);
    const secondJobId = await queuesm.enqueueReconciliation({ traceId: secondTraceId });
    await waitForAudit(secondJobId!, secondTraceId);

    const [reopened] = await dbm.db
      .select()
      .from(dbm.alertStates)
      .where(dz.eq(dbm.alertStates.id, resolvedManually.id))
      .limit(1);
    expect(reopened?.resolvedAt).toBeNull();
    expect(reopened?.firstSeenAt.getTime()).toBeGreaterThan(
      resolvedManually.firstSeenAt.getTime(),
    );

    const afterSecondSweep = await dbm.db
      .select()
      .from(dbm.alertStates)
      .where(dz.inArray(dbm.alertStates.reference, [malformed.ref, `payment:${payment.id}`]));
    expect(afterSecondSweep).toHaveLength(2);
  }, 30_000);

  it('serves /health with Redis and the worker ready', async () => {
    const res = await fetch(`http://127.0.0.1:${runtime.port}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      status: 'ok',
      service: 'worker',
      queue: queuesm.RECONCILIATION_QUEUE,
      redis: 'up',
      workerRunning: true,
    });

    const missing = await fetch(`http://127.0.0.1:${runtime.port}/not-found`);
    expect(missing.status).toBe(404);
  });
});
