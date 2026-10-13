import { z } from 'zod';
import { currencyCodeSchema, guestInfoSchema } from './money';

export const flightSearchRequestSchema = z.object({
  origin: z.string().length(3).transform((s) => s.toUpperCase()),
  destination: z.string().length(3).transform((s) => s.toUpperCase()),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().min(1).max(9),
  children: z.array(z.number().int().min(2).max(17)).default([]),
  infants: z.number().int().min(0).max(9).default(0),
  currency: currencyCodeSchema,
});
export type FlightSearchRequest = z.infer<typeof flightSearchRequestSchema>;

export const flightOfferSchema = z.object({
  offerId: z.string().min(1),
  flight: z.string().min(1),
  type: z.enum(['NDC', 'GDS', 'LCC']),
  bags: z.string().optional(),
  imageUrl: z.string().min(1).optional(),
  // Structured base fare in minor units. Sandbox-only: live OnArrival
  // responses carry their own pricing object (mapped at cutover).
  baseMinor: z.number().int().min(0).optional(),
});
export type FlightOffer = z.infer<typeof flightOfferSchema>;

export const passengerSchema = z.object({
  type: z.enum(['ADT', 'CHD', 'INF']),
  age: z.number().int().min(0).max(120).optional(),
});
export type Passenger = z.infer<typeof passengerSchema>;

export const flightOrderRequestSchema = z.object({
  offerId: z.string().min(1),
  paymentToken: z.string().min(1),
  passengers: z.array(passengerSchema).min(1).max(9),
  guestInfo: guestInfoSchema.optional(),
});
export type FlightOrderRequest = z.infer<typeof flightOrderRequestSchema>;

export const flightOrderResponseSchema = z.object({
  orderId: z.string().min(1),
  pnr: z.string().min(1),
  ticket: z.string().min(1),
  pdf: z.string().min(1),
});
export type FlightOrderResponse = z.infer<typeof flightOrderResponseSchema>;
