import { withIdempotency } from '@/lib/idempotency';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { auditEvents, db, rfqs } from '@arrivesuite/db';
import { getSessionAccount } from '@/lib/auth';
import { traceIdFromRequest } from '@/lib/bookings-core';

const createRfqSchema = z.object({
  title: z.string().min(1).max(255),
  requirements: z.string().min(1).max(10000),
  eventDate: z.string().datetime().optional(),
  deadlineAt: z.string().datetime().optional(),
  traceId: z.string().max(100).optional(),
});

// Any authenticated account can raise a corporate request.
export async function POST(request: Request) {
  return withIdempotency(request, { scope: 'route:POST:/api/v1/rfqs' }, () => handlePost(request));
}

async function handlePost(request: Request) {
  const account = await getSessionAccount(request);
  if (!account) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = createRfqSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const traceId = traceIdFromRequest(request, parsed.data.traceId);

  const [rfq] = await db
    .insert(rfqs)
    .values({
      accountId: account.id,
      title: parsed.data.title,
      requirements: parsed.data.requirements,
      eventDate: parsed.data.eventDate ? new Date(parsed.data.eventDate) : null,
      deadlineAt: parsed.data.deadlineAt ? new Date(parsed.data.deadlineAt) : null,
    })
    .returning();

  await db.insert(auditEvents).values({
    actorId: account.id,
    actorRealm: account.realm,
    action: 'rfq.created',
    entityType: 'rfq',
    entityId: rfq.id,
    diff: { title: rfq.title },
    traceId,
  });

  return NextResponse.json({ rfq }, { status: 201 });
}

// Requesters see their own; ?scope=open shows open RFQs to suppliers.
export async function GET(request: Request) {
  const account = await getSessionAccount(request);
  if (!account) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const scope = new URL(request.url).searchParams.get('scope');
  if (scope === 'open') {
    const rows = await db.select().from(rfqs).where(eq(rfqs.status, 'open')).orderBy(desc(rfqs.createdAt)).limit(100);
    return NextResponse.json({ rfqs: rows });
  }
  const rows = await db
    .select()
    .from(rfqs)
    .where(eq(rfqs.accountId, account.id))
    .orderBy(desc(rfqs.createdAt))
    .limit(100);
  return NextResponse.json({ rfqs: rows });
}
