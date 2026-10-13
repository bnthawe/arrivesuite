import { z } from 'zod';
import { currencyCodeSchema } from './money';

// Paystack is the primary provider; Flutterwave and Stripe sit behind the
// same interface as fallbacks (contract v1.0 §5).
export const paymentInitRequestSchema = z.object({
  email: z.string().email().max(255),
  amountMinor: z.number().int().min(1),
  currency: currencyCodeSchema,
  reference: z.string().min(1).max(100),
});
export type PaymentInitRequest = z.infer<typeof paymentInitRequestSchema>;

export const paymentInitResponseSchema = z.object({
  authorizationUrl: z.string().url(),
  accessCode: z.string().min(1),
  reference: z.string().min(1),
});
export type PaymentInitResponse = z.infer<typeof paymentInitResponseSchema>;

export const paystackWebhookEventSchema = z.object({
  event: z.string().min(1),
  data: z.object({
    reference: z.string().min(1),
    status: z.string().min(1),
    amount: z.number().int().min(0),
    currency: z.string().min(1),
    id: z.number().int().optional(),
  }),
});
export type PaystackWebhookEvent = z.infer<typeof paystackWebhookEventSchema>;

// Flutterwave v3: amounts are MAJOR units; webhook carries tx_ref.
export const flutterwaveWebhookEventSchema = z.object({
  event: z.string().min(1).optional(),
  status: z.string().min(1),
  txRef: z.string().min(1).optional(),
  tx_ref: z.string().min(1).optional(),
  id: z.number().int().optional(),
  amount: z.number().min(0),
  currency: z.string().min(1),
});
export type FlutterwaveWebhookEvent = z.infer<typeof flutterwaveWebhookEventSchema>;

// Stripe: checkout.session.completed → capture by client_reference_id.
export const stripeCheckoutSessionSchema = z.object({
  id: z.string().min(1),
  client_reference_id: z.string().nullable().optional(),
  amount_total: z.number().int().min(0).nullable().optional(),
  currency: z.string().min(1).nullable().optional(),
  payment_status: z.string().min(1),
});
export type StripeCheckoutSession = z.infer<typeof stripeCheckoutSessionSchema>;

// DPO Pay v6 (XML API). Amounts are major-unit decimals as strings.
export const dpoCreateTokenRequestSchema = z.object({
  amountMajor: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currency: currencyCodeSchema,
  companyRef: z.string().min(1).max(100),
  email: z.string().email().max(255),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  serviceDescription: z.string().min(1).max(200),
  redirectUrl: z.string().url().optional(),
});
export type DpoCreateTokenRequest = z.infer<typeof dpoCreateTokenRequestSchema>;

export const dpoCreateTokenResponseSchema = z.object({
  transToken: z.string().min(1),
  transRef: z.string().min(1),
});
export type DpoCreateTokenResponse = z.infer<typeof dpoCreateTokenResponseSchema>;

export const dpoVerifyResultSchema = z.object({
  paid: z.boolean(),
  resultCode: z.string().min(1),
  resultExplanation: z.string(),
  amountMajor: z.string().optional(),
  currency: z.string().optional(),
  approval: z.string().optional(),
});
export type DpoVerifyResult = z.infer<typeof dpoVerifyResultSchema>;
