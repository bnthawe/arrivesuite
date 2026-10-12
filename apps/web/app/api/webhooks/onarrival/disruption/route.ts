import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { auditEvents, db } from '@arrivesuite/db';
import { traceIdFromRequest } from '@/lib/bookings-core';

const disruptionSchema = z.object({
  orderId: z.string().min(1).optional(),
  pnr: z.string().min(1).optional(),
  type: z.string().min(1),
  message: z.string().max(1000).optional(),
  occurredAt: z.string().datetime().optional(),
});

function validSecret(provided: string | null): boolean {
  const expected = process.env.ONARRIVAL_WEBHOOK_SECRET ?? '';
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// OnArrival disruption notices (schedule change, cancellation). Shared-secret
// checked before parsing; every notice lands in the immutable audit log.
export async function POST(request: Request) {
  if (!validSecret(request.headers.get('x-webhook-secret'))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = disruptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const traceId = traceIdFromRequest(request);
  await db.insert(auditEvents).values({
    action: 'flight.disruption_received',
    entityType: 'flight_order',
    entityId: parsed.data.orderId ?? parsed.data.pnr ?? 'unknown',
    diff: { type: parsed.data.type, message: parsed.data.message, occurredAt: parsed.data.occurredAt },
    traceId,
  });

  return NextResponse.json({ ok: true });
}
