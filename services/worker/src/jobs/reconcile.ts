import type { Job } from 'bullmq';
import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import {
  alertStates,
  auditEvents,
  bookingItems,
  bookings,
  db,
  ledgerEntries,
  paymentIntents,
  payments,
  refunds,
} from '@arrivesuite/db';
import type { ReconcileJobData } from '../queues';

export interface ReconcileResult {
  checked: number;
  mismatched: string[];
  intentsExpired: number;
  paymentMismatches: string[];
  refundMismatches: string[];
  refundsStuck: number;
  ledgerMissing: string[];
  ledgerUnbalanced: string[];
  raised: string[];
  traceId: string;
}

interface Finding {
  kind: string;
  reference: string;
  severity: 'P2' | 'P1';
  details: Record<string, unknown>;
}

// Overlap safety: checks are read-only (single repeatable-read snapshot)
// and every write is idempotent on retry (conditional expiry, alert
// upserts, audit appends). Per-run identity is job.id. A 4-minute ceiling
// bounds runaway runs inside the 5-minute interval.
const PROCESS_TIMEOUT_MS = 4 * 60_000;
const BATCH_SIZE = 200;
const GRACE_MS = 10 * 60_000;
const RENOTIFY_MS = 60 * 60_000;

export async function reconcileBookings(job: Job<ReconcileJobData>): Promise<ReconcileResult> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      runReconciliation(job),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('reconciliation timed out')), PROCESS_TIMEOUT_MS);
      }),
    ]);
  } finally {
    // Do not leave a 4-minute timer alive after a fast run.
    if (timer) clearTimeout(timer);
  }
}

type BookingRow = typeof bookings.$inferSelect;

async function runReconciliation(job: Job<ReconcileJobData>): Promise<ReconcileResult> {
  const { bookingId, traceId } = job.data;
  const runId = job.id ?? traceId;

  if (bookingId) {
    return checkSingleBooking(job, bookingId, runId, traceId);
  }
  return checkSweep(job, runId, traceId);
}

// Single-booking mode checks ONLY that booking — no global expiry, scans
// or alerts, so it never duplicates a concurrent sweep's work.
async function checkSingleBooking(
  job: Job<ReconcileJobData>,
  bookingId: string,
  runId: string,
  traceId: string,
): Promise<ReconcileResult> {
  const empty: ReconcileResult = {
    checked: 0, mismatched: [], intentsExpired: 0, paymentMismatches: [],
    refundMismatches: [], refundsStuck: 0, ledgerMissing: [], ledgerUnbalanced: [],
    raised: [], traceId,
  };
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!booking) return empty;

  const findings = await readFindingsFor([booking]);
  const raised = await syncAlertStates(findings, traceId);
  if (findings.length > 0) {
    await writeRunAudit(runId, traceId, 'booking', 1, findings);
  }
  await job.updateProgress(100);
  const ofKind = (kind: string) => findings.filter((f) => f.kind === kind).map((f) => f.reference);
  return {
    ...empty,
    checked: 1,
    mismatched: ofKind('booking_mismatch'),
    paymentMismatches: ofKind('payment_mismatch'),
    refundMismatches: ofKind('refund_mismatch'),
    refundsStuck: ofKind('refund_stuck').length,
    ledgerMissing: ofKind('ledger_missing'),
    ledgerUnbalanced: ofKind('ledger_unbalanced'),
    raised,
    traceId,
  };
}

