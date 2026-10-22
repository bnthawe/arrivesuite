import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { Worker } from 'bullmq';
import type IORedis from 'ioredis';
import { createRedisConnection } from './connection';
import {
  RECONCILIATION_QUEUE,
  getReconciliationQueue,
  type ReconcileJobData,
} from './queues';
import { reconcileBookings } from './jobs/reconcile';

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
    // Worker may already own/close the connection; make shutdown idempotent.
    await Promise.resolve(connection.quit()).catch(() => {});
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
    return { port, server, worker, connection, close };
  } catch (err) {
    await close().catch(() => {});
    throw err;
  }
}
