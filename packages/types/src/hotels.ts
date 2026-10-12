import { z } from 'zod';
import { currencyCodeSchema, occupancySchema } from './money';

export const hotelSearchRequestSchema = z.object({
  checkin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkout: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  occupancies: z.array(occupancySchema).min(1).max(8),
  location: z.string().min(1).max(200),
  currency: currencyCodeSchema,
  guestNationality: z.string().length(2).transform((s) => s.toUpperCase()),
});
export type HotelSearchRequest = z.infer<typeof hotelSearchRequestSchema>;

export const hotelOfferSchema = z.object({
  hotelId: z.string().min(1),
  offerId: z.string().min(1),
  name: z.string().min(1),
  net: z.number().int().min(0),
  retail: z.number().int().min(0),
  freeCancel: z.string().datetime().nullable(),
  badges: z.array(z.string()),
});
export type HotelOffer = z.infer<typeof hotelOfferSchema>;

export const prebookRequestSchema = z.object({
  offerId: z.string().min(1),
  usePaymentSdk: z.boolean().default(false),
});
export type PrebookRequest = z.infer<typeof prebookRequestSchema>;

export const prebookResponseSchema = z.object({
  prebookId: z.string().min(1),
  transactionId: z.string().min(1),
  expiresAt: z.string().datetime(),
  expiresIn: z.string().min(1),
});
export type PrebookResponse = z.infer<typeof prebookResponseSchema>;
