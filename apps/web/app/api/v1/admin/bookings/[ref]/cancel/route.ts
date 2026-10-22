import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/admin';
import { traceIdFromRequest } from '@/lib/bookings-core';
import { cancelBooking } from '@/lib/cancellation';
import { withIdempotency } from '@/lib/idempotency';

const cancelSchema = z.object({
  reasonCode: z.string().min(1).max(20).optional(),
  remarks: z.string().max(500).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ ref: string }> },
) {
  const { ref } = await params;
  return withIdempotency(
    request,
    { scope: 'admin.bookings.cancel', identity: ref, audit: false },
    async () => {
      const gate = await requireAdmin(request);
      if ('response' in gate) return gate.response;

      let body: unknown = {};
      const text = await request.text().catch(() => '');
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }
      }
      const parsed = cancelSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Validation failed', issues: parsed.error.issues },
          { status: 400 },
        );
      }

      const traceId = traceIdFromRequest(request);
      const result = await cancelBooking({
        ref,
        reasonCode: parsed.data.reasonCode,
        remarks: parsed.data.remarks,
        traceId,
        actorId: gate.account.id,
      });
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error, ...(result.details ? { details: result.details } : {}) },
          { status: result.status },
        );
      }
      return NextResponse.json(result);
    },
  );
}
