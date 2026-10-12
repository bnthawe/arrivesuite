import { z } from 'zod';

// Amounts are integer minor units of `currency` (e.g. thebe for BWP).
// Provider clients pass amounts through untouched; conversion and the
// 0.5% GMV float (ARS_FLOAT_PCT) live in @arrivesuite/pricing.
export const currencyCodeSchema = z.string().length(3).transform((s) => s.toUpperCase());

export const occupancySchema = z.object({
  adults: z.number().int().min(1).max(14),
  children: z.array(z.number().int().min(0).max(17)).default([]),
  infants: z.array(z.number().int().min(0).max(2)).default([]),
});
export type Occupancy = z.infer<typeof occupancySchema>;

export const guestInfoSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(255),
  phone: z.string().min(5).max(30),
});
export type GuestInfo = z.infer<typeof guestInfoSchema>;
