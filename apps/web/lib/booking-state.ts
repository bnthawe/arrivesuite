// Section 9.1 booking state machine (ADR-0020). The transition table lives in
// code, not configuration: adding a state requires a migration and a code change.
export const BOOKING_STATUSES = [
  'draft',
  'pending',
  'pending_payment',
  'confirmed',
  'on_hold',
  'ticketing',
  'ticketed',
  'exchanging',
  'fulfilled',
  'cancelled',
  'refunded',
  'expired',
  'no_show',
  'failed',
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

const TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  draft: ['pending_payment'],
  // Legacy pre-v2.7 value. Kept until every row is migrated; it may only move
  // forward into the explicit state machine.
  pending: ['pending_payment', 'confirmed', 'failed', 'expired', 'no_show'],
  pending_payment: ['confirmed', 'failed', 'expired'],
  confirmed: ['ticketing', 'fulfilled', 'on_hold', 'cancelled', 'no_show'],
  on_hold: ['confirmed', 'cancelled', 'expired'],
  ticketing: ['ticketed', 'failed'],
  ticketed: ['exchanging', 'fulfilled', 'cancelled', 'no_show'],
  exchanging: ['ticketed', 'failed'],
  fulfilled: ['cancelled', 'refunded', 'no_show'],
  cancelled: ['refunded'],
  refunded: [],
  expired: [],
  no_show: [],
  failed: [],
};

export function isBookingStatus(value: string): value is BookingStatus {
  return (BOOKING_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: string, to: BookingStatus): boolean {
  if (!isBookingStatus(from)) return false;
  return TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: string): readonly BookingStatus[] {
  return isBookingStatus(from) ? TRANSITIONS[from] : [];
}
