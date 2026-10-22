import { createHmac, timingSafeEqual } from 'node:crypto';

// The confirmation page is reachable from the DPO return redirect without a
// session. The ref alone is guessable, so the redirect carries a short-lived
// HMAC token tied to that booking ref. The token is safe to share with the
// traveller until it expires.
const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;

function signingSecret(): string {
  const secret =
    process.env.BOOKING_ACCESS_SECRET ??
    process.env.PRICING_SIGNING_SECRET ??
    process.env.BETTER_AUTH_SECRET ??
    '';
  if (!secret) throw new Error('BOOKING_ACCESS_SECRET is not configured');
  return secret;
}

export function signBookingAccess(ref: string, ttlSeconds = DEFAULT_TTL_SECONDS): string {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  const payload = Buffer.from(`${ref.trim()}.${expiresAt}`, 'utf8').toString('base64url');
  const signature = createHmac('sha256', signingSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyBookingAccess(ref: string, token: string | null | undefined): boolean {
  if (!token) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;

  let expected: string;
  try {
    expected = createHmac('sha256', signingSecret()).update(payload).digest('base64url');
  } catch {
    return false;
  }

  const supplied = Buffer.from(signature, 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  if (supplied.length !== wanted.length || !timingSafeEqual(supplied, wanted)) return false;

  let decoded: string;
  try {
    decoded = Buffer.from(payload, 'base64url').toString('utf8');
  } catch {
    return false;
  }
  const separator = decoded.lastIndexOf('.');
  if (separator < 1) return false;
  const tokenRef = decoded.slice(0, separator);
  const expiresAt = Number(decoded.slice(separator + 1));
  return tokenRef === ref.trim() && Number.isFinite(expiresAt) && expiresAt > Date.now();
}
