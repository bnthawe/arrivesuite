import { describe, expect, it } from 'vitest';
import {
  BOOKING_STATUSES,
  allowedTransitions,
  canTransition,
  isBookingStatus,
} from './booking-state';

describe('booking state machine', () => {
  it('allows the payment capture transition', () => {
    expect(canTransition('pending_payment', 'confirmed')).toBe(true);
  });

  it('rejects going backwards from confirmed to pending_payment', () => {
    expect(canTransition('confirmed', 'pending_payment')).toBe(false);
  });

  it('allows legacy pending rows to move forward', () => {
    expect(canTransition('pending', 'pending_payment')).toBe(true);
    expect(canTransition('pending', 'confirmed')).toBe(true);
    expect(canTransition('pending', 'cancelled')).toBe(false);
  });

  it('allows no-show from confirmed and fulfilled bookings', () => {
    expect(canTransition('confirmed', 'no_show')).toBe(true);
    expect(canTransition('fulfilled', 'no_show')).toBe(true);
    expect(canTransition('pending_payment', 'no_show')).toBe(false);
  });

  it('treats terminal states as terminal', () => {
    for (const status of ['refunded', 'expired', 'no_show', 'failed'] as const) {
      expect(allowedTransitions(status)).toHaveLength(0);
    }
  });

  it('recognizes every declared status and rejects unknown values', () => {
    for (const status of BOOKING_STATUSES) {
      expect(isBookingStatus(status)).toBe(true);
    }
    expect(isBookingStatus('paid')).toBe(false);
    expect(canTransition('paid', 'confirmed')).toBe(false);
  });
});
