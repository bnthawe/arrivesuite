import { afterEach, describe, expect, it, vi } from 'vitest';
import { providerFetch, ProviderError } from './http';

const options = {
  baseUrl: 'https://api.paystack.co',
  apiKey: 'sk_test_123',
  provider: 'paystack',
  maxRetries: 0,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('providerFetch', () => {
  it('returns parsed JSON on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    await expect(providerFetch('/transaction/verify', {}, options)).resolves.toEqual({ ok: true });
  });

  it('maps 5xx to a retryable provider error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    const error = await providerFetch('/refund', {}, options).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({ code: 'provider', status: 503, retryable: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps 429 to a retryable provider error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })));

    const error = await providerFetch('/refund', {}, options).catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'provider', status: 429, retryable: true });
  });

  it('maps a network failure to a retryable transport error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const error = await providerFetch('/refund', {}, options).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({ code: 'transport', retryable: true });
    expect((error as Error).message).toContain('ECONNREFUSED');
  });
});
