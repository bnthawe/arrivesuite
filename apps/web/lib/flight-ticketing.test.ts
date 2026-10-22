import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('./queues', () => ({
  enqueueReconciliation: vi.fn(async () => {}),
}));

vi.mock('./notifications', () => ({
  sendBookingTicketing: vi.fn(async () => {}),
  sendBookingConfirmation: vi.fn(async () => {}),
}));

vi.mock('./vouchers', () => ({
  voucherPathFor: (ref: string) => `/cdn/tickets/${ref}.pdf`,
  generateVoucherPdf: vi.fn(async (data: { ref: string }) => `/cdn/tickets/${data.ref}.pdf`),
}));

vi.mock('@arrivesuite/integrations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arrivesuite/integrations')>();
  return {
    ...actual,
    createFlightOrder: vi.fn(async (req: { offerId: string }) => ({
      orderId: `ord_${req.offerId}`,
      pnr: 'ABC123',
      ticket: 'H-77421',
      pdf: '/cdn/tickets/H-77421.pdf',
    })),
  };
});

type DbModule = typeof import('@arrivesuite/db');
type BookingModule = typeof import('./bookings-core');
type CaptureModule = typeof import('./payments-capture');
type TicketingModule = typeof import('./ticketing');
type CancellationModule = typeof import('./cancellation');
type DrizzleModule = typeof import('drizzle-orm');
type IntegrationsModule = typeof import('@arrivesuite/integrations');
type NotificationsModule = typeof import('./notifications');

const testDatabase = process.env.TEST_DATABASE_URL;
const suite = testDatabase ? describe : describe.skip;

