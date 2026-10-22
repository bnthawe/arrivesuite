import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { alertStates, auditEvents, bookings, db } from '@arrivesuite/db';
import { requireAdmin } from '@/lib/admin';
import { presentBooking, traceIdFromRequest } from '@/lib/bookings-core';
import { withIdempotency } from '@/lib/idempotency';
import { fulfillPaidBooking } from '@/lib/ticketing';

export async function POST(
  request: Request,
  ctx: { params: Promise<{ ref: string }> },
) {
  return withIdempotency(
    request,
    { scope: 'route:POST:/api/v1/admin/bookings/[ref]/retry-ticketing', audit: false },
    () => handlePost(request, ctx),
  );
}

async function handlePost(
  request: Request,
  { params }: { params: Promise<{ ref: string }> },
) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  const { ref } = await params;
  const normalized = ref.trim();
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.ref, normalized))
    .limit(1);
  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  const traceId = traceIdFromRequest(request);
  const result = await fulfillPaidBooking(booking.id, traceId, { retryFailed: true });

  try {
    await db.insert(auditEvents).values({
      actorId: gate.account.id,
      actorRealm: 'admin',
      action: 'booking.ticketing_retry',
      entityType: 'booking',
      entityId: booking.id,
      diff: { result, previousStatus: booking.status, traceId },
      traceId,
    });
  } catch (err) {
    console.error('[admin.ticketing_retry] audit failed', err);
  }

  let alertsResolved = 0;
  if (result.ok && (result.status === 'ticketed' || result.status === 'no_action')) {
    try {
      const resolved = await db
        .update(alertStates)
        .set({ resolvedAt: new Date() })
        .where(
          and(
            eq(alertStates.kind, 'ticketing_failed'),
            eq(alertStates.reference, normalized),
            isNull(alertStates.resolvedAt),
          ),
        )
        .returning();
      alertsResolved = resolved.length;
      if (alertsResolved > 0) {
        await db.insert(auditEvents).values({
          actorId: gate.account.id,
          actorRealm: 'admin',
          action: 'alert.resolved',
          entityType: 'alert',
          entityId: `ticketing_failed:${normalized}`,
          diff: { kind: 'ticketing_failed', reference: normalized, reason: 'ticketing_retry_succeeded' },
          traceId,
        });
      }
    } catch (err) {
      console.error('[admin.ticketing_retry] alert resolution failed', err);
    }
  }

  const [updated] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, booking.id))
    .limit(1);

  return NextResponse.json(
    {
      ...result,
      alertsResolved,
      ...(updated ? { booking: presentBooking(updated) } : {}),
    },
    { status: result.ok ? 200 : 409 },
  );
}
