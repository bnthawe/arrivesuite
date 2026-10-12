import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guestInfoSchema } from '@arrivesuite/types';
import { bookRate } from '@arrivesuite/integrations';
import { consumePrebookHold, getCachedOffer } from '@/lib/prebooks';
import { createBooking, resolveGuestAccount, traceIdFromRequest } from '@/lib/bookings-core';
import { voucherPathFor } from '@/lib/vouchers';

const bookSchema = z.object({
  prebookId: z.string().min(1),
  guestInfo: guestInfoSchema,
  payment: z.object({ method: z.literal('TRANSACTION_ID'), transactionId: z.string().min(1) }),
  accountId: z.string().uuid().optional(),
  traceId: z.string().max(100).optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = bookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const traceId = traceIdFromRequest(request, input.traceId);

  const hold = await consumePrebookHold(input.prebookId);
  if (!hold) {
    return NextResponse.json({ error: 'Prebook expired or unknown — search and prebook again' }, { status: 410 });
  }
  const cached = await getCachedOffer(hold.offerId);
  if (!cached || cached.kind !== 'hotel') {
    return NextResponse.json({ error: 'Offer expired — search again' }, { status: 410 });
  }
  const offer = cached.offer;

  const provider = await bookRate({
    prebookId: hold.prebookId,
    guestInfo: input.guestInfo,
    payment: input.payment,
  });

  const account = input.accountId
    ? null
    : await resolveGuestAccount(
        input.guestInfo.email,
        `${input.guestInfo.firstName} ${input.guestInfo.lastName}`,
      );

  // Totals come from the held offer snapshot, never the client.
  const result = await createBooking({
    accountId: input.accountId ?? account!.id,
    channel: 'web',
    currency: cached.currency,
    items: [
      {
        itemType: 'hotel',
        itemRef: offer.hotelId,
        itemSupplierType: 'sourced',
        quantity: 1,
        netCents: offer.net,
        markupCents: Math.max(0, offer.retail - offer.net),
      },
    ],
    traceId,
    idempotencyKey: request.headers.get('Idempotency-Key')?.slice(0, 100) ?? `hotel-${hold.prebookId}`,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(
    {
      bookingId: provider.bookingId,
      status: provider.status,
      arsRef: result.created.booking.ref,
      voucher: voucherPathFor(result.created.booking.ref),
    },
    { status: 201 },
  );
}
