import { describe, expect, it, vi } from 'vitest';
import { withIdempotency, type IdempotencyStore } from './idempotency';

const KEY = '11111111-1111-4111-8111-111111111111';
const OPTIONS = { scope: 'test.write', identity: 'account-1' };

class MemoryStore implements IdempotencyStore {
  private entries = new Map<string, string>();

  async claim(key: string, value: string): Promise<boolean> {
    if (this.entries.has(key)) return false;
    this.entries.set(key, value);
    return true;
  }

  async get(key: string): Promise<string | null> {
    return this.entries.get(key) ?? null;
  }

  async complete(key: string, claimValue: string, value: string): Promise<boolean> {
    if (this.entries.get(key) !== claimValue) return false;
    this.entries.set(key, value);
    return true;
  }

  async release(key: string, claimValue: string): Promise<boolean> {
    if (this.entries.get(key) !== claimValue) return false;
    this.entries.delete(key);
    return true;
  }
}

function makeRequest(
  body: unknown = { amountCents: 100 },
  key: string | null = KEY,
): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) headers['Idempotency-Key'] = key;
  return new Request('https://example.com/api/v1/test?x=1', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function json(body: unknown, status = 201): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('withIdempotency', () => {
  it('runs normally when the optional header is absent', async () => {
    const store = new MemoryStore();
    let calls = 0;
    const response = await withIdempotency(
      makeRequest({}, null),
      OPTIONS,
      async () => {
        calls += 1;
        return json({ ok: true });
      },
      store,
    );

    expect(response.status).toBe(201);
    expect(calls).toBe(1);
  });

  it('rejects a missing header when required', async () => {
    const store = new MemoryStore();
    const response = await withIdempotency(
      makeRequest({}, null),
      { ...OPTIONS, required: true },
      async () => json({ ok: true }),
      store,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'idempotency_key_required' });
  });

  it('rejects malformed keys before calling the handler', async () => {
    const store = new MemoryStore();
    let calls = 0;
    const response = await withIdempotency(
      makeRequest({}, 'bad key'),
      OPTIONS,
      async () => {
        calls += 1;
        return json({ ok: true });
      },
      store,
    );

    expect(response.status).toBe(400);
    expect(calls).toBe(0);
    await expect(response.json()).resolves.toMatchObject({ code: 'idempotency_key_invalid' });
  });

  it('replays the original response for the same key and payload', async () => {
    const store = new MemoryStore();
    let calls = 0;
    const handler = async () => {
      calls += 1;
      return json({ bookingRef: 'ARS-2026-000001' });
    };

    const first = await withIdempotency(makeRequest(), OPTIONS, handler, store);
    const second = await withIdempotency(makeRequest(), OPTIONS, handler, store);

    expect(calls).toBe(1);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers.get('Idempotent-Replayed')).toBe('true');
    await expect(second.json()).resolves.toEqual({ bookingRef: 'ARS-2026-000001' });
  });

  it('rejects a reused key with a different payload', async () => {
    const store = new MemoryStore();
    await withIdempotency(makeRequest({ amountCents: 100 }), OPTIONS, async () => json({ ok: true }), store);

    const conflict = await withIdempotency(
      makeRequest({ amountCents: 200 }),
      OPTIONS,
      async () => json({ ok: true }),
      store,
    );

    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({ code: 'idempotency_key_conflict' });
  });

  it('rejects a duplicate while the original request is still in progress', async () => {
    const store = new MemoryStore();
    let release!: (response: Response) => void;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });

    const first = withIdempotency(
      makeRequest(),
      OPTIONS,
      async () => {
        started();
        return pending;
      },
      store,
    );
    await startedPromise;

    const second = await withIdempotency(makeRequest(), OPTIONS, async () => json({ ok: true }), store);
    expect(second.status).toBe(409);
    await expect(second.json()).resolves.toMatchObject({ code: 'idempotency_in_progress' });

    release(json({ ok: true }));
    expect((await first).status).toBe(201);
  });

  it('does not cache 5xx responses, so a retry can run again', async () => {
    const store = new MemoryStore();
    let calls = 0;
    const handler = async () => {
      calls += 1;
      return calls === 1 ? json({ error: 'temporary' }, 503) : json({ ok: true });
    };

    const first = await withIdempotency(makeRequest(), OPTIONS, handler, store);
    const second = await withIdempotency(makeRequest(), OPTIONS, handler, store);

    expect(first.status).toBe(503);
    expect(second.status).toBe(201);
    expect(calls).toBe(2);
  });

  it('does not cache auth failures, so a retry can run after signing in', async () => {
    const store = new MemoryStore();
    let calls = 0;
    const handler = async () => {
      calls += 1;
      return calls === 1 ? json({ error: 'Not authenticated' }, 401) : json({ ok: true });
    };

    const first = await withIdempotency(makeRequest(), OPTIONS, handler, store);
    const second = await withIdempotency(makeRequest(), OPTIONS, handler, store);

    expect(first.status).toBe(401);
    expect(second.status).toBe(201);
    expect(calls).toBe(2);
  });

  it('releases the claim when the handler throws', async () => {
    const store = new MemoryStore();
    let calls = 0;
    const handler = async () => {
      calls += 1;
      if (calls === 1) throw new Error('boom');
      return json({ ok: true });
    };

    await expect(withIdempotency(makeRequest(), OPTIONS, handler, store)).rejects.toThrow('boom');
    const retry = await withIdempotency(makeRequest(), OPTIONS, handler, store);

    expect(retry.status).toBe(201);
    expect(calls).toBe(2);
  });

  it('isolates the same key across different callers', async () => {
    const store = new MemoryStore();
    let calls = 0;
    const handler = async () => {
      calls += 1;
      return json({ ok: true, call: calls });
    };

    await withIdempotency(makeRequest({}, KEY), OPTIONS, handler, store);
    await withIdempotency(
      makeRequest({}, KEY),
      { ...OPTIONS, identity: 'account-2' },
      handler,
      store,
    );

    expect(calls).toBe(2);
  });

  it('fails closed when the idempotency store is unavailable', async () => {
    const store = new MemoryStore();
    store.claim = async () => {
      throw new Error('redis down');
    };

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await withIdempotency(
        makeRequest(),
        OPTIONS,
        async () => json({ ok: true }),
        store,
      );

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({
        code: 'idempotency_store_unavailable',
      });
    } finally {
      consoleError.mockRestore();
    }
  });
});
