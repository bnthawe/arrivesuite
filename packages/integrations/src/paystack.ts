import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PaymentInitRequest, PaymentInitResponse, PaystackWebhookEvent } from '@arrivesuite/types';
import { providerFetch, ProviderError } from './http';

export interface PaystackConfig {
  secretKey: string;
  // Provider environment. Paystack uses the test key against the same API.
  sandbox: boolean;
  // Local fake responses only. This is separate from the provider environment.
  // Optional for callers written before the split; when omitted, sandbox
  // retains the old simulate-in-sandbox behaviour.
  simulate?: boolean;
}

export function paystackConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PaystackConfig {
  const key = env.PAYSTACK_SECRET_KEY ?? '';
  const mode = env.PAYSTACK_MODE;
  const isLive = mode === 'live';
  const hasUsableKey = Boolean(key) && !key.includes('xxx');
  const looksLikeTestKey = key.startsWith('sk_test_');
  const explicitSimulate = env.PAYSTACK_SIMULATE;
  return {
    secretKey: key,
    sandbox: mode ? !isLive : !hasUsableKey || looksLikeTestKey,
    // Live mode always calls the provider; simulation is sandbox-only.
    simulate: isLive
      ? false
      : explicitSimulate !== undefined
        ? explicitSimulate === 'true'
        : !hasUsableKey,
  };
}

// Fallback provider (contract v2.7 §5.17). DPO Pay is primary.
export async function initializePaystackTransaction(
  req: PaymentInitRequest,
  cfg = paystackConfigFromEnv(),
): Promise<PaymentInitResponse> {
  if (cfg.simulate ?? cfg.sandbox) {
    return {
      authorizationUrl: `https://checkout.paystack.com/${req.reference}`,
      accessCode: `acc_${req.reference}`,
      reference: req.reference,
    };
  }
  const res = await providerFetch<{ status: boolean; data: PaymentInitResponse }>(
    '/transaction/initialize',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.secretKey}` },
      body: JSON.stringify({ email: req.email, amount: req.amountMinor, currency: req.currency, reference: req.reference }),
    },
    { baseUrl: 'https://api.paystack.co', apiKey: cfg.secretKey, provider: 'paystack' },
  );
  if (!res.status) {
    throw new ProviderError({ provider: 'paystack', code: 'provider', message: 'initialize failed', retryable: true });
  }
  return res.data;
}

// Verifies the x-paystack-signature header before any processing.
export function verifyPaystackWebhook(rawBody: string, signature: string | null, cfg = paystackConfigFromEnv()): boolean {
  if (!signature || !cfg.secretKey) return false;
  const digest = createHmac('sha512', cfg.secretKey).update(rawBody).digest('hex');
  const a = Buffer.from(digest);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isChargeSuccess(event: PaystackWebhookEvent): boolean {
  return event.event === 'charge.success' && event.data.status === 'success';
}

export interface PaystackRefundRequest {
  transaction: string;
  amountMinor?: number;
}

// Partial or full refund against the original transaction reference.
export async function createPaystackRefund(
  req: PaystackRefundRequest,
  cfg = paystackConfigFromEnv(),
): Promise<{ status: string; refundId: string }> {
  if (cfg.simulate ?? cfg.sandbox) {
    return { status: 'success', refundId: `rf_sandbox_${Date.now().toString(36)}` };
  }
  const res = await providerFetch<{ status: boolean; data: { status: string; id: number } }>(
    '/refund',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.secretKey}` },
      body: JSON.stringify({
        transaction: req.transaction,
        ...(req.amountMinor != null ? { amount: req.amountMinor } : {}),
      }),
    },
    { baseUrl: 'https://api.paystack.co', apiKey: cfg.secretKey, provider: 'paystack' },
  );
  if (!res.status) {
    throw new ProviderError({ provider: 'paystack', code: 'provider', message: 'refund failed', retryable: true });
  }
  return { status: res.data.status, refundId: String(res.data.id) };
}
