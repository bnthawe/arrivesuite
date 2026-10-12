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
  }
  return queue;
}

export async function enqueueReconciliation(data: ReconcileJobData): Promise<string | undefined> {
  const q = getReconciliationQueue();
  const job = await q.add(
    data.bookingId ? 'reconcile-booking' : 'reconcile-sweep',
    data,
    data.bookingId ? { jobId: `reconcile-${data.bookingId}-${Date.now()}` } : undefined,
  );
  return job.id;
}
