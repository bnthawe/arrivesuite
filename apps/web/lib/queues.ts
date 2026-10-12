import { Queue } from 'bullmq';
import { getRedis } from './redis';

export const RECONCILIATION_QUEUE = 'reconciliation';

export interface ReconcileJobData {
  bookingId?: string;
  traceId: string;
}

let queue: Queue<ReconcileJobData> | null = null;

function getQueue(): Queue<ReconcileJobData> {
  if (!queue) {
    queue = new Queue<ReconcileJobData>(RECONCILIATION_QUEUE, { connection: getRedis() });
  }
  return queue;
}

// Best-effort: booking creation must never fail because the queue is down.
export async function enqueueReconciliation(data: ReconcileJobData): Promise<void> {
  try {
    await getQueue().add(data.bookingId ? 'reconcile-booking' : 'reconcile-sweep', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
    });
  } catch (err) {
    console.error('[queues] failed to enqueue reconciliation', err);
  }
}
