import { normalizePhone, sendTemplateMessage } from '@arrivesuite/integrations';
import { auditEvents, db } from '@arrivesuite/db';

// Single WhatsApp confirmation per booking (contract v1.0 §4).
// Best-effort: send failures are logged + audited, never fail the booking.
// Body params must match the approved ars_booking_confirmed template.
export async function sendBookingConfirmation(input: {
  phone: string | null | undefined;
  arsRef: string;
  totalLine: string;
  traceId: string;
  bookingId: string;
}): Promise<void> {
  if (!input.phone) return;
  const to = normalizePhone(input.phone);
  if (to.length < 8) return;
  try {
    const { messageId } = await sendTemplateMessage({
      to,
      template: process.env.WHATSAPP_TEMPLATE ?? 'ars_booking_confirmed',
      bodyParams: [input.arsRef, input.totalLine],
    });
    await db.insert(auditEvents).values({
      action: 'notification.whatsapp_sent',
      entityType: 'booking',
      entityId: input.bookingId,
      diff: { to, template: process.env.WHATSAPP_TEMPLATE ?? 'ars_booking_confirmed', messageId },
      traceId: input.traceId,
    });
  } catch (err) {
    console.error('[notifications] WhatsApp send failed', err);
    await db.insert(auditEvents).values({
      action: 'notification.whatsapp_failed',
      entityType: 'booking',
      entityId: input.bookingId,
      diff: { to, error: (err as Error)?.message ?? 'unknown' },
      traceId: input.traceId,
    });
  }
}
