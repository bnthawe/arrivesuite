import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { Worker } from 'bullmq';
import type IORedis from 'ioredis';
import { createRedisConnection } from './connection';
import {
  RECONCILIATION_QUEUE,
  getReconciliationQueue,
  RETENTION_QUEUE,
  getRetentionQueue,
  type ReconcileJobData,
} from './queues';
import { reconcileBookings } from './jobs/reconcile';
import { runRetention, type RetentionJobData } from './jobs/retention';

export interface WorkerRuntimeOptions {
  /** 0 picks an ephemeral port; useful for tests. */
  port?: number;
  /** Main registers the 5-minute sweep. Tests can disable it. */
  registerSweep?: boolean;
  sweepIntervalMs?: number;
  concurrency?: number;
}

export interface WorkerRuntime {
  port: number;
  server: Server;
  worker: Worker<ReconcileJobData>;
  retentionWorker: Worker<RetentionJobData>;
  connection: IORedis;
  close: () => Promise<void>;
}

function parsePort(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === '') return fallback;
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid WORKER_PORT: ${JSON.stringify(raw)}`);
  }
  return port;
}

export async function startWorker(options: WorkerRuntimeOptions = {}): Promise<WorkerRuntime> {
  const requestedPort = options.port ?? parsePort(process.env.WORKER_PORT, 3001);
  const connection = createRedisConnection();
  const worker = new Worker<ReconcileJobData>(RECONCILIATION_QUEUE, reconcileBookings, {
    connection,
    concurrency: options.concurrency ?? 5,
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

  // Retention worker (nightly PII redaction)
  const retentionConnection = createRedisConnection();
  const retentionWorker = new Worker<RetentionJobData>(RETENTION_QUEUE, runRetention, {
    connection: retentionConnection,
    concurrency: 1,
  });

  retentionWorker.on('completed', (job) => {
    console.log(`[retention] job ${job.id} (${job.name}) completed`);
  });
  retentionWorker.on('failed', (job, err) => {
    console.error(`[retention] job ${job?.id} (${job?.name}) failed: ${err.message}`);
  });
  retentionWorker.on('error', (err) => {
    console.error(`[retention] error: ${err.message}`);
  });

  let server: Server | null = null;
  let closed = false;
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    if (server) {
      await new Promise<void>((resolve) => {
        server!.close(() => resolve());
      });
    }
    await worker.close();
    await retentionWorker.close();
    // Worker may already own/close the connection; make shutdown idempotent.
    await Promise.resolve(connection.quit()).catch(() => {});
    await Promise.resolve(retentionConnection.quit()).catch(() => {});
  };

  try {
    await worker.waitUntilReady();

    if (options.registerSweep !== false) {
      await getReconciliationQueue().add(
        'reconcile-sweep',
        { traceId: randomUUID() },
        {
          repeat: { every: options.sweepIntervalMs ?? 5 * 60_000 },
          jobId: 'reconcile-sweep-repeat',
        },
      );
      // Nightly retention: redact PII for bookings older than 7 years.
      await getRetentionQueue().add(
        'retention-sweep',
        { traceId: randomUUID(), retentionDays: 7 * 365 },
        {
          repeat: { every: 24 * 60 * 60_000 },
          jobId: 'retention-sweep-repeat',
        },
      );
    }

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
        const running = worker.isRunning();
        const ok = redis === 'up' && running;
        res.writeHead(ok ? 200 : 503, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            status: ok ? 'ok' : 'degraded',
            service: 'worker',
            queue: RECONCILIATION_QUEUE,
            redis,
            workerRunning: running,
          }),
        );
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve, reject) => {
      server!.once('error', reject);
      server!.listen(requestedPort, () => {
        server!.off('error', reject);
        resolve();
      });
    });

    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : requestedPort;
    return { port, server, worker, retentionWorker, connection, close };
  } catch (err) {
    await close().catch(() => {});
    throw err;
  }
}
