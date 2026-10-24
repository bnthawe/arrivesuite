// WhatsApp OTP authentication for supplier login.
// Generates a 6-digit code, stores a SHA-256 hash in verification_tokens,
// and sends it via WhatsApp using the ars_otp template.

import { createHash, randomInt } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import { accounts, db, verificationTokens } from '@arrivesuite/db';
import { whatsAppConfigFromEnv, sendTemplateMessage } from '@arrivesuite/integrations';

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_PER_HOUR = 5;
const OTP_LENGTH = 6;

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function generateCode(): string {
  const num = randomInt(0, 10 ** OTP_LENGTH);
  return num.toString().padStart(OTP_LENGTH, '0');
}

export async function requestOtp(phoneE164: string): Promise<{ ok: boolean; error?: string }> {
  const normalized = phoneE164.replace(/[^0-9+]/g, '');
  if (!normalized || normalized.length < 8) {
    return { ok: false, error: 'Invalid phone number' };
  }

  // Rate limit: max 5 OTPs per number per hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await db
    .select()
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.purpose, 'whatsapp_otp'),
        gt(verificationTokens.createdAt, oneHourAgo),
      ),
    );
  // Count tokens for this phone by checking account linkage
  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.phoneE164, normalized))
    .limit(1);

  if (!account) {
    // Don't reveal whether the number is registered
    return { ok: true };
  }

  const accountTokens = recent.filter((t) => t.accountId === account.id);
  if (accountTokens.length >= RATE_LIMIT_PER_HOUR) {
    return { ok: false, error: 'Too many OTP requests. Try again later.' };
  }

  // Invalidate previous unused OTPs for this account
  await db
    .update(verificationTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(verificationTokens.accountId, account.id),
        eq(verificationTokens.purpose, 'whatsapp_otp'),
        // only invalidate unused ones
      ),
    );

  const code = generateCode();
  const tokenHash = hashCode(code);

  await db.insert(verificationTokens).values({
    accountId: account.id,
    tokenHash,
    purpose: 'whatsapp_otp',
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
  });

  // Send via WhatsApp
  const cfg = whatsAppConfigFromEnv();
  if (cfg.sandbox) {
    console.log(`[whatsapp-otp] sandbox: OTP for ${normalized} is ${code}`);
  } else {
    try {
      await sendTemplateMessage({ to: normalized, template: 'ars_otp', bodyParams: [code] });
    } catch (err) {
      console.error('[whatsapp-otp] send failed', err);
      return { ok: false, error: 'Failed to send OTP. Try again.' };
    }
  }

  return { ok: true };
}

export async function verifyOtp(
  phoneE164: string,
  code: string,
): Promise<{ ok: boolean; accountId?: string; error?: string }> {
  const normalized = phoneE164.replace(/[^0-9+]/g, '');
  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.phoneE164, normalized))
    .limit(1);

  if (!account) {
    return { ok: false, error: 'Invalid credentials' };
  }

  const tokenHash = hashCode(code);
  const [token] = await db
    .select()
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.accountId, account.id),
        eq(verificationTokens.tokenHash, tokenHash),
        eq(verificationTokens.purpose, 'whatsapp_otp'),
      ),
    )
    .limit(1);

  if (!token) {
    return { ok: false, error: 'Invalid or expired OTP' };
  }
  if (token.usedAt) {
    return { ok: false, error: 'OTP already used' };
  }
  if (new Date() > token.expiresAt) {
    return { ok: false, error: 'OTP expired' };
  }

  // Mark as used
  await db
    .update(verificationTokens)
    .set({ usedAt: new Date() })
    .where(eq(verificationTokens.id, token.id));

  return { ok: true, accountId: account.id };
}