import { describe, expect, it } from 'vitest';
import { createDpoToken, dpoHostedPageUrl, verifyDpoToken, type DpoConfig } from '../dpopay';

const enabled = process.env.DPO_LIVE_SANDBOX === '1';

const config: DpoConfig = {
  companyToken: process.env.DPO_PAY_COMPANY_TOKEN ?? '',
  productServiceId: process.env.DPO_PAY_PRODUCT_SERVICE_ID ?? '',
  serviceServiceId: process.env.DPO_PAY_SERVICE_SERVICE_ID ?? '',
  baseUrl: process.env.DPO_PAY_BASE_URL ?? 'https://secure.3gdirectpay.com/API/v6/',
  sandbox: true,
  simulate: false,
};

describe.skipIf(!enabled)('DPO Pay live sandbox (T0.6)', () => {
  it('creates a token and confirms it starts unpaid', async () => {
    const companyRef = `ARS-T06-${Date.now().toString(36).toUpperCase()}`;

    const token = await createDpoToken(
      {
        amountMajor: '100.00',
        currency: 'BWP',
        companyRef,
        email: 'sandbox@arrivesuite.com',
        firstName: 'Sandbox',
        lastName: 'Test',
        serviceDescription: 'ArriveSuite T0.6 sandbox validation',
        redirectUrl: 'https://example.com/api/v1/payments/dpo/return',
      },
      config,
    );

    console.log(`CREATEREF=${companyRef}`);
    console.log(`TRANSTOKEN=${token.transToken}`);
    console.log(`TRANSREF=${token.transRef}`);
    console.log(`HOSTED=${dpoHostedPageUrl(token.transToken)}`);

    const verification = await verifyDpoToken(token.transToken, config);
    console.log(`VERIFY_UNPAID=${JSON.stringify(verification)}`);

    expect(token.transToken.length).toBeGreaterThan(0);
    expect(token.transRef.length).toBeGreaterThan(0);
    expect(verification.paid).toBe(false);
    expect(verification.resultCode).toBe('900');
  }, 60_000);

  it.skipIf(!process.env.DPO_LIVE_PAID_TOKEN)(
    'verifies a completed sandbox payment',
    async () => {
      const verification = await verifyDpoToken(process.env.DPO_LIVE_PAID_TOKEN ?? '', config);
      console.log(`VERIFY_PAID=${JSON.stringify(verification)}`);

      expect(verification.paid).toBe(true);
      expect(verification.resultCode).toBe('000');
      expect(verification.resultExplanation.toLowerCase()).toContain('paid');
      expect(verification.amountMajor).toBe(process.env.DPO_LIVE_PAID_AMOUNT ?? '100.00');
      expect(verification.currency).toBe('BWP');
    },
    60_000,
  );
});
