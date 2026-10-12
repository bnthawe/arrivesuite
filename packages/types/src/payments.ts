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
