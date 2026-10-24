// Reconciliation service: repair bookings where the provider call succeeded
// but the local DB transaction failed (or vice versa).
//
// These are best-effort recovery helpers. They never auto-apply destructive
// changes; they report the discrepancy and let an admin decide.

import { and, eq, isNull } from 'drizzle-orm';
import {
  bookingItems,
  bookings,
  db,
  paymentIntents,
  payments,
} from '@arrivesuite/db';
import { getFlightCancellationQuote } from '@arrivesuite/integrations';
import { canTransition, type BookingStatus } from './booking-state';
import { snapshotOf } from './ticketing-helpers';

export interface ReconciliationReport {
  bookingRef: string;
  bookingStatus: string;
  items: Array<{
    itemId: string;
    itemType: string;
    localStatus: string;
    confirmationRef: string | null;
    providerReachable: boolean;
    providerState?: string;
    discrepancy: boolean;
    suggestedAction: string;
  }>;
  paymentState: {
    capturedPayments: number;
    totalCapturedCents: number;
    totalRefundedCents: number;
  };
  issues: string[];
}

export async function reconcileBooking(ref: string): Promise<ReconciliationReport | null> {
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.ref, ref.trim()))
    .limit(1);
  if (!booking) return null;

  const items = await db
    .select()
    .from(bookingItems)
    .where(eq(bookingItems.bookingId, booking.id));

  const captured = await db
    .select({ payment: payments })
    .from(payments)
    .innerJoin(paymentIntents, eq(payments.intentId, paymentIntents.id))
    .where(and(eq(paymentIntents.bookingId, booking.id), eq(payments.status, 'captured')));

  const issues: string[] = [];

  const itemReports = await Promise.all(
    items.map(async (item) => {
      let providerReachable = false;
      let providerState: string | undefined;
      let discrepancy = false;
      let suggestedAction = 'none';

      if (item.itemType === 'flight' && item.confirmationRef) {
        try {
          const quote = await getFlightCancellationQuote(item.confirmationRef);
          providerReachable = true;
          providerState = quote.cancellable ? 'cancellable' : 'not-cancellable';
          // If local says cancelled but provider says cancellable → discrepancy
          if (item.status === 'cancelled' && quote.cancellable) {
            discrepancy = true;
            suggestedAction = 'local-cancelled-but-provider-still-active: verify provider cancellation';
          }
          // If local says confirmed/ticketed but no provider order → discrepancy
          if (
            (item.status === 'confirmed' || item.status === 'reserved') &&
            !item.confirmationRef
          ) {
            discrepancy = true;
            suggestedAction = 'local-confirmed-but-no-provider-order: may need re-ticketing';
          }
        } catch {
          providerReachable = false;
          suggestedAction = 'provider-unreachable: retry later';
        }
      } else if (item.itemType === 'flight' && !item.confirmationRef) {
        // No provider order yet — check if booking is in ticketing state
        if (booking.status === 'ticketing') {
          suggestedAction = 'no-provider-order-yet: ticketing may be in progress or failed';
          discrepancy = true;
        }
      }

      // Check for stuck ticketing state
      if (booking.status === 'ticketing') {
        const hasConfirmation = items.some((i) => i.confirmationRef);
        if (!hasConfirmation) {
          issues.push('Booking stuck in ticketing state with no provider orders');
          suggestedAction = 'retry-ticketing';
        }
      }

      return {
        itemId: item.id,
        itemType: item.itemType,
        localStatus: item.status,
        confirmationRef: item.confirmationRef,
        providerReachable,
        providerState,
        discrepancy,
        suggestedAction,
      };
    }),
  );

  // Check payment vs booking state consistency
  const totalCaptured = captured.reduce((s, r) => s + r.payment.amountCents, 0);
  if (booking.status === 'pending_payment' && captured.length > 0) {
    issues.push('Payment captured but booking still pending_payment');
  }
  if (booking.status === 'ticketed' && captured.length === 0) {
    issues.push('Booking ticketed but no captured payment found');
  }

  return {
    bookingRef: booking.ref,
    bookingStatus: booking.status,
    items: itemReports,
    paymentState: {
      capturedPayments: captured.length,
      totalCapturedCents: totalCaptured,
      totalRefundedCents: booking.refundedCents,
    },
    issues,
  };
}