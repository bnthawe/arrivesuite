import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPaystackRefund,
  initializePaystackTransaction,
  isChargeSuccess,
  paystackConfigFromEnv,
  verifyPaystackWebhook,
} from './paystack';
import { ProviderError } from './http';

const liveConfig = { secretKey: 'sk_test_123', sandbox: false };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('paystackConfigFromEnv', () => {
  it('defaults to sandbox without a usable key', () => {
    expect(paystackConfigFromEnv({})).toEqual({ secretKey: '', sandbox: true });
    expect(paystackConfigFromEnv({ PAYSTACK_SECRET_KEY: 'sk_test_xxx' })).toEqual({
      secretKey: 'sk_test_xxx',
      sandbox: true,
    });
  });

  it('uses live mode only for a real key unless PAYSTACK_MODE overrides it', () => {
    expect(paystackConfigFromEnv({ PAYSTACK_SECRET_KEY: 'sk_live_123' })).toEqual({
      secretKey: 'sk_live_123',
      sandbox: false,
    });
    expect(
      paystackConfigFromEnv({ PAYSTACK_SECRET_KEY: 'sk_live_123', PAYSTACK_MODE: 'test' }),
    ).toEqual({ secretKey: 'sk_live_123', sandbox: true });
    expect(
      paystackConfigFromEnv({ PAYSTACK_SECRET_KEY: 'sk_live_123', PAYSTACK_MODE: 'live' }),
    ).toEqual({ secretKey: 'sk_live_123', sandbox: false });
  });
});

describe('initializePaystackTransaction', () => {
  it('sends the documented initialize payload and maps the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        status: true,
        data: {
          authorizationUrl: 'https://checkout.paystack.com/ref-1',
          accessCode: 'acc_ref-1',
          reference: 'ref-1',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await initializePaystackTransaction(
      {
        email: 'guest@example.com',
        amountMinor: 10_000,
        currency: 'BWP',
        reference: 'ref-1',
      },
      liveConfig,
    );

    expect(result).toEqual({
      authorizationUrl: 'https://checkout.paystack.com/ref-1',
      accessCode: 'acc_ref-1',
      reference: 'ref-1',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.paystack.co/transaction/initialize');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer sk_test_123' });
    expect(JSON.parse(String(init.body))).toEqual({
      email: 'guest@example.com',
      amount: 10_000,
      currency: 'BWP',
      reference: 'ref-1',
    });
  });

  it('returns the sandbox checkout shape without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await initializePaystackTransaction(
      {
        email: 'guest@example.com',
        amountMinor: 10_000,
        currency: 'BWP',
        reference: 'ref-1',
      },
      { secretKey: '', sandbox: true },
    );

    expect(result).toEqual({
      authorizationUrl: 'https://checkout.paystack.com/ref-1',
      accessCode: 'acc_ref-1',
      reference: 'ref-1',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a provider-declared initialize failure to a retryable ProviderError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ status: false, data: null })));

    await expect(
      initializePaystackTransaction(
        {
          email: 'guest@example.com',
          amountMinor: 10_000,
          currency: 'BWP',
          reference: 'ref-1',
        },
        liveConfig,
      ),
    ).rejects.toMatchObject({
      name: 'ProviderError',
      provider: 'paystack',
      code: 'provider',
      retryable: true,
    });
  });
});

describe('createPaystackRefund', () => {
  it('sends the transaction and optional partial amount, then maps the refund id', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ status: true, data: { status: 'pending', id: 123 } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createPaystackRefund(
      { transaction: 'ref-1', amountMinor: 5_000 },
      liveConfig,
    );

    expect(result).toEqual({ status: 'pending', refundId: '123' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.paystack.co/refund');
    expect(JSON.parse(String(init.body))).toEqual({ transaction: 'ref-1', amount: 5_000 });
  });

  it('omits amount for a full refund', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ status: true, data: { status: 'processed', id: 456 } }));
    vi.stubGlobal('fetch', fetchMock);

    await createPaystackRefund({ transaction: 'ref-1' }, liveConfig);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ transaction: 'ref-1' });
  });

  it('returns the sandbox refund shape without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await createPaystackRefund(
      { transaction: 'ref-1', amountMinor: 5_000 },
      { secretKey: '', sandbox: true },
    );

    expect(result.status).toBe('success');
    expect(result.refundId).toMatch(/^rf_sandbox_/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a provider-declared refund failure to a retryable ProviderError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ status: false, data: null })));

    await expect(
      createPaystackRefund({ transaction: 'ref-1' }, liveConfig),
    ).rejects.toMatchObject({
      name: 'ProviderError',
      provider: 'paystack',
      code: 'provider',
      retryable: true,
    });
  });
});

describe('Paystack webhooks', () => {
  const rawBody = JSON.stringify({
    event: 'charge.success',
    data: { reference: 'ref-1', status: 'success', amount: 10_000, currency: 'BWP' },
  });
  const signature = createHmac('sha512', liveConfig.secretKey).update(rawBody).digest('hex');

  it('accepts only a valid x-paystack-signature', () => {
    expect(verifyPaystackWebhook(rawBody, signature, liveConfig)).toBe(true);
    expect(verifyPaystackWebhook(`${rawBody} `, signature, liveConfig)).toBe(false);
    expect(verifyPaystackWebhook(rawBody, null, liveConfig)).toBe(false);
    expect(verifyPaystackWebhook(rawBody, '0'.repeat(128), liveConfig)).toBe(false);
    expect(verifyPaystackWebhook(rawBody, signature, { secretKey: '', sandbox: true })).toBe(false);
  });

  it('recognises only successful charge events', () => {
    expect(
      isChargeSuccess({
        event: 'charge.success',
        data: { reference: 'ref-1', status: 'success', amount: 10_000, currency: 'BWP' },
      }),
    ).toBe(true);
    expect(
      isChargeSuccess({
        event: 'charge.success',
        data: { reference: 'ref-1', status: 'failed', amount: 10_000, currency: 'BWP' },
      }),
    ).toBe(false);
    expect(
      isChargeSuccess({
        event: 'transfer.success',
        data: { reference: 'ref-1', status: 'success', amount: 10_000, currency: 'BWP' },
      }),
    ).toBe(false);
  });
});

describe('Paystack HTTP error mapping', () => {
  it('maps 401 to a non-retryable auth error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));

    const error = await initializePaystackTransaction(
      { email: 'guest@example.com', amountMinor: 10_000, currency: 'BWP', reference: 'ref-1' },
      liveConfig,
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({ code: 'auth', status: 401, retryable: false });
  });

  it('maps 400 to a non-retryable validation error with the response body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('invalid amount', { status: 400 })),
    );

    const error = await initializePaystackTransaction(
      { email: 'guest@example.com', amountMinor: 10_000, currency: 'BWP', reference: 'ref-1' },
      liveConfig,
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({ code: 'validation', status: 400, retryable: false });
    expect((error as Error).message).toContain('invalid amount');
  });
});
