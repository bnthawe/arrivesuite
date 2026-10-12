import { createServer } from 'node:http';
import { Worker } from 'bullmq';
import { createRedisConnection } from './connection';
import { RECONCILIATION_QUEUE, getReconciliationQueue, type ReconcileJobData } from './queues';
import { reconcileBookings } from './jobs/reconcile';

const PORT = Number(process.env.WORKER_PORT ?? 3001);

async function main(): Promise<void> {
  const connection = createRedisConnection();
  const worker = new Worker<ReconcileJobData>(RECONCILIATION_QUEUE, reconcileBookings, {
    connection,
    concurrency: 5,
  });

  worker.on('completed', (job) => {
    console.log(`[worker] job ${job.id} (${job.name}) completed`);
  });
  worker.on('failed', (job, err) => {
    console.error(`[worker] job ${job?.id} (${job?.name}) failed: ${err.message}`);
  });
  worker.on('error', (err) => {
    console.error(`[worker] error: ${err.message}`);
  });

  // Repeatable sweep on the reconciliation cycle (FR-5.17.6: 5 minutes).
  await getReconciliationQueue().add(
    'reconcile-sweep',
    { traceId: crypto.randomUUID() },
    {
      repeat: { every: 5 * 60 * 1_000 },
      jobId: 'reconcile-sweep-repeat',
    },
  );

  createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'worker', queue: RECONCILIATION_QUEUE }));
      return;
    }
    res.writeHead(404);
    res.end();
  }).listen(PORT, () => {
    console.log(`[worker] listening on :${PORT}, processing queue "${RECONCILIATION_QUEUE}"`);
  });
}

main().catch((err) => {
  console.error('[worker] fatal', err);
  process.exit(1);
});
