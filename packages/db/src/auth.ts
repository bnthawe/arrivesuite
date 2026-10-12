import { randomBytes, createHash } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

// Password hashing for accounts.password_hash. Uses @node-rs/argon2
// (prebuilt binaries — no node-gyp), compatible with the argon2id hashes
// written by the seed script.
export async function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// Session tokens are 256-bit random values. Only the SHA-256 hash is
// stored (sessions.token_hash); the plaintext token lives in the cookie.
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
