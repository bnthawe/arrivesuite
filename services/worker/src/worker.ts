import { client } from '@arrivesuite/db';
import { RECONCILIATION_QUEUE, closeReconciliationQueue } from './queues';
import { startWorker, type WorkerRuntime } from './runtime';

let runtime: WorkerRuntime | null = null;
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] ${signal} received, draining`);
  // Hard stop if graceful drain stalls (compose stop grace period is 10s
  // by default; keep this under it).
  setTimeout(() => process.exit(1), 9_000).unref();
  try {
    if (runtime) await runtime.close(); // waits for in-flight jobs
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
  runtime = await startWorker();
  console.log(
    `[worker] listening on :${runtime.port}, processing queue "${RECONCILIATION_QUEUE}"`,
  );

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[worker] fatal', err);
  process.exit(1);
});
