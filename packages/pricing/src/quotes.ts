import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Server-side signed quotes (ADR-0012). A quote freezes item totals at
// search time; booking paths honor only valid, unexpired, unspent quotes.
// Amount math is unchanged (net + markup + tax); the 0.5% GMV float stays
// recorded-but-unapplied until signed off (it moves customer prices).

export interface QuoteItem {
  itemType: string;
  itemRef: string;
  quantity: number;
  netCents: number;
  markupCents: number;
  taxCents: number;
  totalCents: number;
}

export interface Quote {
  jti: string;
  currency: string;
  items: QuoteItem[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  rulesApplied: { floatBps: number; fxBufferBps: number };
  issuedAt: number;
  expiresAt: number;
}

export interface QuoteToken {
  token: string;
  quote: Quote;
}

function secret(): string {
  const s = process.env.PRICING_SIGNING_SECRET ?? process.env.BETTER_AUTH_SECRET ?? '';
  if (!s) throw new Error('PRICING_SIGNING_SECRET is not configured');
  return s;
}

function b64url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(payloadB64: string): string {
  return createHmac('sha256', secret()).update(payloadB64).digest('base64url');
}

export function totalsFor(items: Omit<QuoteItem, 'totalCents'>[]): {
  withTotals: QuoteItem[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
} {
  const withTotals = items.map((i) => ({
    ...i,
    totalCents: i.netCents + i.markupCents + i.taxCents,
  }));
  const subtotalCents = withTotals.reduce((s, i) => s + i.netCents + i.markupCents, 0);
  const taxCents = withTotals.reduce((s, i) => s + i.taxCents, 0);
  return { withTotals, subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
}

export function mintQuote(
  items: Omit<QuoteItem, 'totalCents'>[],
  currency: string,
  ttlMinutes = 15,
): QuoteToken {
  const { withTotals, subtotalCents, taxCents, totalCents } = totalsFor(items);
  const now = Date.now();
  const quote: Quote = {
    jti: randomBytes(16).toString('hex'),
    currency: currency.toUpperCase(),
    items: withTotals,
    subtotalCents,
    taxCents,
    totalCents,
    rulesApplied: { floatBps: 0, fxBufferBps: 0 },
    issuedAt: now,
    expiresAt: now + ttlMinutes * 60_000,
  };
  const payloadB64 = b64url(JSON.stringify(quote));
  return { token: `${payloadB64}.${sign(payloadB64)}`, quote };
}

export type VerifyQuoteResult =
  | { ok: true; quote: Quote }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

export function verifyQuoteToken(token: string): VerifyQuoteResult {
  const dot = token.lastIndexOf('.');
  if (dot < 0) return { ok: false, reason: 'malformed' };
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = Buffer.from(sign(payloadB64));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, reason: 'bad_signature' };
  }
  let quote: Quote;
  try {
    quote = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as Quote;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!quote?.jti || !Array.isArray(quote.items) || typeof quote.expiresAt !== 'number') {
    return { ok: false, reason: 'malformed' };
  }
  if (quote.expiresAt <= Date.now()) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, quote };
}
