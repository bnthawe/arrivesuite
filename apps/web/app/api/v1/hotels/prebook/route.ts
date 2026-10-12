import { NextResponse } from 'next/server';
import { prebookRequestSchema } from '@arrivesuite/types';
import { prebookRate } from '@arrivesuite/integrations';
import { getCachedOffer, savePrebookHold } from '@/lib/prebooks';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = prebookRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // The hold locks a searched offer; unknown/expired offers are rejected
  // rather than re-priced (contract §2: offer validity required).
  const cached = await getCachedOffer(parsed.data.offerId);
  if (!cached || cached.kind !== 'hotel') {
    return NextResponse.json({ error: 'Offer unknown or expired — search again' }, { status: 404 });
  }

  const held = await prebookRate(parsed.data);
  await savePrebookHold({
    prebookId: held.prebookId,
    transactionId: held.transactionId,
    offerId: parsed.data.offerId,
    expiresAt: held.expiresAt,
  });
  return NextResponse.json(held);
}