suite('payment-first flight ticketing', () => {
  let dbm: DbModule;
  let bookingm: BookingModule;
  let capturem: CaptureModule;
  let ticketingm: TicketingModule;
  let cancellationm: CancellationModule;
  let dz: DrizzleModule;
  let integrationsm: IntegrationsModule;
  let notificationsm: NotificationsModule;

  const bookingIds: string[] = [];
  const bookingRefs: string[] = [];
  const intentIds: string[] = [];
  const snapshotIds: string[] = [];
  const traces: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabase;
    process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1';
    dbm = await import('@arrivesuite/db');
    bookingm = await import('./bookings-core');
    capturem = await import('./payments-capture');
    ticketingm = await import('./ticketing');
    cancellationm = await import('./cancellation');
    dz = await import('drizzle-orm');
    integrationsm = await import('@arrivesuite/integrations');
    notificationsm = await import('./notifications');
  });

  afterAll(async () => {
    if (!dbm) return;
    try {
      if (traces.length > 0) {
        await dbm.db.delete(dbm.auditEvents).where(dz.inArray(dbm.auditEvents.traceId, traces));
      }
      if (intentIds.length > 0) {
        const paymentRows = await dbm.db
          .select({ id: dbm.payments.id })
          .from(dbm.payments)
          .where(dz.inArray(dbm.payments.intentId, intentIds));
        if (paymentRows.length > 0) {
          await dbm.db
            .delete(dbm.refunds)
            .where(dz.inArray(dbm.refunds.paymentId, paymentRows.map((row) => row.id)));
        }
        await dbm.db.delete(dbm.payments).where(dz.inArray(dbm.payments.intentId, intentIds));
        await dbm.db.delete(dbm.paymentIntents).where(dz.inArray(dbm.paymentIntents.id, intentIds));
      }
      if (bookingRefs.length > 0) {
        await dbm.db
          .delete(dbm.alertStates)
          .where(dz.inArray(dbm.alertStates.reference, bookingRefs));
      }
      if (bookingIds.length > 0) {
        await dbm.db.delete(dbm.bookingItems).where(dz.inArray(dbm.bookingItems.bookingId, bookingIds));
        await dbm.db
          .delete(dbm.bookingGuests)
          .where(dz.inArray(dbm.bookingGuests.bookingId, bookingIds));
        await dbm.db.delete(dbm.bookings).where(dz.inArray(dbm.bookings.id, bookingIds));
      }
      if (snapshotIds.length > 0) {
        await dbm.db
          .delete(dbm.pricingSnapshots)
          .where(dz.inArray(dbm.pricingSnapshots.id, snapshotIds));
      }
      const redism = await import('./redis');
      await redism.getRedis().quit();
    } finally {
      await dbm.client.end({ timeout: 5 });
    }
  });

  async function createPaidBooking(
    traceId: string,
    options: { refundable?: boolean } = {},
  ) {
    const [account] = await dbm.db
      .select()
      .from(dbm.accounts)
      .where(dz.eq(dbm.accounts.email, 'customer@arrivesuite.com'))
      .limit(1);
    if (!account) throw new Error('Seed account customer@arrivesuite.com is missing');

    const created = await bookingm.createBooking({
      accountId: account.id,
      channel: 'web',
      currency: 'BWP',
      idempotencyKey: randomUUID(),
      traceId,
      items: [
        {
          itemType: 'flight',
          itemRef: 'off_test',
          itemSupplierType: 'sourced',
          netCents: 542_000,
          markupCents: 54_200,
          adults: 1,
          children: 1,
          startDate: new Date('2026-12-10T00:00:00.000Z'),
          snapshot: {
            fulfillment: 'post_payment',
            flightOffer: {
              offerId: 'off_test',
              origin: 'GBE',
              destination: 'MUB',
              airline: 'Air Botswana',
              flight: 'BP201',
              departureDate: '2026-12-10',
              refundable: options.refundable ?? false,
            },
          },
        },
      ],
      guests: [
        {
          guestType: 'ADT',
          firstName: 'Neo',
          lastName: 'Molefe',
          dateOfBirth: '1990-04-12',
          passportNumber: 'BW123456',
          nationality: 'BW',
          email: 'neo@example.com',
          phoneE164: '+26771234567',
          isLead: true,
        },
        {
          guestType: 'CHD',
          firstName: 'Lesedi',
          lastName: 'Molefe',
          dateOfBirth: '2016-08-01',
          nationality: 'BW',
        },
      ],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error(created.error);
    const booking = created.created.booking;
    bookingIds.push(booking.id);
    bookingRefs.push(booking.ref.trim());
    if (booking.pricingSnapshotId) snapshotIds.push(booking.pricingSnapshotId);

    const [intent] = await dbm.db
      .insert(dbm.paymentIntents)
      .values({
        bookingId: booking.id,
        amountCents: booking.totalCents,
        currency: booking.currency,
        method: 'dpo',
        providerRef: `DPO-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 3_600_000),
      })
      .returning();
    intentIds.push(intent.id);

    const captured = await capturem.capturePaymentByProviderRef({
      providerRef: intent.providerRef!,
      amountCents: booking.totalCents,
      currency: booking.currency,
      providerPaymentId: 'APPROVAL-1',
      traceId,
    });
    expect(captured).toMatchObject({ ok: true, replayed: false });
    return booking;
  }

  it('captures, creates the provider order, tickets, and replays idempotently', async () => {
    const traceId = randomUUID();
    traces.push(traceId);
    const booking = await createPaidBooking(traceId);

    const fulfilled = await ticketingm.fulfillPaidBooking(booking.id, traceId);
    expect(fulfilled).toEqual({ ok: true, status: 'ticketed' });

    const [ticketed] = await dbm.db
      .select()
      .from(dbm.bookings)
      .where(dz.eq(dbm.bookings.id, booking.id))
      .limit(1);
    expect(ticketed?.status).toBe('ticketed');

    const [item] = await dbm.db
      .select()
      .from(dbm.bookingItems)
      .where(dz.eq(dbm.bookingItems.bookingId, booking.id))
      .limit(1);
    expect(item?.status).toBe('confirmed');
    expect(item?.confirmationRef).toBe('ord_off_test');
    expect(item?.snapshot).toMatchObject({ pnr: 'ABC123', ticket: 'H-77421' });

    const guests = await dbm.db
      .select()
      .from(dbm.bookingGuests)
      .where(dz.eq(dbm.bookingGuests.bookingId, booking.id));
    expect(guests).toHaveLength(2);

    expect(integrationsm.createFlightOrder).toHaveBeenCalledTimes(1);
    expect(integrationsm.createFlightOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        offerId: 'off_test',
        paymentToken: 'APPROVAL-1',
        passengers: expect.arrayContaining([
          expect.objectContaining({ type: 'ADT', firstName: 'Neo', lastName: 'Molefe' }),
          expect.objectContaining({ type: 'CHD', firstName: 'Lesedi', lastName: 'Molefe' }),
        ]),
      }),
    );

    const audits = await dbm.db
      .select()
      .from(dbm.auditEvents)
      .where(dz.eq(dbm.auditEvents.traceId, traceId));
    expect(audits.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        'booking.transition',
        'booking_item.ticketed',
        'booking.voucher_generated',
      ]),
    );
    expect(notificationsm.sendBookingTicketing).toHaveBeenCalledWith(
      expect.objectContaining({ arsRef: booking.ref.trim(), pnr: 'ABC123' }),
    );

    const replay = await ticketingm.fulfillPaidBooking(booking.id, traceId);
    expect(replay).toEqual({ ok: true, status: 'ticketed' });
    expect(integrationsm.createFlightOrder).toHaveBeenCalledTimes(1);
  });

  it('retries a failed ticketing attempt from the admin path', async () => {
    const traceId = randomUUID();
    traces.push(traceId);
    const booking = await createPaidBooking(traceId);

    vi.mocked(integrationsm.createFlightOrder).mockRejectedValueOnce(
      new Error('provider down'),
    );
    const failed = await ticketingm.fulfillPaidBooking(booking.id, traceId);
    expect(failed).toEqual({ ok: false, error: 'provider down' });

    const [failedBooking] = await dbm.db
      .select()
      .from(dbm.bookings)
      .where(dz.eq(dbm.bookings.id, booking.id))
      .limit(1);
    expect(failedBooking?.status).toBe('failed');

    const [alert] = await dbm.db
      .select()
      .from(dbm.alertStates)
      .where(
        dz.and(
          dz.eq(dbm.alertStates.kind, 'ticketing_failed'),
          dz.eq(dbm.alertStates.reference, booking.ref.trim()),
          dz.isNull(dbm.alertStates.resolvedAt),
        ),
      )
      .limit(1);
    expect(alert).toMatchObject({ kind: 'ticketing_failed', severity: 'P1' });

    const retried = await ticketingm.fulfillPaidBooking(booking.id, traceId, {
      retryFailed: true,
    });
    expect(retried).toEqual({ ok: true, status: 'ticketed' });

    const [ticketed] = await dbm.db
      .select()
      .from(dbm.bookings)
      .where(dz.eq(dbm.bookings.id, booking.id))
      .limit(1);
    expect(ticketed?.status).toBe('ticketed');

    const [item] = await dbm.db
      .select()
      .from(dbm.bookingItems)
      .where(dz.eq(dbm.bookingItems.bookingId, booking.id))
      .limit(1);
    expect(item?.status).toBe('confirmed');
    expect(item?.confirmationRef).toBe('ord_off_test');

    const audits = await dbm.db
      .select()
      .from(dbm.auditEvents)
      .where(dz.eq(dbm.auditEvents.traceId, traceId));
    expect(audits.map((row) => row.action)).toEqual(
      expect.arrayContaining(['booking.ticketing_failed', 'booking.transition']),
    );
  });

  it('cancels a refundable ticketed flight and requests a refund', async () => {
    const traceId = randomUUID();
    traces.push(traceId);
    const booking = await createPaidBooking(traceId, { refundable: true });
    const fulfilled = await ticketingm.fulfillPaidBooking(booking.id, traceId);
    expect(fulfilled).toEqual({ ok: true, status: 'ticketed' });

    const [admin] = await dbm.db
      .select()
      .from(dbm.accounts)
      .where(dz.eq(dbm.accounts.email, 'admin@arrivesuite.com'))
      .limit(1);

    const result = await cancellationm.cancelBooking({
      ref: booking.ref.trim(),
      traceId,
      actorId: admin?.id,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result).toMatchObject({
      alreadyCancelled: false,
      refundAmountCents: booking.totalCents,
    });
    expect(result.refund?.state).toBe('pending');
    expect(result.providerCancellation).toMatchObject({
      bookingStatus: 'CANCELLED',
    });

    const [cancelled] = await dbm.db
      .select()
      .from(dbm.bookings)
      .where(dz.eq(dbm.bookings.id, booking.id))
      .limit(1);
    expect(cancelled?.status).toBe('cancelled');
    expect(cancelled?.cancelledAt).toBeTruthy();

    const [item] = await dbm.db
      .select()
      .from(dbm.bookingItems)
      .where(dz.eq(dbm.bookingItems.bookingId, booking.id))
      .limit(1);
    expect(item?.status).toBe('cancelled');
    expect(item?.snapshot).toMatchObject({
      cancellation: {
        reasonCode: 'CR01',
        refundAmountCents: booking.totalCents,
        fareRefundable: true,
      },
    });

    expect(result.refund).toMatchObject({
      amountCents: booking.totalCents,
      reason: `Flight cancellation ${booking.ref.trim()}`,
    });

    const audits = await dbm.db
      .select()
      .from(dbm.auditEvents)
      .where(dz.eq(dbm.auditEvents.traceId, traceId));
    expect(audits.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        'booking.cancelled',
        'booking.transition',
        'refund.requested',
      ]),
    );

    const replay = await cancellationm.cancelBooking({
      ref: booking.ref.trim(),
      traceId,
      actorId: admin?.id,
    });
    expect(replay.ok).toBe(true);
    if (replay.ok) expect(replay.alreadyCancelled).toBe(true);
  }, 15_000);

  it('cancels a non-refundable flight without creating a refund', async () => {
    const traceId = randomUUID();
    traces.push(traceId);
    const booking = await createPaidBooking(traceId);
    const fulfilled = await ticketingm.fulfillPaidBooking(booking.id, traceId);
    expect(fulfilled).toEqual({ ok: true, status: 'ticketed' });

    const [admin] = await dbm.db
      .select()
      .from(dbm.accounts)
      .where(dz.eq(dbm.accounts.email, 'admin@arrivesuite.com'))
      .limit(1);

    const result = await cancellationm.cancelBooking({
      ref: booking.ref.trim(),
      traceId,
      actorId: admin?.id,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result).toMatchObject({
      alreadyCancelled: false,
      refundAmountCents: 0,
      refund: null,
    });

    const [cancelled] = await dbm.db
      .select()
      .from(dbm.bookings)
      .where(dz.eq(dbm.bookings.id, booking.id))
      .limit(1);
    expect(cancelled?.status).toBe('cancelled');

    const [payment] = await dbm.db
      .select({ id: dbm.payments.id })
      .from(dbm.payments)
      .innerJoin(dbm.paymentIntents, dz.eq(dbm.payments.intentId, dbm.paymentIntents.id))
      .where(dz.eq(dbm.paymentIntents.bookingId, booking.id))
      .limit(1);
    expect(payment).toBeTruthy();
    const refundRows = await dbm.db
      .select()
      .from(dbm.refunds)
      .where(dz.eq(dbm.refunds.paymentId, payment!.id));
    expect(refundRows).toHaveLength(0);
  }, 15_000);
});
