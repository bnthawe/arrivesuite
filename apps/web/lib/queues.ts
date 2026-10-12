import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export const RECONCILIATION_QUEUE = 'reconciliation';

export interface ReconcileJobData {
  bookingId?: string;
  traceId: string;
}

let queue: Queue<ReconcileJobData> | null = null;

function getQueue(): Queue<ReconcileJobData> {
  if (!queue) {
    const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
    queue = new Queue<ReconcileJobData>(RECONCILIATION_QUEUE, { connection });
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
