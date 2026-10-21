import { describe, expect, it } from 'vitest';
import { buildWriteAuditEvent } from './audit';

function request(body = '{"secret":"do-not-log"}') {
  return new Request('https://example.com/api/v1/admin/agencies?token=hidden', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': '11111111-1111-4111-8111-111111111111',
      'X-Forwarded-For': '203.0.113.7, 10.0.0.1',
      'X-Trace-Id': 'trace-123',
      'User-Agent': 'vitest',
    },
    body,
  });
}

describe('buildWriteAuditEvent', () => {
  it('captures actor, route, status, source IP, and trace without the body', () => {
    const event = buildWriteAuditEvent({
      request: request(),
      response: Response.json({ ok: true }, { status: 201 }),
      scope: 'route:POST:/api/v1/admin/agencies',
      actor: { id: '11111111-1111-4111-8111-111111111111', realm: 'admin' },
    });

    expect(event).toMatchObject({
      actorId: '11111111-1111-4111-8111-111111111111',
      actorRealm: 'admin',
      action: 'api.write',
      entityType: 'api_route',
      entityId: 'POST /api/v1/admin/agencies',
      ip: '203.0.113.7',
      userAgent: 'vitest',
      traceId: 'trace-123',
      diff: {
        method: 'POST',
        path: '/api/v1/admin/agencies',
        scope: 'route:POST:/api/v1/admin/agencies',
        status: 201,
        idempotencyKeyPresent: true,
      },
    });
    expect(JSON.stringify(event)).not.toContain('do-not-log');
    expect(JSON.stringify(event)).not.toContain('hidden');
  });

  it('keeps anonymous writes auditable', () => {
    const event = buildWriteAuditEvent({
      request: new Request('https://example.com/api/v1/hotels/prebook', { method: 'POST' }),
      response: Response.json({ ok: true }),
      scope: 'route:POST:/api/v1/hotels/prebook',
      actor: null,
    });

    expect(event.actorId).toBeNull();
    expect(event.actorRealm).toBeNull();
    expect(event.ip).toBeNull();
    expect(event.traceId).toBeNull();
    expect(event.diff.idempotencyKeyPresent).toBe(false);
  });
});
