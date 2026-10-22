import IORedis from 'ioredis';

let redis: IORedis | null = null;

// Producer/cache connection (web request path): fail fast, never hang.
// maxRetriesPerRequest: null is REQUIRED for BullMQ workers but must NOT
// be used here — with it, a single command waits on Redis forever and the
// request handler hangs instead of erroring into its try/catch.
export function getRedis(): IORedis {
  if (!redis) {
    redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false,
      connectTimeout: 5000,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 2000)),
    });
    redis.on('error', (err) => {
      console.error(`[redis] error: ${(err as Error)?.message ?? err}`);
    });
  }
  return redis;
}

// getRedis deliberately disables the offline command queue so a dead Redis
// cannot hang a request. That means the first command can race the initial
// connection; wait for the ready event (bounded) before issuing it.
export async function waitUntilRedisReady(
  client: IORedis,
  timeoutMs = 5_000,
): Promise<void> {
  if (client.status === 'ready') return;
  if (client.status === 'end') throw new Error('Redis connection is closed');

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Redis did not become ready in time'));
    }, timeoutMs);
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = (err: unknown) => {
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    const cleanup = () => {
      clearTimeout(timer);
      client.off('ready', onReady);
      client.off('error', onError);
    };
    client.once('ready', onReady);
    client.once('error', onError);
  });
}
