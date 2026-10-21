import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDpoToken,
  dpoConfigFromEnv,
  dpoHostedPageUrl,
  refundDpoToken,
  verifyDpoToken,
  type DpoConfig,
} from '../dpopay';

const config: DpoConfig = {
  companyToken: 'test-company-token',
  productServiceId: 'product-service-id',
  serviceServiceId: 'service-service-id',
  baseUrl: 'https://secure.3gdirectpay.com/API/v6/',
  sandbox: false,
};

const request = {
  amountMajor: '100.00',
  currency: 'BWP',
  companyRef: 'ARS-2026-000001',
  email: 'guest@example.com',
  firstName: 'Test',
  lastName: 'Guest',
  serviceDescription: 'Hotel booking',
  redirectUrl: 'https://example.com/api/v1/payments/dpo/return',
};

function xmlResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/xml' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('dpoConfigFromEnv', () => {
  it('maps the DPO_PAY_* names and marks a real token as live', () => {
    const cfg = dpoConfigFromEnv({
      DPO_PAY_COMPANY_TOKEN: 'live-token',
      DPO_PAY_PRODUCT_SERVICE_ID: 'product-1',
      DPO_PAY_SERVICE_SERVICE_ID: 'service-1',
      DPO_PAY_MODE: 'live',
      DPO_PAY_BASE_URL: 'https://example.test/API/v6/',
    } as NodeJS.ProcessEnv);

    expect(cfg.companyToken).toBe('live-token');
    expect(cfg.productServiceId).toBe('product-1');
    expect(cfg.serviceServiceId).toBe('service-1');
    expect(cfg.baseUrl).toBe('https://example.test/API/v6/');
    expect(cfg.sandbox).toBe(false);
  });

  it('defaults to sandbox when the company token is absent', () => {
    const cfg = dpoConfigFromEnv({} as NodeJS.ProcessEnv);
    expect(cfg.sandbox).toBe(true);
  });

  it('forces sandbox when the development bypass is enabled', () => {
    const cfg = dpoConfigFromEnv({
      DPO_PAY_COMPANY_TOKEN: 'live-token',
      DPO_PAY_MODE: 'live',
      NEXT_PUBLIC_BYPASS_DPO_FOR_DEV: 'true',
    } as NodeJS.ProcessEnv);
    expect(cfg.sandbox).toBe(true);
  });
});

describe('createDpoToken', () => {
  it('returns a sandbox token without calling the gateway', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await createDpoToken(request, { ...config, sandbox: true });

    expect(result.transToken).toMatch(/^dpo-sandbox-/);
    expect(result.transRef).toMatch(/^DPOST/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the v6 XML createToken request and parses the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      xmlResponse(
        '<API3G><Result>000</Result><ResultExplanation>Transaction Created</ResultExplanation><TransToken>tok-123</TransToken><TransRef>ref-456</TransRef></API3G>',
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await createDpoToken(request, config);

    expect(result).toEqual({ transToken: 'tok-123', transRef: 'ref-456' });
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(config.baseUrl);
    expect(init.method).toBe('POST');
    expect(init.body).toContain('<Request>createToken</Request>');
    expect(init.body).toContain('<PaymentAmount>100.00</PaymentAmount>');
    expect(init.body).toContain('<CompanyRef>ARS-2026-000001</CompanyRef>');
    expect(init.body).toContain('<ServiceType>product-service-id</ServiceType>');
  });

  it('throws a provider error when DPO rejects the token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      xmlResponse(
        '<API3G><Result>900</Result><ResultExplanation>Invalid company token</ResultExplanation></API3G>',
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(createDpoToken(request, config)).rejects.toThrow(
      'Invalid company token',
    );
  });
});

describe('verifyDpoToken', () => {
  it('parses a paid transaction', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      xmlResponse(
        '<API3G><Result>000</Result><ResultExplanation>Transaction Paid</ResultExplanation><TransactionAmount>100.00</TransactionAmount><TransactionCurrency>BWP</TransactionCurrency><TransactionApproval>123456</TransactionApproval></API3G>',
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await verifyDpoToken('tok-123', config);

    expect(result).toEqual({
      paid: true,
      resultCode: '000',
      resultExplanation: 'Transaction Paid',
      amountMajor: '100.00',
      currency: 'BWP',
      approval: '123456',
    });
  });

  it('does not mark a 000 result as paid when the explanation says not paid', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      xmlResponse(
        '<API3G><Result>000</Result><ResultExplanation>Transaction not paid yet</ResultExplanation><TransactionAmount>100.00</TransactionAmount><TransactionCurrency>BWP</TransactionCurrency></API3G>',
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await verifyDpoToken('tok-123', config);

    expect(result.paid).toBe(false);
    expect(result.resultExplanation).toBe('Transaction not paid yet');
  });

  it('returns a sandbox verification without calling the gateway', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const paid = await verifyDpoToken('dpo-sandbox-ARS-1', { ...config, sandbox: true });
    const unpaid = await verifyDpoToken('some-other-token', { ...config, sandbox: true });

    expect(paid.paid).toBe(true);
    expect(unpaid.paid).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('refundDpoToken', () => {
  it('posts a refundToken request and accepts a successful result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      xmlResponse('<API3G><Result>000</Result><ResultExplanation>Refund OK</ResultExplanation></API3G>'),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      refundDpoToken(
        {
          transToken: 'tok-123',
          amountMajor: '50.00',
          details: 'Guest cancellation',
        },
        config,
      ),
    ).resolves.toBeUndefined();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toContain('<Request>refundToken</Request>');
    expect(init.body).toContain('<refundAmount>50.00</refundAmount>');
  });
});

describe('dpoHostedPageUrl', () => {
  it('encodes the transaction token', () => {
    expect(dpoHostedPageUrl('token with spaces')).toBe(
      'https://secure.3gdirectpay.com/payv3.php?ID=token%20with%20spaces',
    );
  });
});
