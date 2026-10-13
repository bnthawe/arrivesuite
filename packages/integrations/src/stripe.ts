import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PaymentInitRequest, PaymentInitResponse, StripeCheckoutSession } from '@arrivesuite/types';
import { providerFetch, ProviderError } from './http';

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  sandbox: boolean;
}

export function stripeConfigFromEnv(env: NodeJS.ProcessEnv = process.env): StripeConfig {
  const key = env.STRIPE_SECRET_KEY ?? '';
  const mode = env.STRIPE_MODE;
  return {
    secretKey: key,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET ?? '',
    sandbox: mode ? mode !== 'live' : !key || key.includes('xxx'),
  };
}

function formBody(params: Record<string, string | undefined>): string {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) body.append(k, v);
  }
  return body.toString();
}

// Secondary fallback (contract §5): hosted Checkout Session.
export async function createStripeCheckoutSession(
  req: PaymentInitRequest,
  successUrl: string,
  cancelUrl: string,
  cfg = stripeConfigFromEnv(),
): Promise<PaymentInitResponse> {
  if (cfg.sandbox) {
    return {
      authorizationUrl: `https://checkout.stripe.com/pay/${req.reference}`,
      accessCode: `cs_sandbox_${req.reference}`,
      reference: req.reference,
    };
  }
  const res = await providerFetch<{ id: string; url: string | null }>(
    '/v1/checkout/sessions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${cfg.secretKey}`,
      },
      body: formBody({
        mode: 'payment',
        'line_items[0][price_data][currency]': req.currency.toLowerCase(),
        'line_items[0][price_data][unit_amount]': String(req.amountMinor),
        'line_items[0][price_data][product_data][name]': `ArriveSuite booking ${req.reference}`,
        'line_items[0][quantity]': '1',
        client_reference_id: req.reference,
        success_url: successUrl,
        cancel_url: cancelUrl,
      }),
    },
    { baseUrl: 'https://api.stripe.com', apiKey: cfg.secretKey, provider: 'stripe' },
  );
  if (!res.url) {
    throw new ProviderError({ provider: 'stripe', code: 'provider', message: 'no checkout URL', retryable: true });
  }
  return { authorizationUrl: res.url, accessCode: res.id, reference: req.reference };
}

// Verifies the Stripe-Signature header (t=timestamp,v1=hmac scheme) and
// returns the parsed event in one step; null when invalid.
export function verifyStripeWebhook(
  rawBody: string,
  signature: string | null,
  cfg = stripeConfigFromEnv(),
): { type: string; object: unknown } | null {
  if (!signature || !cfg.webhookSecret) return null;
  const parts = Object.fromEntries(signature.split(',').map((p) => p.split('=')));
  const timestamp = parts.t;
  const v1s = signature.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!timestamp || v1s.length === 0) return null;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return null;
  const expected = createHmac('sha256', cfg.webhookSecret).update(`${timestamp}.${rawBody}`).digest('hex');
  const valid = v1s.some((v1) => {
    const a = Buffer.from(v1);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  });
  if (!valid) return null;
  try {
    const event = JSON.parse(rawBody) as { type: string; data: { object: unknown } };
    if (!event.type || !event.data?.object) return null;
    return { type: event.type, object: event.data.object };
  } catch {
    return null;
  }
}

export function isStripeCheckoutComplete(object: unknown): StripeCheckoutSession | null {
  const parsed = (object ?? {}) as Partial<StripeCheckoutSession>;
  if (parsed.payment_status !== 'paid' || !parsed.id) return null;
  return parsed as StripeCheckoutSession;
}

export async function refundStripePayment(
  paymentIntentId: string,
  amountMinor?: number,
  cfg = stripeConfigFromEnv(),
): Promise<void> {
  if (cfg.sandbox) return;
  const res = await providerFetch<{ status: string }>(
    '/v1/refunds',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${cfg.secretKey}`,
      },
      body: formBody({
        payment_intent: paymentIntentId,
        ...(amountMinor != null ? { amount: String(amountMinor) } : {}),
      }),
    },
    { baseUrl: 'https://api.stripe.com', apiKey: cfg.secretKey, provider: 'stripe' },
  );
  if (res.status === 'failed') {
    throw new ProviderError({ provider: 'stripe', code: 'provider', message: 'refund failed', retryable: false });
  }
}
