import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { traceIdFromRequest } from '@/lib/bookings-core';
import { redactBookingPii } from '@/lib/pii-redaction';
import { withIdempotency } from '@/lib/idempotency';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ ref: string }> },
) {
  const { ref } = await params;
  return withIdempotency(
    request,
    { scope: 'admin.bookings.redact-pii', identity: ref, audit: false },
    async () => {
      const gate = await requireAdmin(request);
      if ('response' in gate) return gate.response;

      const traceId = traceIdFromRequest(request);
      const result = await redactBookingPii(ref, gate.account.id);
      if (!result) {
        return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
      }
      return NextResponse.json({ result, traceId });
    },
  );
}