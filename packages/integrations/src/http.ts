// Normalized provider error. Transport, timeout, and provider-side
// failures all surface as this shape so callers never branch on fetch internals.
export class ProviderError extends Error {
  readonly provider: string;
  readonly code: 'transport' | 'timeout' | 'auth' | 'validation' | 'provider' | 'expired';
  readonly status?: number;
  readonly retryable: boolean;

  constructor(init: {
    provider: string;
    code: ProviderError['code'];
    message: string;
    status?: number;
    retryable?: boolean;
  }) {
    super(`[${init.provider}] ${init.message}`);
    this.name = 'ProviderError';
    this.provider = init.provider;
    this.code = init.code;
    this.status = init.status;
    this.retryable = init.retryable ?? (init.code === 'transport' || init.code === 'timeout');
  }
}

export interface HttpClientOptions {
  baseUrl: string;
  apiKey: string;
  provider: string;
  timeoutMs?: number;
  maxRetries?: number;
}

// fetch wrapper: timeout per attempt, exponential-backoff retry on network
// errors and 5xx/429 (never on 4xx validation), JSON passthrough.
export async function providerFetch<T>(
  path: string,
  init: RequestInit,
  opts: HttpClientOptions,
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const maxRetries = opts.maxRetries ?? 3;
  let attempt = 0;
  let lastErr: unknown = null;

  while (attempt <= maxRetries) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${opts.baseUrl}${path}`, { ...init, signal: ctrl.signal });
      clearTimeout(timer);
      if (res.status === 401 || res.status === 403) {
        throw new ProviderError({ provider: opts.provider, code: 'auth', message: `HTTP ${res.status}`, status: res.status, retryable: false });
      }
      if (res.status === 429 || res.status >= 500) {
        throw new ProviderError({ provider: opts.provider, code: 'provider', message: `HTTP ${res.status}`, status: res.status, retryable: true });
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new ProviderError({ provider: opts.provider, code: 'validation', message: `HTTP ${res.status} ${text.slice(0, 200)}`, status: res.status, retryable: false });
      }
      return (await res.json()) as T;
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof ProviderError) {
        if (!err.retryable || attempt >= maxRetries) throw err;
        lastErr = err;
      } else if ((err as Error)?.name === 'AbortError') {
        lastErr = new ProviderError({ provider: opts.provider, code: 'timeout', message: `timeout after ${timeoutMs}ms` });
        if (attempt >= maxRetries) throw lastErr;
      } else {
        lastErr = new ProviderError({ provider: opts.provider, code: 'transport', message: (err as Error)?.message ?? 'network error' });
        if (attempt >= maxRetries) throw lastErr;
      }
    }
    attempt += 1;
    await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
  }
  throw lastErr;
}
