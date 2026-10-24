import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionAccount } from '@/lib/auth';
import { createBooking } from '@/lib/bookings-core';
import { withIdempotency } from '@/lib/idempotency';

const itemSchema = z.object({
  itemType: z.string().min(1).max(50),
  itemRef: z.string().min(1).max(100),
  itemSupplierType: z.string().min(1).max(50),
  quantity: z.number().int().min(1).default(1),
  netCents: z.number().int().min(0),
  markupCents: z.number().int().min(0).default(0),
  taxCents: z.number().int().min(0).default(0),
});

const createBookingSchema = z.object({
  accountId: z.string().uuid(),
  channel: z.enum(['web', 'whatsapp', 'api', 'backoffice']),
  currency: z.string().length(3),
  items: z.array(itemSchema).min(1).max(50),
  traceId: z.string().max(100).optional(),
  quoteToken: z.string().min(1).optional(),
  agencyId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  return withIdempotency(request, { scope: 'bookings.create', audit: false }, () => handlePost(request));
}

async function handlePost(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = createBookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // The client must not choose whose booking it is. Non-admins book only for
  // themselves; admins may use the backoffice path to book on behalf of an
  // account. (Guest flows go through /flights/checkout or /hotels/book, which
  // resolve the account server-side.)
  const account = await getSessionAccount(request);
  if (!account) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (account.realm !== 'admin' && parsed.data.accountId !== account.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const result = await createBooking({
    ...parsed.data,
    idempotencyKey: request.headers.get('Idempotency-Key')?.slice(0, 100) ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const headers = result.created.replayed ? { 'Idempotent-Replayed': 'true' } : undefined;
  return NextResponse.json(result.created, { status: result.status, headers });
}
