import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { alertStates, auditEvents, bookings, db } from '@arrivesuite/db';
import { requireAdmin } from '@/lib/admin';
import { traceIdFromRequest } from '@/lib/bookings-core';
import { withIdempotency } from '@/lib/idempotency';

const resolveSchema = z.object({
  kind: z.enum(['ticketing_failed', 'ticketing_stuck']).default('ticketing_failed'),
  note: z.string().max(500).optional(),
});

export async function POST(
  request: Request,
  ctx: { params: Promise<{ ref: string }> },
) {
  return withIdempotency(
    request,
    { scope: 'route:POST:/api/v1/admin/bookings/[ref]/resolve-alert', audit: false },
    () => handlePost(request, ctx),
  );
}

async function handlePost(
  request: Request,
  { params }: { params: Promise<{ ref: string }> },
) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = resolveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { ref } = await params;
  const normalized = ref.trim();
  const [booking] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.ref, normalized))
    .limit(1);
  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  const traceId = traceIdFromRequest(request);
  const resolved = await db
    .update(alertStates)
    .set({ resolvedAt: new Date() })
    .where(
      and(
        eq(alertStates.kind, parsed.data.kind),
        eq(alertStates.reference, normalized),
        isNull(alertStates.resolvedAt),
      ),
    )
    .returning();

  if (resolved.length > 0) {
    try {
      await db.insert(auditEvents).values({
        actorId: gate.account.id,
        actorRealm: 'admin',
        action: 'alert.resolved',
        entityType: 'alert',
        entityId: `${parsed.data.kind}:${normalized}`,
        diff: {
          kind: parsed.data.kind,
          reference: normalized,
          note: parsed.data.note ?? null,
          reason: 'admin_manual_resolution',
        },
        traceId,
      });
    } catch (err) {
      console.error('[admin.resolve_alert] audit failed', err);
    }
  }

  return NextResponse.json({
    resolved: resolved.length,
    ref: normalized,
    kind: parsed.data.kind,
  });
}