async function checkSweep(job: Job, runId: string, traceId: string): Promise<ReconcileResult> {
  // Atomic conditional expiry: a capture that commits first drops the row
  // out of the WHERE, so webhooks can never be overwritten by the sweep.
  const expired = await db
    .update(paymentIntents)
    .set({ state: 'expired' })
    .where(and(eq(paymentIntents.state, 'requires_payment'), lt(paymentIntents.expiresAt, new Date())))
    .returning({ id: paymentIntents.id });

  // Cursor over ALL active bookings (createdAt, id) — no silent 100-row cap.
  // `pending_payment` is the current creation state; the rest keep the sweep
  // covering bookings that are still moving through the Section 9.1 machine.
  const openStatuses: BookingRow['status'][] = [
    'pending',
    'pending_payment',
    'confirmed',
    'on_hold',
    'ticketing',
    'ticketed',
    'exchanging',
  ];
  const checked: BookingRow[] = [];
  let cursor: { createdAt: Date; id: string } | null = null;
  for (;;) {
    const batch = await db
      .select()
      .from(bookings)
      .where(
        and(
          inArray(bookings.status, openStatuses),
          cursor
            ? or(
                lt(bookings.createdAt, cursor.createdAt),
                and(eq(bookings.createdAt, cursor.createdAt), lt(bookings.id, cursor.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(bookings.createdAt), desc(bookings.id))
      .limit(BATCH_SIZE);
    if (batch.length === 0) break;
    checked.push(...batch);
    cursor = { createdAt: batch[batch.length - 1].createdAt, id: batch[batch.length - 1].id };
    await job.updateProgress(Math.min(90, Math.round((checked.length / Math.max(checked.length, 1)) * 10)));
    if (batch.length < BATCH_SIZE) break;
  }

  const findings = await readFindingsFor(checked);
  const raised = await syncAlertStates(findings, traceId);
  if (findings.length > 0 || expired.length > 0) {
    await writeRunAudit(runId, traceId, 'sweep', checked.length, findings, expired.length);
  }
  await job.updateProgress(100);
  return {
    checked: checked.length,
    ...summarize(findings),
    intentsExpired: expired.length,
    raised,
    traceId,
  };
}

function summarize(findings: Finding[]): Pick<ReconcileResult, 'mismatched' | 'paymentMismatches' | 'refundMismatches' | 'refundsStuck' | 'ledgerMissing' | 'ledgerUnbalanced'> {
  const ofKind = (kind: string) => findings.filter((f) => f.kind === kind).map((f) => f.reference);
  return {
    mismatched: ofKind('booking_mismatch'),
    paymentMismatches: ofKind('payment_mismatch'),
    refundMismatches: ofKind('refund_mismatch'),
    refundsStuck: ofKind('refund_stuck').length,
    ledgerMissing: ofKind('ledger_missing'),
    ledgerUnbalanced: ofKind('ledger_unbalanced'),
  };
}

// The whole check phase runs in one repeatable-read snapshot with a
// statement timeout, so a mid-run capture can't produce a one-cycle
// false mismatch. Writes (alerts, audit) happen outside, afterwards.
async function readFindingsFor(targets: BookingRow[]): Promise<Finding[]> {
  if (targets.length === 0) return [];
  const findings: Finding[] = [];

  await db.transaction(
    async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '150000'`);

      // Single items query for all targets (no N+1).
      const ids = targets.map((b) => b.id);
      const allItems = await tx.select().from(bookingItems).where(inArray(bookingItems.bookingId, ids));
      const itemsByBooking = new Map<string, typeof allItems>();
      for (const item of allItems) {
        const list = itemsByBooking.get(item.bookingId) ?? [];
        list.push(item);
        itemsByBooking.set(item.bookingId, list);
      }
      for (const booking of targets) {
        const items = itemsByBooking.get(booking.id) ?? [];
        const subtotal = items.reduce((s, i) => s + i.netCents + i.markupCents, 0);
        const tax = items.reduce((s, i) => s + i.taxCents, 0);
        if (subtotal !== booking.subtotalCents || tax !== booking.taxCents || subtotal + tax !== booking.totalCents) {
          findings.push({ kind: 'booking_mismatch', reference: booking.ref.trim(), severity: 'P1', details: { bookingId: booking.id } });
        }
      }

      // Captured payments must sum to paidCents — scoped to checked bookings.
      const sums = await tx
        .select({
          bookingId: paymentIntents.bookingId,
          capturedCents: sql<number>`coalesce(sum(${payments.amountCents}), 0)`,
        })
        .from(paymentIntents)
        .leftJoin(payments, eq(payments.intentId, paymentIntents.id))
        .where(and(eq(paymentIntents.state, 'captured'), inArray(paymentIntents.bookingId, ids)))
        .groupBy(paymentIntents.bookingId);
      const paidByBooking = new Map(sums.map((s) => [s.bookingId, Number(s.capturedCents)]));
      for (const b of targets) {
        if ((paidByBooking.get(b.id) ?? 0) !== b.paidCents) {
          findings.push({ kind: 'payment_mismatch', reference: b.ref.trim(), severity: 'P1', details: { bookingId: b.id } });
        }
      }

      // Completed refunds must sum to refundedCents; no payment may refund
      // more than captured.
      const refundSums = await tx
        .select({
          bookingId: paymentIntents.bookingId,
          refundedCents: sql<number>`coalesce(sum(${refunds.amountCents}), 0)`,
        })
        .from(refunds)
        .innerJoin(payments, eq(payments.id, refunds.paymentId))
        .innerJoin(paymentIntents, eq(paymentIntents.id, payments.intentId))
        .where(and(eq(refunds.state, 'completed'), inArray(paymentIntents.bookingId, ids)))
        .groupBy(paymentIntents.bookingId);
      const refundedByBooking = new Map(refundSums.map((s) => [s.bookingId, Number(s.refundedCents)]));
      for (const b of targets) {
        if ((refundedByBooking.get(b.id) ?? 0) !== b.refundedCents) {
          findings.push({ kind: 'refund_mismatch', reference: b.ref.trim(), severity: 'P1', details: { bookingId: b.id } });
        }
      }
      const overRefunded = await tx
        .select({
          paymentId: payments.id,
          captured: payments.amountCents,
          refunded: sql<number>`coalesce(sum(${refunds.amountCents}), 0)`,
        })
        .from(payments)
        .leftJoin(refunds, and(eq(refunds.paymentId, payments.id), eq(refunds.state, 'completed')))
        .where(eq(payments.status, 'captured'))
        .groupBy(payments.id, payments.amountCents)
        .having(sql`coalesce(sum(${refunds.amountCents}), 0) > ${payments.amountCents}`);
      for (const row of overRefunded) {
        findings.push({ kind: 'over_refunded', reference: row.paymentId, severity: 'P1', details: {} });
      }

      // Stuck refunds (>24h pending/approved) for checked bookings only.
      const stuckCutoff = new Date(Date.now() - 24 * 60 * 60_000);
      const stuck = await tx
        .select({ id: refunds.id, bookingId: paymentIntents.bookingId })
        .from(refunds)
        .innerJoin(payments, eq(payments.id, refunds.paymentId))
        .innerJoin(paymentIntents, eq(paymentIntents.id, payments.intentId))
        .where(
          and(
            inArray(refunds.state, ['pending', 'approved'] as const),
            lt(refunds.createdAt, stuckCutoff),
            inArray(paymentIntents.bookingId, ids),
          ),
        );
      for (const s of stuck) {
        findings.push({ kind: 'refund_stuck', reference: s.id, severity: 'P2', details: { bookingId: s.bookingId } });
      }

      // Ledger: existence AND balance per reference, scoped to checked bookings.
      const scopedPaymentIds = (
        await tx
          .select({ id: payments.id })
          .from(payments)
          .innerJoin(paymentIntents, eq(paymentIntents.id, payments.intentId))
          .where(and(eq(payments.status, 'captured'), inArray(paymentIntents.bookingId, ids)))
      ).map((r) => r.id);
      const scopedRefundIds = (
        await tx
          .select({ id: refunds.id })
          .from(refunds)
          .innerJoin(payments, eq(payments.id, refunds.paymentId))
          .innerJoin(paymentIntents, eq(paymentIntents.id, payments.intentId))
          .where(and(eq(refunds.state, 'completed'), inArray(paymentIntents.bookingId, ids)))
      ).map((r) => r.id);
      const refs = [...scopedPaymentIds.map((id) => ({ type: 'payment' as const, id })), ...scopedRefundIds.map((id) => ({ type: 'refund' as const, id }))];
      if (refs.length > 0) {
        const balances = await tx
          .select({
            referenceId: ledgerEntries.referenceId,
            debit: sql<number>`coalesce(sum(${ledgerEntries.amountCents}) filter (where ${ledgerEntries.direction} = 'debit'), 0)`,
            credit: sql<number>`coalesce(sum(${ledgerEntries.amountCents}) filter (where ${ledgerEntries.direction} = 'credit'), 0)`,
          })
          .from(ledgerEntries)
          .where(
            inArray(
              ledgerEntries.referenceId,
              refs.map((r) => r.id),
            ),
          )
          .groupBy(ledgerEntries.referenceId);
        const seen = new Map(balances.map((b) => [b.referenceId, b]));
        for (const r of refs) {
          const bal = seen.get(r.id);
          if (!bal) {
            findings.push({ kind: 'ledger_missing', reference: `${r.type}:${r.id}`, severity: 'P2', details: {} });
          } else if (Number(bal.debit) !== Number(bal.credit) || Number(bal.debit) <= 0) {
            findings.push({ kind: 'ledger_unbalanced', reference: `${r.type}:${r.id}`, severity: 'P1', details: {} });
          }
        }
      }
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );

  return findings;
}

// Alert state machine: record on first sight, page (audit alert.raised)
// only past the grace period and at most hourly, resolve when gone.
async function syncAlertStates(findings: Finding[], traceId: string): Promise<string[]> {
  const now = Date.now();
  const raised: string[] = [];
  const open = new Map(findings.map((f) => [`${f.kind}:${f.reference}`, f]));

  const allStates = await db.select().from(alertStates);
  const unresolved = allStates.filter((s) => !s.resolvedAt);

  for (const state of unresolved) {
    const key = `${state.kind}:${state.reference}`;
    if (!open.has(key)) {
      await db.update(alertStates).set({ resolvedAt: new Date() }).where(eq(alertStates.id, state.id));
    }
  }

  for (const finding of findings) {
    const [existing] = await db
      .select()
      .from(alertStates)
      .where(and(eq(alertStates.kind, finding.kind), eq(alertStates.reference, finding.reference)))
      .orderBy(desc(alertStates.firstSeenAt))
      .limit(1);
    if (!existing || existing.resolvedAt) {
      await db.insert(alertStates).values({
        kind: finding.kind,
        reference: finding.reference,
        severity: finding.severity,
        details: finding.details,
      });
      continue;
    }
    const ageMs = now - existing.firstSeenAt.getTime();
    const sinceNotifyMs = existing.lastNotifiedAt ? now - existing.lastNotifiedAt.getTime() : Infinity;
    const escalated: 'P2' | 'P1' = ageMs > 60 * 60_000 ? 'P1' : finding.severity;
    if (ageMs > GRACE_MS && sinceNotifyMs > RENOTIFY_MS) {
      await db
        .update(alertStates)
        .set({ lastNotifiedAt: new Date(), severity: escalated })
        .where(eq(alertStates.id, existing.id));
      await db.insert(auditEvents).values({
        action: 'alert.raised',
        entityType: 'alert',
        entityId: existing.id,
        diff: { kind: finding.kind, reference: finding.reference, severity: escalated, details: finding.details },
        traceId,
      });
      raised.push(`${finding.kind}:${finding.reference}`);
    }
  }
  return raised;
}

async function writeRunAudit(
  runId: string,
  traceId: string,
  scope: string,
  checked: number,
  findings: Finding[],
  intentsExpired = 0,
): Promise<void> {
  await db.insert(auditEvents).values({
    actorRealm: null,
    action: 'reconciliation.completed',
    entityType: 'reconciliation',
    entityId: runId,
    diff: {
      checked,
      findings: findings.map((f) => `${f.kind}:${f.reference}`),
      intentsExpired,
      scope,
    },
    traceId,
  });
}
