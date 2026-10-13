import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { agencyUsers, db } from '@arrivesuite/db';
import { requireAdmin } from '@/lib/admin';
import { isAgentAccount } from '@/lib/agencies';

const addUserSchema = z.object({
  accountId: z.string().uuid(),
  role: z.string().min(1).max(50).default('member'),
});

// Links an agent-realm account to the agency. Only agent accounts can be
// agency users; admins manage other realms elsewhere.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = addUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  if (!(await isAgentAccount(parsed.data.accountId))) {
    return NextResponse.json({ error: 'Account must be an active agent account' }, { status: 400 });
  }

  const [link] = await db
    .insert(agencyUsers)
    .values({ agencyId: id, accountId: parsed.data.accountId, role: parsed.data.role })
    .onConflictDoNothing()
    .returning();
  return NextResponse.json({ member: link ?? null, replayed: !link }, { status: link ? 201 : 200 });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;
  const { id } = await params;
  const members = await db.select().from(agencyUsers).where(eq(agencyUsers.agencyId, id));
  return NextResponse.json({ members });
}
