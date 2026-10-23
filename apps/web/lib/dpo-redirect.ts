export type DpoRedirectReason = 'ok' | 'private' | 'invalid';

export interface DpoRedirectResolution {
  url: string | null;
  reason: DpoRedirectReason;
}

export interface DpoRedirectEnv {
  APP_URL?: string;
  BETTER_AUTH_URL?: string;
  DPO_PAY_REDIRECT_URL?: string;
}

// DPO's CloudFront distribution blocks requests whose RedirectURL/BackURL
// points at localhost or common private ranges. The application sees this as a
// generic CloudFront 403, so never send a local/private URL to the gateway.
export function isPrivateHostname(hostname: string): boolean {
  const host = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');

  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === 'host.docker.internal' || host === 'gateway.docker.internal') return true;
  if (host === 'metadata.google.internal') return true;
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.home.arpa')) return true;
  if (host === 'localtest.me' || host.endsWith('.localtest.me')) return true;
  if (host === 'lvh.me' || host.endsWith('.lvh.me')) return true;
  if (host.endsWith('.nip.io') || host.endsWith('.sslip.io')) return true;

  // IPv4 literals. Block loopback, RFC1918, link-local, CGNAT, and reserved
  // multicast space. A dotted hostname such as example.com is not an IP.
  const parts = host.split('.');
  if (parts.length === 4) {
    const octets = parts.map((part) => Number(part));
    if (octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
      const [a, b, c] = octets;
      if (a === 0 || a === 10 || a === 127) return true;
      if (a === 169 && b === 254) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 100 && b >= 64 && b <= 127) return true;
      if (a === 192 && b === 0 && c === 0) return true;
      if (a === 198 && (b === 18 || b === 19)) return true;
      if (a >= 224) return true;
      return false;
    }
  }

  // IPv6 loopback/unspecified and IPv4-mapped forms.
  if (host === '::1' || host === '::') return true;
  if (host.startsWith('::ffff:')) return true;

  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10).
  const firstHextet = host.split(':')[0];
  if (/^f[cd][0-9a-f]{2}$/.test(firstHextet)) return true;
  if (/^fe[89ab][0-9a-f]$/.test(firstHextet)) return true;

  // A bare service name without a dot is an internal hostname.
  if (!host.includes('.') && !host.includes(':')) return true;

  return false;
}

// Resolve the return URL DPO should use. `DPO_PAY_REDIRECT_URL` takes
// precedence over APP_URL/BETTER_AUTH_URL so a local dev instance can point at
// a public tunnel while keeping APP_URL on localhost.
export function resolveDpoRedirectUrl(
  returnTo: 'confirmation' | 'json',
  env: DpoRedirectEnv = process.env as DpoRedirectEnv,
): DpoRedirectResolution {
  const base =
    env.DPO_PAY_REDIRECT_URL ?? env.APP_URL ?? env.BETTER_AUTH_URL ?? 'http://localhost:3000';
  const suffix = returnTo === 'confirmation' ? '/confirmation' : '';

  let url: URL;
  try {
    url = new URL(`/api/v1/payments/dpo/return${suffix}`, base);
  } catch {
    return { url: null, reason: 'invalid' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { url: null, reason: 'invalid' };
  }
  if (isPrivateHostname(url.hostname)) {
    return { url: null, reason: 'private' };
  }
  return { url: url.toString(), reason: 'ok' };
}
