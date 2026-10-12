import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createBooking } from '@/lib/bookings-core';

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
});

export async function POST(request: Request) {
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
