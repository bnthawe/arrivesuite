import IORedis from 'ioredis';

// BullMQ requires maxRetriesPerRequest: null and works over native TCP.
// Local dev uses REDIS_URL=redis://localhost:6379; production uses the
// Upstash native TCP endpoint (never the HTTPS client — ADR-0016).
export function createRedisConnection(): IORedis {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  return new IORedis(url, { maxRetriesPerRequest: null });
}
