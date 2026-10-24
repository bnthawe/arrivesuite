import { NextResponse } from 'next/server';
import { requireSupplier } from '@/lib/supplier';
import { db, contracts } from '@arrivesuite/db';
import { eq } from 'drizzle-orm';

export async function GET(request: Request) {
  const gate = await requireSupplier(request);
  if ('response' in gate) return gate.response;

  const supplierContracts = await db
    .select()
    .from(contracts)
    .where(eq(contracts.supplierId, gate.supplier.id));

  return NextResponse.json({ contracts: supplierContracts });
}

export async function POST(request: Request) {
  const gate = await requireSupplier(request);
  if ('response' in gate) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { title } = body as { title?: string };
  if (!title) {
    return NextResponse.json({ error: 'Title required' }, { status: 400 });
  }

  const [contract] = await db
    .insert(contracts)
    .values({
      supplierId: gate.supplier.id,
      title,
      status: 'draft',
    })
    .returning();

  return NextResponse.json({ contract });
}
