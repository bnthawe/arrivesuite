import type { PaymentInitRequest, PaymentInitResponse } from '@arrivesuite/types';
import { providerFetch, ProviderError } from './http';

export interface FlutterwaveConfig {
  secretKey: string;
  sandbox: boolean;
}

export function flutterwaveConfigFromEnv(env: NodeJS.ProcessEnv = process.env): FlutterwaveConfig {
  const key = env.FLUTTERWAVE_SECRET_KEY ?? '';
  const mode = env.FLUTTERWAVE_MODE;
  return { secretKey: key, sandbox: mode ? mode !== 'live' : !key || key.includes('xxx') };
}

// Flutterwave v3 takes MAJOR-unit decimals (unlike Paystack's minor units).
export async function initializeFlutterwavePayment(
  req: PaymentInitRequest,
  redirectUrl: string,
  cfg = flutterwaveConfigFromEnv(),
): Promise<PaymentInitResponse> {
  if (cfg.sandbox) {
    return {
      authorizationUrl: `https://checkout.flutterwave.com/v3/hosted/pay/${req.reference}`,
      accessCode: `flw_${req.reference}`,
      reference: req.reference,
    };
  }
  const res = await providerFetch<{ status: string; data: { link: string } }>(
    '/v3/payments',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.secretKey}` },
      body: JSON.stringify({
        tx_ref: req.reference,
        amount: (req.amountMinor / 100).toFixed(2),
        currency: req.currency,
        redirect_url: redirectUrl,
        customer: { email: req.email },
      }),
    },
    { baseUrl: 'https://api.flutterwave.com', apiKey: cfg.secretKey, provider: 'flutterwave' },
  );
  if (res.status !== 'success' || !res.data?.link) {
    throw new ProviderError({ provider: 'flutterwave', code: 'provider', message: 'initialize failed', retryable: true });
  }
  return { authorizationUrl: res.data.link, accessCode: req.reference, reference: req.reference };
}

export interface FlutterwaveVerification {
  status: string;
  txRef: string;
  amount: number;
  currency: string;
}

export async function verifyFlutterwaveTransaction(
  transactionId: number,
  cfg = flutterwaveConfigFromEnv(),
): Promise<FlutterwaveVerification> {
  if (cfg.sandbox) {
    return { status: 'successful', txRef: '', amount: 0, currency: '' };
  }
  const res = await providerFetch<{ status: string; data: { status: string; tx_ref: string; amount: number; currency: string } }>(
    `/v3/transactions/${transactionId}/verify`,
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.secretKey}` },
    },
    { baseUrl: 'https://api.flutterwave.com', apiKey: cfg.secretKey, provider: 'flutterwave' },
  );
  return {
    status: res.data.status,
    txRef: res.data.tx_ref,
    amount: Math.round(res.data.amount * 100),
    currency: res.data.currency,
  };
}

// Webhook authenticity: verif-hash header must equal the secret key.
export function verifyFlutterwaveWebhook(signature: string | null, cfg = flutterwaveConfigFromEnv()): boolean {
  if (!signature || !cfg.secretKey) return false;
  const a = Buffer.from(signature);
  const b = Buffer.from(cfg.secretKey);
  return a.length === b.length && a.equals(b);
}

export async function refundFlutterwaveTransaction(
  transactionId: number,
  amountMajor?: string,
  cfg = flutterwaveConfigFromEnv(),
): Promise<void> {
  if (cfg.sandbox) return;
  const res = await providerFetch<{ status: string; message?: string }>(
    `/v3/transactions/${transactionId}/refund`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.secretKey}` },
      body: JSON.stringify(amountMajor ? { amount: amountMajor } : {}),
    },
    { baseUrl: 'https://api.flutterwave.com', apiKey: cfg.secretKey, provider: 'flutterwave' },
  );
  if (res.status !== 'success') {
    throw new ProviderError({ provider: 'flutterwave', code: 'provider', message: res.message ?? 'refund failed', retryable: false });
  }
}
