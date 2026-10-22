import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auditEvents, db } from '@arrivesuite/db';
import { requireAdmin } from '@/lib/admin';
import { traceIdFromRequest } from '@/lib/bookings-core';
import { withIdempotency } from '@/lib/idempotency';
import { listSystemFlags, setSystemFlag } from '@/lib/system-flags';

const flagKeySchema = z.enum(['bookings_enabled', 'payments_enabled']);

const updateSchema = z.object({
  key: flagKeySchema,
  enabled: z.boolean(),
  note: z.string().max(500).nullable().optional(),
});

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;
  return NextResponse.json({ flags: await listSystemFlags() });
}

export async function PUT(request: Request) {
  return withIdempotency(
    request,
    { scope: 'route:PUT:/api/v1/admin/flags', audit: false },
    () => handlePut(request),
  );
}

async function handlePut(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const traceId = traceIdFromRequest(request);
  const flag = await setSystemFlag(
    parsed.data.key,
    parsed.data.enabled,
    gate.account.id,
    parsed.data.note ?? null,
  );
  await db.insert(auditEvents).values({
    actorId: gate.account.id,
    actorRealm: 'admin',
    action: 'admin.flag_updated',
    entityType: 'system_flag',
    entityId: flag.key,
    diff: { enabled: flag.enabled, note: flag.note },
    traceId,
  });

  return NextResponse.json({ flag });
}
