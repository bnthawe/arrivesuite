import { createHash, randomUUID } from 'node:crypto';
import { getRedis } from './redis';

// ADR-0014 / FR-5.15.34: client-generated key, server dedupe, 24h retention.
// Completed responses are cached by scope + caller identity + key, so a retry
// replays the original response instead of repeating supplier/provider calls.
const PROCESSING_TTL_SECONDS = 120;
const COMPLETED_TTL_SECONDS = 86_400;

const COMPLETE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
  return 1
end
return 0
`;

const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

export interface IdempotencyStore {
  claim(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  get(key: string): Promise<string | null>;
  complete(key: string, claimValue: string, value: string, ttlSeconds: number): Promise<boolean>;
  release(key: string, claimValue: string): Promise<boolean>;
}

type RedisClient = ReturnType<typeof getRedis>;

export function createRedisIdempotencyStore(redis = getRedis()): IdempotencyStore {
  return {
    async claim(key, value, ttlSeconds) {
      await waitUntilReady(redis);
      return (await redis.set(key, value, 'EX', ttlSeconds, 'NX')) === 'OK';
    },
    async get(key) {
      await waitUntilReady(redis);
      return redis.get(key);
    },
    async complete(key, claimValue, value, ttlSeconds) {
      await waitUntilReady(redis);
      const result = await redis.eval(
        COMPLETE_SCRIPT,
        1,
        key,
        claimValue,
        value,
        String(ttlSeconds),
      );
      return Number(result) === 1;
    },
    async release(key, claimValue) {
      await waitUntilReady(redis);
      const result = await redis.eval(RELEASE_SCRIPT, 1, key, claimValue);
      return Number(result) === 1;
    },
  };
}

// getRedis deliberately disables the offline command queue so a dead Redis
// cannot hang a request. That means the first command can race the initial
// connection; wait for the ready event (bounded) before issuing it.
async function waitUntilReady(redis: RedisClient, timeoutMs = 5_000): Promise<void> {
  if (redis.status === 'ready') return;
  if (redis.status === 'end') throw new Error('Redis connection is closed');

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
      redis.off('ready', onReady);
      redis.off('error', onError);
    };
    redis.once('ready', onReady);
    redis.once('error', onError);
  });
}

export interface IdempotencyOptions {
  // Stable route/action name, e.g. "bookings.create" or "refunds.approve".
  scope: string;
  // Caller identity (account id, supplier id, or "anonymous"). Prevents one
  // caller's key from colliding with another caller's key.
  identity?: string | null;
  required?: boolean;
  ttlSeconds?: number;
}

type ProcessingRecord = {
  state: 'processing';
  hash: string;
  owner: string;
  startedAt: number;
};

type CompletedRecord = {
  state: 'completed';
  hash: string;
  status: number;
  headers: [string, string][];
  body: string;
  completedAt: number;
};

type StoredRecord = ProcessingRecord | CompletedRecord;

export async function withIdempotency(
  request: Request,
  options: IdempotencyOptions,
  handler: () => Promise<Response | undefined>,
  store: IdempotencyStore = createRedisIdempotencyStore(),
): Promise<Response> {
  const header = request.headers.get('Idempotency-Key');
  if (!header) {
    if (options.required) {
      return errorResponse(
        400,
        'Idempotency-Key header is required',
        'idempotency_key_required',
      );
    }
    return (
      (await handler()) ??
      Response.json({ error: 'Handler returned no response' }, { status: 500 })
    );
  }

  const key = header.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,99}$/.test(key)) {
    return errorResponse(
      400,
      'Idempotency-Key must be 8-100 characters using letters, digits, dot, colon, underscore, or hyphen',
      'idempotency_key_invalid',
    );
  }

  const hash = await requestHash(request, options.identity ?? null);
  const storeKey = cacheKey(options.scope, options.identity ?? null, key);
  const owner = randomUUID();
  const processing: ProcessingRecord = {
    state: 'processing',
    hash,
    owner,
    startedAt: Date.now(),
  };
  const claimValue = JSON.stringify(processing);

  try {
    const claimed = await claimWithRaceRetry(store, storeKey, claimValue);
    if (!claimed) {
      const existingRaw = await store.get(storeKey);
      if (!existingRaw) {
        return errorResponse(
          409,
          'A request with this Idempotency-Key is already in progress',
          'idempotency_in_progress',
          { 'Retry-After': '1' },
        );
      }
      const existing = parseRecord(existingRaw);
      if (!existing) {
        return errorResponse(
          409,
          'A request with this Idempotency-Key is already in progress',
          'idempotency_in_progress',
          { 'Retry-After': '1' },
        );
      }
      if (existing.hash !== hash) {
        return errorResponse(
          409,
          'Idempotency key already used with a different payload',
          'idempotency_key_conflict',
        );
      }
      if (existing.state === 'completed') {
        return replayResponse(existing);
      }
      return errorResponse(
        409,
        'A request with this Idempotency-Key is already in progress',
        'idempotency_in_progress',
        { 'Retry-After': '1' },
      );
    }
  } catch (err) {
    console.error(`[idempotency] store unavailable for ${options.scope}:`, err);
    return errorResponse(
      503,
      'Idempotency store unavailable',
      'idempotency_store_unavailable',
    );
  }

  let response: Response;
  try {
    response =
      (await handler()) ??
      Response.json({ error: 'Handler returned no response' }, { status: 500 });
  } catch (err) {
    await silentRelease(store, storeKey, claimValue);
    throw err;
  }

  try {
    if (isCacheable(response.status)) {
      const body = await response.clone().text();
      const completed: CompletedRecord = {
        state: 'completed',
        hash,
        status: response.status,
        headers: Array.from(response.headers.entries()),
        body,
        completedAt: Date.now(),
      };
      await store.complete(
        storeKey,
        claimValue,
        JSON.stringify(completed),
        options.ttlSeconds ?? COMPLETED_TTL_SECONDS,
      );
    } else {
      await store.release(storeKey, claimValue);
    }
  } catch (err) {
    // The side effect already happened; never turn a successful write into an
    // error because the response cache write failed. Log and return it.
    console.error(`[idempotency] could not cache ${options.scope}:`, err);
  }

  return response;
}

async function claimWithRaceRetry(
  store: IdempotencyStore,
  key: string,
  value: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (await store.claim(key, value, PROCESSING_TTL_SECONDS)) return true;
    const existing = await store.get(key);
    if (existing) return false;
    // The key expired between SET NX and GET; try to claim it once more.
  }
  return false;
}

async function silentRelease(
  store: IdempotencyStore,
  key: string,
  claimValue: string,
): Promise<void> {
  try {
    await store.release(key, claimValue);
  } catch (err) {
    console.error('[idempotency] could not release claim:', err);
  }
}

function isCacheable(status: number): boolean {
  // Never pin an auth/rate-limit failure to an idempotency key: the caller may
  // legitimately retry after signing in or waiting.
  return status < 500 && ![401, 403, 408, 429].includes(status);
}

function replayResponse(record: CompletedRecord): Response {
  const headers = new Headers();
  for (const [name, value] of record.headers) {
    if (['content-length', 'transfer-encoding', 'connection'].includes(name.toLowerCase())) continue;
    headers.append(name, value);
  }
  headers.set('Idempotent-Replayed', 'true');
  return new Response(record.body || null, { status: record.status, headers });
}

function errorResponse(
  status: number,
  error: string,
  code: string,
  headers?: Record<string, string>,
): Response {
  return Response.json({ error, code }, { status, headers });
}

async function requestHash(request: Request, identity: string | null): Promise<string> {
  const url = new URL(request.url);
  const body = await request.clone().text();
  return createHash('sha256')
    .update(`${request.method}\n${url.pathname}\n${url.search}\n${identity ?? ''}\n${body}`)
    .digest('hex');
}

function cacheKey(scope: string, identity: string | null, key: string): string {
  const identityHash = identity
    ? createHash('sha256').update(identity).digest('hex').slice(0, 16)
    : 'anon';
  return `idem:${scope}:${identityHash}:${key}`;
}

function parseRecord(raw: string): StoredRecord | null {
  try {
    const parsed = JSON.parse(raw) as StoredRecord;
    if (parsed.state === 'processing' || parsed.state === 'completed') return parsed;
    return null;
  } catch {
    return null;
  }
}
