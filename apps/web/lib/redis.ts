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
