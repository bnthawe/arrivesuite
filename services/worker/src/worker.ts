import { createServer, type Server } from 'node:http';
import { Worker } from 'bullmq';
import { createRedisConnection } from './connection';
import {
  RECONCILIATION_QUEUE,
  closeReconciliationQueue,
  getReconciliationQueue,
  type ReconcileJobData,
} from './queues';
import { reconcileBookings } from './jobs/reconcile';
import { client } from '@arrivesuite/db';

function parsePort(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === '') return fallback;
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid WORKER_PORT: ${JSON.stringify(raw)}`);
  }
  return port;
}

const PORT = parsePort(process.env.WORKER_PORT, 3001);

let worker: Worker<ReconcileJobData> | null = null;
let server: Server | null = null;
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] ${signal} received, draining`);
  // Hard stop if graceful drain stalls (compose stop grace period is 10s
  // by default; keep this under it).
  setTimeout(() => process.exit(1), 9_000).unref();
  try {
    await new Promise<void>((resolve, reject) => {
      if (!server) return resolve();
      server.close((err) => (err ? reject(err) : resolve()));
    });
    if (worker) await worker.close(); // waits for in-flight jobs
    await closeReconciliationQueue();
    await client.end({ timeout: 5 });
    console.log('[worker] shutdown complete');
    process.exit(0);
  } catch (err) {
    console.error('[worker] shutdown error', err);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const connection = createRedisConnection();
  worker = new Worker<ReconcileJobData>(RECONCILIATION_QUEUE, reconcileBookings, {
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
  // The static jobId is intentional; per-run identity comes from job.id
  // inside the processor, not from this registration-time traceId.
  await getReconciliationQueue().add(
    'reconcile-sweep',
    { traceId: crypto.randomUUID() },
    {
      repeat: { every: 5 * 60 * 1_000 },
      jobId: 'reconcile-sweep-repeat',
    },
  );

  server = createServer(async (req, res) => {
    if (req.url === '/health') {
      // Readiness, not just liveness: Redis reachable and worker running.
      let redis: string;
      try {
        await connection.ping();
        redis = 'up';
      } catch {
        redis = 'down';
      }
      const running = worker?.isRunning() ?? false;
      const ok = redis === 'up' && running;
      res.writeHead(ok ? 200 : 503, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({ status: ok ? 'ok' : 'degraded', service: 'worker', queue: RECONCILIATION_QUEUE, redis, workerRunning: running }),
      );
      return;
    }
    res.writeHead(404);
    res.end();
  }).listen(PORT, () => {
    console.log(`[worker] listening on :${PORT}, processing queue "${RECONCILIATION_QUEUE}"`);
  });

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[worker] fatal', err);
  process.exit(1);
});
