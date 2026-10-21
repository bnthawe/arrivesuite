import type { SessionAccount } from './auth';

// FR-5.13.49 / FR-5.16.41 / T0.2: every successful write gets an audit row.
// Routes that already emit a domain-specific event pass `audit: false` to the
// idempotency wrapper, so this fallback never duplicates business audit rows.
export interface WriteAuditEvent {
  actorId: string | null;
  actorRealm: SessionAccount['realm'] | null;
  action: string;
  entityType: string;
  entityId: string;
  diff: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  traceId: string | null;
}

function firstHeader(request: Request, names: string[]): string | null {
  for (const name of names) {
    const value = request.headers.get(name);
    if (value) return value.split(',')[0]!.trim() || null;
  }
  return null;
}

function traceIdFrom(request: Request): string | null {
  const traceHeader = process.env.TRACE_ID_HEADER ?? 'x-trace-id';
  const trace = request.headers.get(traceHeader) ?? request.headers.get('x-request-id');
  return trace?.trim().slice(0, 100) || null;
}

export function buildWriteAuditEvent(input: {
  request: Request;
  response: Response;
  scope: string;
  actor: Pick<SessionAccount, 'id' | 'realm'> | null;
}): WriteAuditEvent {
  const { request, response, scope, actor } = input;
  const method = request.method.toUpperCase();
  const path = new URL(request.url).pathname;
  const route = `${method} ${path}`;

  return {
    actorId: actor?.id ?? null,
    actorRealm: actor?.realm ?? null,
    action: 'api.write',
    entityType: 'api_route',
    entityId: route.slice(0, 100),
    diff: {
      method,
      path,
      scope,
      status: response.status,
      idempotencyKeyPresent: request.headers.has('Idempotency-Key'),
    },
    ip: firstHeader(request, ['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip'])?.slice(0, 45) ?? null,
    userAgent: request.headers.get('user-agent')?.slice(0, 1024) ?? null,
    traceId: traceIdFrom(request),
  };
}

// Move the session lookup behind a dynamic import. The audit module is imported
// by the idempotency unit tests, which run without DATABASE_URL; the database
// client throws eagerly when that variable is absent.
async function resolveActor(request: Request): Promise<SessionAccount | null> {
  const { getRequestActor, getSessionAccount } = await import('./auth');
  const cached = getRequestActor(request);
  if (cached !== undefined) return cached;
  return getSessionAccount(request);
}

export async function recordWriteAudit(
  request: Request,
  scope: string,
  response: Response,
): Promise<void> {
  // Failed/denied attempts did not change state. Login failures are recorded
  // explicitly by the auth route; business failures are recorded by their
  // domain code where relevant.
  if (response.status >= 400) return;

  try {
    const actor = await resolveActor(request);
    const event = buildWriteAuditEvent({ request, response, scope, actor });
    const { auditEvents, db } = await import('@arrivesuite/db');
    await db.insert(auditEvents).values(event);
  } catch (err) {
    // The write already succeeded. Audit storage is best-effort here; never
    // turn a successful mutation into a 500 because the audit insert failed.
    console.error(`[audit] could not record write for ${scope}:`, err);
  }
}
