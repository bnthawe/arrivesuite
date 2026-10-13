import { Queue } from 'bullmq';
import { createRedisConnection } from './connection';

export const RECONCILIATION_QUEUE = 'reconciliation';

export interface ReconcileJobData {
  /** Narrow the run to one booking; omit to sweep recent open bookings. */
  bookingId?: string;
  traceId: string;
}

let queue: Queue<ReconcileJobData> | null = null;

export function getReconciliationQueue(): Queue<ReconcileJobData> {
  if (!queue) {
    queue = new Queue<ReconcileJobData>(RECONCILIATION_QUEUE, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });
    // BullMQ recommends an error listener: an unhandled 'error' event on
    // a Redis hiccup can crash the process.
    queue.on('error', (err) => {
      console.error(`[queue] error: ${(err as Error)?.message ?? err}`);
    });
  }
  return queue;
}

export async function closeReconciliationQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}

export async function enqueueReconciliation(data: ReconcileJobData): Promise<string | undefined> {
  const q = getReconciliationQueue();
  // Deduplicate re-enqueues of the same booking within 60s (BullMQ 5.x
  // deduplication) instead of a Date.now() suffix that defeats it.
  const job = await q.add(
    data.bookingId ? 'reconcile-booking' : 'reconcile-sweep',
    data,
    data.bookingId ? { deduplication: { id: `reconcile-${data.bookingId}`, ttl: 60_000 } } : undefined,
  );
  return job.id;
}
