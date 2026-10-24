import { NextResponse } from 'next/server';
import { requireSupplier } from '@/lib/supplier';
import { db, contracts, auditEvents } from '@arrivesuite/db';
import { eq } from 'drizzle-orm';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireSupplier(request);
  if ('response' in gate) return gate.response;

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { signerName, signatureData } = body as { signerName?: string; signatureData?: string };
  if (!signerName || !signatureData) {
    return NextResponse.json({ error: 'Signer name and signature required' }, { status: 400 });
  }

  const [contract] = await db
    .select()
    .from(contracts)
    .where(eq(contracts.id, id))
    .limit(1);

  if (!contract) {
    return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
  }

  if (contract.supplierId !== gate.supplier.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (contract.status === 'signed') {
    return NextResponse.json({ error: 'Contract already signed' }, { status: 409 });
  }

  const [updated] = await db
    .update(contracts)
    .set({
      status: 'signed',
      signerName,
      signatureData,
      signedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(contracts.id, id))
    .returning();

  await db.insert(auditEvents).values({
    actorId: gate.account.id,
    actorRealm: gate.account.realm,
    action: 'contract.signed',
    entityType: 'contract',
    entityId: contract.id,
    diff: { supplierId: gate.supplier.id },
    traceId: crypto.randomUUID(),
  });

  return NextResponse.json({ contract: updated });
}
