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

// Ticketing confirmation is separate from the booking-created message: it is
// sent only after the airline order exists and carries the PNR. If the
// ticketing template is not approved yet, fall back to the approved booking
// confirmation template so the traveller still gets a WhatsApp message.
export async function sendBookingTicketing(input: {
  phone: string | null | undefined;
  arsRef: string;
  pnr: string;
  totalLine: string;
  traceId: string;
  bookingId: string;
}): Promise<void> {
  if (!input.phone) return;
  const to = normalizePhone(input.phone);
  if (to.length < 8) return;
  const template = process.env.WHATSAPP_TICKETING_TEMPLATE ?? 'ars_booking_ticketing';
  let messageId = '';
  try {
    ({ messageId } = await sendTemplateMessage({
      to,
      template,
      bodyParams: [input.arsRef, input.pnr || 'Pending'],
    }));
  } catch (err) {
    console.error('[notifications] ticketing WhatsApp send failed, trying fallback', err);
    const fallbackTemplate = process.env.WHATSAPP_TEMPLATE ?? 'ars_booking_confirmed';
    let fallbackMessageId = '';
    try {
      ({ messageId: fallbackMessageId } = await sendTemplateMessage({
        to,
        template: fallbackTemplate,
        bodyParams: [input.arsRef, input.totalLine],
      }));
    } catch (fallbackErr) {
      await db.insert(auditEvents).values({
        action: 'notification.whatsapp_failed',
        entityType: 'booking',
        entityId: input.bookingId,
        diff: {
          to,
          template,
          fallbackTemplate,
          error: (err as Error)?.message ?? 'unknown',
          fallbackError: (fallbackErr as Error)?.message ?? 'unknown',
        },
        traceId: input.traceId,
      });
      return;
    }
    // Audit separately: a successful send must never be retried as a fallback
    // just because the audit insert failed.
    try {
      await db.insert(auditEvents).values({
        action: 'notification.whatsapp_sent',
        entityType: 'booking',
        entityId: input.bookingId,
        diff: { to, template: fallbackTemplate, fallbackFor: template, messageId: fallbackMessageId },
        traceId: input.traceId,
      });
    } catch (auditErr) {
      console.error('[notifications] failed to audit fallback WhatsApp send', auditErr);
    }
    return;
  }

  try {
    await db.insert(auditEvents).values({
      action: 'notification.whatsapp_sent',
      entityType: 'booking',
      entityId: input.bookingId,
      diff: { to, template, messageId },
      traceId: input.traceId,
    });
  } catch (auditErr) {
    console.error('[notifications] failed to audit WhatsApp send', auditErr);
  }
}
