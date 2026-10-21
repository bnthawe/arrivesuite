// FR-5.15.34: one key per checkout attempt, persisted in sessionStorage so a
// refresh or retry replays the original response instead of re-booking.
const PREFIX = 'ars:idempotency:cart-checkout:';

export function cartCheckoutKey(cartId: string): string {
  const storageKey = `${PREFIX}${cartId}`;
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const key = globalThis.crypto?.randomUUID?.() ?? fallbackKey();
  window.sessionStorage.setItem(storageKey, key);
  return key;
}

export function clearCartCheckoutKey(cartId: string): void {
  window.sessionStorage.removeItem(`${PREFIX}${cartId}`);
}

function fallbackKey(): string {
  // crypto.randomUUID is available in all supported secure contexts; this
  // keeps local HTTP previews working without weakening the server contract.
  return `ars-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
