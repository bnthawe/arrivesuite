// WhatsApp inbound message routing for suppliers.
// Handles CONFIRM/DECLINE commands for bookings.

import { and, eq } from 'drizzle-orm';
import { accounts, bookingItems, bookings, db, suppliers, auditEvents } from '@arrivesuite/db';
import { normalizePhone, sendTextMessage } from '@arrivesuite/integrations';
import { canTransition } from '@/lib/booking-state';

export interface InboundMessage {
  from: string; // wa_id
  text: string;
  messageId?: string;
}

export interface RoutingResult {
  handled: boolean;
  response?: string;
}

function parseCommand(text: string): { cmd: 'confirm' | 'decline' | null; ref?: string; reason?: string } {
  const trimmed = text.trim();
  const upper = trimmed.toUpperCase();
  
  // CONFIRM ARS-2026-000123
  if (upper.startsWith('CONFIRM')) {
    const match = trimmed.match(/CONFIRM\s+(ARS-\d{4}-\d+)\b/i);
    if (match) return { cmd: 'confirm', ref: match[1].toUpperCase() };
    return { cmd: null };
  }
  
  // DECLINE ARS-2026-000123 reason
  if (upper.startsWith('DECLINE')) {
    const match = trimmed.match(/DECLINE\s+(ARS-\d{4}-\d+)\s+(.+)$/i);
    if (match) return { cmd: 'decline', ref: match[1].toUpperCase(), reason: match[2].trim() };
    const matchNoReason = trimmed.match(/DECLINE\s+(ARS-\d{4}-\d+)\b/i);
    if (matchNoReason) return { cmd: 'decline', ref: matchNoReason[1].toUpperCase(), reason: 'Declined by supplier' };
    return { cmd: null };
  }
  
  return { cmd: null };
}

export async function routeInboundMessage(msg: InboundMessage): Promise<RoutingResult> {
  const normalized = normalizePhone(msg.from).replace(/^\+/, '');
  
  // Look up account by phone number
  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.phoneE164, `+${normalized}`))
    .limit(1);
  
  if (!account) {
    // Also try without + prefix
    const [account2] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.phoneE164, normalized))
      .limit(1);
    
    if (!account2) {
      return { handled: false };
    }
    
    if (account2.realm === 'supplier') {
      return handleSupplierMessage(account2, msg);
    }
    return { handled: false };
  }
  
  if (account.realm === 'supplier') {
    return handleSupplierMessage(account, msg);
  }
  
  return { handled: false };
}

async function handleSupplierMessage(account: typeof accounts.$inferSelect, msg: InboundMessage): Promise<RoutingResult> {
  const [supplier] = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.accountId, account.id))
    .limit(1);
  
  if (!supplier) {
    return { handled: true, response: 'No supplier profile found for your account.' };
  }
  
  const parsed = parseCommand(msg.text);
  
  if (!parsed.cmd) {
    return { handled: true, response: 'Unknown command. Use CONFIRM <REF> or DECLINE <REF> <reason>.' };
  }
  
  if (!parsed.ref) {
    return { handled: true, response: 'Please include a booking reference (e.g., ARS-2026-000123).' };
  }
  
  // Look up booking
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.ref, parsed.ref))
    .limit(1);
  
  if (!booking) {
    return { handled: true, response: `Booking ${parsed.ref} not found.` };
  }
  
  // Verify supplier owns this booking (via booking_items)
  const items = await db
    .select()
    .from(bookingItems)
    .where(eq(bookingItems.bookingId, booking.id));
  
  const ownsBooking = items.some((item) => item.supplierId === supplier.id);
  
  if (!ownsBooking) {
    return { handled: true, response: `You do not have permission to manage booking ${parsed.ref}.` };
  }
  
  if (parsed.cmd === 'confirm') {
    return handleConfirmBooking(booking, supplier, account, msg);
  }
  
  if (parsed.cmd === 'decline') {
    return handleDeclineBooking(booking, supplier, account, msg, parsed.reason || 'Declined by supplier');
  }
  
  return { handled: false };
}

async function handleConfirmBooking(
  booking: typeof bookings.$inferSelect,
  supplier: typeof suppliers.$inferSelect,
  account: typeof accounts.$inferSelect,
  msg: InboundMessage,
): Promise<RoutingResult> {
  if (booking.status !== 'confirmed') {
    return { handled: true, response: `Booking ${booking.ref} cannot be confirmed (status: ${booking.status}).` };
  }
  
  if (!canTransition(booking.status, 'ticketing')) {
    return { handled: true, response: `Booking ${booking.ref} cannot transition from ${booking.status}.` };
  }
  
  await db.update(bookings).set({ status: 'ticketing', updatedAt: new Date() }).where(eq(bookings.id, booking.id));
  
  await db.insert(auditEvents).values({
    actorId: account.id,
    actorRealm: account.realm,
    action: 'booking.supplier_confirmed_via_whatsapp',
    entityType: 'booking',
    entityId: booking.id,
    diff: { from: booking.status, to: 'ticketing', supplierId: supplier.id },
    traceId: booking.traceId,
  });
  
  const response = `Booking ${booking.ref} confirmed. Ticketing in progress.`;
  
  try {
    const to = normalizePhone(msg.from);
    await sendTextMessage(to, response);
  } catch (err) {
    console.error('[whatsapp-routing] failed to send reply', err);
  }
  
  return { handled: true, response };
}

async function handleDeclineBooking(
  booking: typeof bookings.$inferSelect,
  supplier: typeof suppliers.$inferSelect,
  account: typeof accounts.$inferSelect,
  msg: InboundMessage,
  reason: string,
): Promise<RoutingResult> {
  if (!canTransition(booking.status, 'cancelled')) {
    return { handled: true, response: `Booking ${booking.ref} cannot be declined (status: ${booking.status}).` };
  }
  
  await db.update(bookings).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(bookings.id, booking.id));
  
  await db.insert(auditEvents).values({
    actorId: account.id,
    actorRealm: account.realm,
    action: 'booking.supplier_declined_via_whatsapp',
    entityType: 'booking',
    entityId: booking.id,
    diff: { from: booking.status, to: 'cancelled', supplierId: supplier.id, reason },
    traceId: booking.traceId,
  });
  
  const response = `Booking ${booking.ref} declined. Reason: ${reason}. Guest will be notified.`;
  
  try {
    const to = normalizePhone(msg.from);
    await sendTextMessage(to, response);
  } catch (err) {
    console.error('[whatsapp-routing] failed to send reply', err);
  }
  
  return { handled: true, response };
}
