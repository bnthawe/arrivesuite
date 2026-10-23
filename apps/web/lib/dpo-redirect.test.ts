import { describe, expect, it } from 'vitest';
import { isPrivateHostname, resolveDpoRedirectUrl } from './dpo-redirect';

describe('DPO redirect safety', () => {
  it('keeps a public HTTPS return URL', () => {
    expect(
      resolveDpoRedirectUrl('confirmation', { APP_URL: 'https://www.arrivesuite.com' }),
    ).toEqual({
      url: 'https://www.arrivesuite.com/api/v1/payments/dpo/return/confirmation',
      reason: 'ok',
    });
  });

  it('keeps a public HTTP return URL', () => {
    expect(resolveDpoRedirectUrl('json', { APP_URL: 'http://example.com' })).toEqual({
      url: 'http://example.com/api/v1/payments/dpo/return',
      reason: 'ok',
    });
  });

  it('omits localhost and loopback redirects', () => {
    for (const host of [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://[::1]:3000',
      'http://0.0.0.0:3000',
    ]) {
      expect(resolveDpoRedirectUrl('confirmation', { APP_URL: host })).toEqual({
        url: null,
        reason: 'private',
      });
    }
  });

  it('omits RFC1918, link-local, and CGNAT redirects', () => {
    for (const host of [
      'http://10.0.0.1',
      'http://172.16.0.1',
      'http://172.31.255.255',
      'http://192.168.1.1',
      'http://169.254.169.254',
      'http://100.64.0.1',
      'http://[fc00::1]',
      'http://[fe80::1]',
    ]) {
      expect(resolveDpoRedirectUrl('confirmation', { APP_URL: host })).toEqual({
        url: null,
        reason: 'private',
      });
    }
  });

  it('omits internal service names and loopback DNS aliases', () => {
    for (const host of [
      'http://host.docker.internal:3000',
      'http://metadata.google.internal',
      'http://service.local',
      'http://localtest.me:3000',
      'http://team.lvh.me:3000',
      'http://127.0.0.1.nip.io:3000',
    ]) {
      expect(isPrivateHostname(new URL(host).hostname)).toBe(true);
    }
  });

  it('allows a public IPv4 literal', () => {
    expect(resolveDpoRedirectUrl('json', { APP_URL: 'http://8.8.8.8' })).toEqual({
      url: 'http://8.8.8.8/api/v1/payments/dpo/return',
      reason: 'ok',
    });
  });

  it('defaults to localhost and safely omits it', () => {
    expect(resolveDpoRedirectUrl('confirmation', {})).toEqual({
      url: null,
      reason: 'private',
    });
  });

  it('rejects a malformed or non-HTTP base URL', () => {
    expect(resolveDpoRedirectUrl('confirmation', { APP_URL: 'not-a-url' })).toEqual({
      url: null,
      reason: 'invalid',
    });
    expect(resolveDpoRedirectUrl('confirmation', { APP_URL: 'ftp://example.com' })).toEqual({
      url: null,
      reason: 'invalid',
    });
  });

  it('lets DPO_PAY_REDIRECT_URL override a local APP_URL', () => {
    expect(
      resolveDpoRedirectUrl('confirmation', {
        APP_URL: 'http://localhost:3000',
        DPO_PAY_REDIRECT_URL: 'https://pay.example.com',
      }),
    ).toEqual({
      url: 'https://pay.example.com/api/v1/payments/dpo/return/confirmation',
      reason: 'ok',
    });
  });

  it('does not let APP_URL override an unsafe DPO_PAY_REDIRECT_URL', () => {
    expect(
      resolveDpoRedirectUrl('confirmation', {
        APP_URL: 'https://www.arrivesuite.com',
        DPO_PAY_REDIRECT_URL: 'http://localhost:3000',
      }),
    ).toEqual({ url: null, reason: 'private' });
  });
});
