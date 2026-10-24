import { z } from 'zod';
import { currencyCodeSchema, guestInfoSchema } from './money';

const isoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
  }, 'Invalid calendar date');

export const flightSearchRequestSchema = z
  .object({
    origin: z.string().length(3).transform((s) => s.toUpperCase()),
    destination: z.string().length(3).transform((s) => s.toUpperCase()),
    departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    adults: z.number().int().min(1).max(9),
    children: z.array(z.number().int().min(2).max(17)).max(8).default([]),
    infants: z.number().int().min(0).max(9).default(0),
    currency: currencyCodeSchema,
  })
  .refine((value) => value.adults + value.children.length + value.infants <= 9, {
    message: 'Total travellers cannot exceed 9',
    path: ['adults'],
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
  // Presentation fields. They are optional because older cached offers and
  // some gateway responses only carry the human-readable `flight` string.
  // The search route always fills origin/destination/departureDate from the
  // request so the detail page has a reliable route even on that fallback.
  origin: z.string().length(3).optional(),
  destination: z.string().length(3).optional(),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  departureTime: z.string().max(10).optional(),
  arrivalTime: z.string().max(10).optional(),
  durationMinutes: z.number().int().min(0).optional(),
  stops: z.number().int().min(0).max(10).optional(),
  airline: z.string().max(100).optional(),
  fareBrand: z.string().max(100).optional(),
  ticketingDeadline: z.string().max(64).optional(),
  refundable: z.boolean().optional(),
});
export type FlightOffer = z.infer<typeof flightOfferSchema>;

export const passengerSchema = z.object({
  type: z.enum(['ADT', 'CHD', 'INF']),
  age: z.number().int().min(0).max(120).optional(),
  // Names are required by the airline order API. They stay optional on the
  // base schema so older callers that only pass type/age keep working.
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  dateOfBirth: isoDateString.optional(),
  passportNumber: z.string().max(50).optional(),
  nationality: z.string().length(2).optional(),
});
export type Passenger = z.infer<typeof passengerSchema>;

export const flightOrderRequestSchema = z.object({
  offerId: z.string().min(1),
  paymentToken: z.string().min(1),
  passengers: z.array(passengerSchema).min(1).max(9),
  guestInfo: guestInfoSchema.optional(),
  idempotencyKey: z.string().min(1).max(128).optional(),
});
export type FlightOrderRequest = z.infer<typeof flightOrderRequestSchema>;

export const flightOrderResponseSchema = z.object({
  orderId: z.string().min(1),
  pnr: z.string().min(1),
  ticket: z.string().min(1),
  pdf: z.string().min(1),
});
export type FlightOrderResponse = z.infer<typeof flightOrderResponseSchema>;

// Provider-neutral cancellation contract. Amounts are in minor units so the
// booking/refund layer never has to guess a provider's decimal convention.
export interface FlightCancellationReason {
  code: string;
  display: string;
  additionalReason?: boolean;
}

export interface FlightCancellationQuote {
  cancellable: boolean;
  supportRequired: boolean;
  reasons: FlightCancellationReason[];
  /** Provider estimate, or null when the gateway did not return one. */
  estimatedRefundMinor: number | null;
}

export interface FlightCancellationRequest {
  orderId: string;
  code: string;
  reason: string;
  additionalReason?: boolean;
  remarks?: string;
  idempotencyKey?: string;
}

export interface FlightCancellationResult {
  orderId: string;
  bookingStatus: string;
  cancellationId?: string;
}
