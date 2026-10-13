import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db, suppliers } from '@arrivesuite/db';
import { requireAdmin } from '@/lib/admin';

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;
  const status = new URL(request.url).searchParams.get('status');
  const rows = status
    ? await db.select().from(suppliers).where(eq(suppliers.status, status)).orderBy(desc(suppliers.createdAt))
    : await db.select().from(suppliers).orderBy(desc(suppliers.createdAt)).limit(100);
  return NextResponse.json({ suppliers: rows });
}
