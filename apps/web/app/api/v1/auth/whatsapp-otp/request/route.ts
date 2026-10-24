import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requestOtp } from '@/lib/whatsapp-otp';
import { withIdempotency } from '@/lib/idempotency';

const requestSchema = z.object({
  phone: z.string().min(8).max(20),
});

export async function POST(request: Request) {
  return withIdempotency(request, { scope: 'auth.whatsapp-otp.request', audit: false }, async () => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
    }

    const result = await requestOtp(parsed.data.phone);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 429 });
    }
    return NextResponse.json({ ok: true, message: 'OTP sent if number is registered' });
  });
}