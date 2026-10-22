import { beforeAll, describe, expect, it } from 'vitest';
import { signBookingAccess, verifyBookingAccess } from './booking-access';

beforeAll(() => {
  process.env.BOOKING_ACCESS_SECRET = 'test-booking-access-secret-at-least-32-chars';
});

describe('booking access token', () => {
  it('round-trips for the same booking ref', () => {
    const token = signBookingAccess('ARS-2026-000042');
    expect(verifyBookingAccess('ARS-2026-000042', token)).toBe(true);
    expect(verifyBookingAccess(' ARS-2026-000042 ', token)).toBe(true);
  });

  it('rejects a token for another booking', () => {
    const token = signBookingAccess('ARS-2026-000042');
    expect(verifyBookingAccess('ARS-2026-000043', token)).toBe(false);
  });

  it('rejects a tampered token', () => {
    const token = signBookingAccess('ARS-2026-000042');
    const tampered = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;
    expect(verifyBookingAccess('ARS-2026-000042', tampered)).toBe(false);
  });

  it('rejects an expired token', () => {
    const token = signBookingAccess('ARS-2026-000042', -1);
    expect(verifyBookingAccess('ARS-2026-000042', token)).toBe(false);
  });

  it('rejects missing and malformed tokens', () => {
    expect(verifyBookingAccess('ARS-2026-000042', null)).toBe(false);
    expect(verifyBookingAccess('ARS-2026-000042', '')).toBe(false);
    expect(verifyBookingAccess('ARS-2026-000042', 'not-a-token')).toBe(false);
  });
});
