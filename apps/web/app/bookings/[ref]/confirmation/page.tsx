import type { Metadata } from 'next';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { bookingGuests, bookingItems, bookings, db } from '@arrivesuite/db';
import type { FlightOffer } from '@arrivesuite/types';
import { verifyBookingAccess } from '@/lib/booking-access';
import { voucherPathFor } from '@/lib/vouchers';

export const metadata: Metadata = {
  title: 'Booking confirmation — ArriveSuite',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

interface FlightSnapshot {
  flightOffer?: FlightOffer;
  pnr?: string;
  ticket?: string;
  providerOrderId?: string;
}

function snapshotOf(value: unknown): FlightSnapshot {
  return value && typeof value === 'object' ? (value as FlightSnapshot) : {};
}

function money(currency: string, cents: number): string {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

function statusView(status: string): { label: string; tone: string; detail: string } {
  switch (status) {
    case 'ticketed':
      return {
        label: 'Ticketed',
        tone: 'border-[#b7e4c7] bg-[#e7f9ed] text-[#0a7a2a]',
        detail: 'Your airline ticket has been issued. Your PNR and voucher are below.',
      };
    case 'ticketing':
      return {
        label: 'Issuing your ticket',
        tone: 'border-[#f5d58a] bg-[#fff8e1] text-[#8a5a00]',
        detail: 'Payment received. We are issuing your airline ticket now — this usually takes a moment.',
      };
    case 'confirmed':
      return {
        label: 'Payment received',
        tone: 'border-[#b9d7ee] bg-[#eef6fd] text-[#005799]',
        detail: 'Payment received. We are preparing your ticket. Refresh this page shortly.',
      };
    case 'failed':
      return {
        label: 'Needs attention',
        tone: 'border-[#f3b4b4] bg-[#fdecec] text-[#a61b1b]',
        detail:
          'We received your payment, but the airline order needs attention. Our team has been alerted. Contact support with your reference before travelling.',
      };
    case 'pending_payment':
      return {
        label: 'Payment not completed',
        tone: 'border-[#e3e3e3] bg-[#f7f7f7] text-[#444]',
        detail: 'This booking is not paid yet. Start a new search to try again.',
      };
    case 'refunded':
      return {
        label: 'Refunded',
        tone: 'border-[#d7c7f0] bg-[#f4effd] text-[#5b3a99]',
        detail: 'This booking has been refunded. Your bank may take a few days to post it.',
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        tone: 'border-[#e3e3e3] bg-[#f7f7f7] text-[#444]',
        detail: 'This booking was cancelled.',
      };
    default:
      return {
        label: status.replaceAll('_', ' '),
        tone: 'border-[#e3e3e3] bg-[#f7f7f7] text-[#444]',
        detail: 'Contact support if you need help with this booking.',
      };
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f5f5f5]">
      <div className="container mx-auto max-w-3xl px-4 py-10">{children}</div>
    </main>
  );
}

export default async function ConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<{ token?: string; payment?: string }>;
}) {
  const { ref: rawRef } = await params;
  const query = await searchParams;
  // Next already decodes dynamic route params. Decoding again can throw on a
  // literal percent or double-decode a crafted reference.
  const ref = rawRef.trim();

  if (!verifyBookingAccess(ref, query.token)) {
    return (
      <Shell>
        <div className="rounded-[16px] border border-[#e3e3e3] bg-white p-6">
          <h1 className="text-xl font-bold">This confirmation link has expired</h1>
          <p className="mt-2 text-sm leading-6 text-[#666]">
            For your security, confirmation links are time-limited. Contact support with your
            booking reference and we will help you.
          </p>
          {ref && (
            <p className="mt-4 rounded-lg bg-[#f7f7f7] px-4 py-3 font-mono text-sm">{ref}</p>
          )}
          <Link href="/search" className="mt-5 inline-block text-sm font-semibold text-[#0071C2]">
            ← Back to search
          </Link>
        </div>
      </Shell>
    );
  }

  const [booking] = await db.select().from(bookings).where(eq(bookings.ref, ref)).limit(1);
  if (!booking) {
    return (
      <Shell>
        <div className="rounded-[16px] border border-[#e3e3e3] bg-white p-6">
          <h1 className="text-xl font-bold">Booking not found</h1>
          <p className="mt-2 text-sm text-[#666]">
            Check the reference and try again, or contact support.
          </p>
          <Link href="/search" className="mt-5 inline-block text-sm font-semibold text-[#0071C2]">
            ← Back to search
          </Link>
        </div>
      </Shell>
    );
  }

  const items = await db
    .select()
    .from(bookingItems)
    .where(eq(bookingItems.bookingId, booking.id));
  const guests = await db
    .select()
    .from(bookingGuests)
    .where(eq(bookingGuests.bookingId, booking.id));
  const lead = guests.find((guest) => guest.isLead) ?? guests[0];
  const status = statusView(booking.status);
  const voucherUrl = booking.status === 'ticketed' ? voucherPathFor(ref) : null;
  const paymentFailed = query.payment === 'error' && booking.paidCents === 0;
  const paymentPending = query.payment === 'pending' && booking.paidCents === 0;

  return (
    <Shell>
      <div className="mb-5 flex items-center gap-3">
        <Link href="/" className="text-sm text-[#0071C2]">
          ← ArriveSuite
        </Link>
        <span className="ml-auto text-[11px] text-[#888]">Keep this page for your records</span>
      </div>

      <section className="rounded-[16px] border border-[#e3e3e3] bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#666]">
              Booking confirmation
            </p>
            <h1 className="mt-1 font-mono text-2xl font-bold tracking-tight">{ref}</h1>
            {lead && (
              <p className="mt-1 text-sm text-[#555]">
                {lead.firstName} {lead.lastName}
              </p>
            )}
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${status.tone}`}>
            {status.label}
          </span>
        </div>

        <p className="mt-4 text-sm leading-6 text-[#555]">{status.detail}</p>
        {paymentFailed && (
          <p className="mt-3 rounded-lg border border-[#f3b4b4] bg-[#fdecec] px-4 py-3 text-sm text-[#a61b1b]">
            We could not confirm your payment. If you were charged, contact support with this
            reference and do not pay again.
          </p>
        )}
        {paymentPending && (
          <p className="mt-3 rounded-lg border border-[#f5d58a] bg-[#fff8e1] px-4 py-3 text-sm text-[#8a5a00]">
            Payment has not completed yet. If you were charged, wait a moment and refresh this
            page.
          </p>
        )}
      </section>

      <section className="mt-4 rounded-[16px] border border-[#e3e3e3] bg-white p-6">
        <h2 className="text-sm font-bold">Your flight</h2>
        <div className="mt-3 space-y-4">
          {items
            .filter((item) => item.itemType === 'flight')
            .map((item) => {
              const flight = snapshotOf(item.snapshot);
              const offer = flight.flightOffer;
              return (
                <div key={item.id} className="rounded-xl bg-[#f7faff] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#666]">
                        {offer?.airline ?? 'Airline'}
                      </p>
                      <p className="mt-1 text-lg font-bold">
                        {offer?.origin ?? '—'} → {offer?.destination ?? '—'}
                      </p>
                      <p className="mt-1 text-xs text-[#666]">
                        {[offer?.flight, offer?.departureDate, offer?.departureTime]
                          .filter(Boolean)
                          .join(' • ')}
                      </p>
                    </div>
                    <div className="text-right">
                      {flight.pnr ? (
                        <>
                          <p className="text-[11px] uppercase tracking-wide text-[#666]">PNR</p>
                          <p className="font-mono text-lg font-bold">{flight.pnr}</p>
                        </>
                      ) : (
                        <p className="text-xs text-[#777]">PNR pending</p>
                      )}
                      {flight.ticket && (
                        <p className="mt-1 font-mono text-[11px] text-[#777]">
                          Ticket {flight.ticket}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          {items.filter((item) => item.itemType === 'flight').length === 0 && (
            <p className="text-sm text-[#666]">No flight items on this booking.</p>
          )}
        </div>
      </section>

      <section className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-[16px] border border-[#e3e3e3] bg-white p-6">
          <h2 className="text-sm font-bold">Payment</h2>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-[#666]">Booking total</span>
              <span className="font-medium">{money(booking.currency, booking.totalCents)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-[#666]">Paid</span>
              <span className="font-medium">{money(booking.currency, booking.paidCents)}</span>
            </div>
            {booking.refundedCents > 0 && (
              <div className="flex justify-between gap-4">
                <span className="text-[#666]">Refunded</span>
                <span className="font-medium">
                  {money(booking.currency, booking.refundedCents)}
                </span>
              </div>
            )}
          </div>
          <p className="mt-3 text-[11px] leading-4 text-[#888]">
            Payment is processed by DPO Pay. ArriveSuite never stores your card details.
          </p>
        </div>

        <div className="rounded-[16px] border border-[#e3e3e3] bg-white p-6">
          <h2 className="text-sm font-bold">Documents</h2>
          {voucherUrl ? (
            <a
              href={voucherUrl}
              className="mt-3 inline-block rounded-lg bg-[#0071C2] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#005799]"
            >
              Download voucher PDF
            </a>
          ) : (
            <p className="mt-3 text-sm text-[#666]">
              Your voucher appears here once the airline ticket is issued.
            </p>
          )}
          <p className="mt-3 text-[11px] leading-4 text-[#888]">
            The voucher is not a boarding pass. Check in with the airline and carry valid travel
            documents.
          </p>
        </div>
      </section>

      <div className="mt-5 flex flex-wrap items-center gap-4 text-sm">
        <Link href="/search" className="font-semibold text-[#0071C2]">
          Book another trip
        </Link>
        <span className="text-[#aaa]">•</span>
        <span className="text-[#777]">Questions? Quote reference {ref} to support.</span>
      </div>
    </Shell>
  );
}
