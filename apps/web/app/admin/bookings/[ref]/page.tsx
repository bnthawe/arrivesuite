'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

interface Booking {
  id: string;
  ref: string;
  status: string;
  currency: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paidCents: number;
  refundedCents: number;
  channel: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
}

interface Item {
  id: string;
  itemType: string;
  itemRef: string;
  status: string;
  confirmationRef: string | null;
  totalCents: number;
  snapshot: unknown;
}

interface Guest {
  id: string;
  guestType: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  nationality: string | null;
  passportHint: string | null;
  isLead: boolean;
}

interface Intent {
  id: string;
  state: string;
  method: string;
  providerRef: string | null;
  amountCents: number;
  currency: string;
  expiresAt: string;
  createdAt: string;
}

interface Payment {
  id: string;
  status: string;
  providerPaymentId: string | null;
  amountCents: number;
  currency: string;
  capturedAt: string | null;
  createdAt: string;
}

interface Refund {
  id: string;
  state: string;
  amountCents: number;
  reason: string | null;
  createdAt: string;
}

interface Ledger {
  id: string;
  accountName: string | null;
  direction: string;
  amountCents: number;
  currency: string;
  referenceType: string;
  createdAt: string;
}

interface Audit {
  id: string;
  action: string;
  actorRealm: string | null;
  createdAt: string;
  diff: unknown;
}

interface Alert {
  id: string;
  kind: string;
  severity: string;
  firstSeenAt: string;
  lastNotifiedAt: string | null;
  resolvedAt: string | null;
  details: unknown;
}

interface Detail {
  booking: Booking;
  account: { email: string | null; name: string | null };
  items: Item[];
  guests: Guest[];
  intents: Intent[];
  payments: Payment[];
  refunds: Refund[];
  ledger: Ledger[];
  audit: Audit[];
  alerts: Alert[];
}

const btn = 'bg-[#003580] hover:bg-[#005799] text-white font-semibold rounded-lg px-4 py-2 text-sm';
const btnGhost = 'border border-[#003580] text-[#003580] rounded-lg px-3 py-1.5 text-xs font-semibold';

function money(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

function date(value: string | null): string {
  return value ? new Date(value).toLocaleString() : '—';
}

function snapshotValue(snapshot: unknown, key: string): string {
  if (!snapshot || typeof snapshot !== 'object') return '—';
  const value = (snapshot as Record<string, unknown>)[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '—';
}

function flightRefundable(snapshot: unknown): boolean | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const offer = (snapshot as Record<string, unknown>).flightOffer;
  if (!offer || typeof offer !== 'object') return null;
  const value = (offer as Record<string, unknown>).refundable;
  return typeof value === 'boolean' ? value : null;
}

function diffText(diff: unknown): string {
  if (diff === null || diff === undefined) return '';
  try {
    return JSON.stringify(diff);
  } catch {
    return String(diff);
  }
}

export default function AdminBookingDetailPage() {
  const router = useRouter();
  const { ref } = useParams<{ ref: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!ref) return;
    const res = await fetch(`/api/v1/admin/bookings/${encodeURIComponent(ref)}`);
    if (res.status === 401) {
      router.push('/admin/login');
      return;
    }
    if (!res.ok) {
      setNotice((await res.json()).error ?? 'Booking could not be loaded.');
      return;
    }
    setDetail((await res.json()) as Detail);
  }, [ref, router]);

  useEffect(() => {
    // Initial detail load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function retryTicketing() {
    if (!detail) return;
    setBusy(true);
    setNotice('');
    try {
      const res = await fetch(
        `/api/v1/admin/bookings/${encodeURIComponent(detail.booking.ref)}/retry-ticketing`,
        { method: 'POST' },
      );
      const body = (await res.json()) as { error?: string; status?: string; alertsResolved?: number };
      if (!res.ok) {
        setNotice(body.error ?? 'Ticketing retry failed.');
      } else {
        setNotice(
          `Ticketing result: ${body.status ?? 'ok'}${
            body.alertsResolved ? `; ${body.alertsResolved} alert(s) resolved` : ''
          }.`,
        );
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function resolveAlert(kind: string) {
    if (!detail) return;
    setBusy(true);
    setNotice('');
    try {
      const res = await fetch(
        `/api/v1/admin/bookings/${encodeURIComponent(detail.booking.ref)}/resolve-alert`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind }),
        },
      );
      const body = (await res.json()) as { error?: string; resolved?: number };
      if (!res.ok) {
        setNotice(body.error ?? 'Alert resolution failed.');
      } else {
        setNotice(`${body.resolved ?? 0} alert(s) resolved.`);
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function cancelFlight() {
    if (!detail) return;
    const refundable = flightRefundable(
      detail.items.find((item) => item.itemType === 'flight')?.snapshot,
    );
    const preview = refundable
      ? Math.max(0, detail.booking.paidCents - detail.booking.refundedCents)
      : 0;
    const message = refundable
      ? `Cancel ${detail.booking.ref}? An estimated refund of ${money(
          preview,
          detail.booking.currency,
        )} will be requested.`
      : `Cancel ${detail.booking.ref}? This fare is non-refundable; no guest refund will be requested.`;
    if (!window.confirm(message)) return;

    setBusy(true);
    setNotice('');
    try {
      const res = await fetch(
        `/api/v1/admin/bookings/${encodeURIComponent(detail.booking.ref)}/cancel`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reasonCode: 'CR01',
            remarks: 'Admin cancellation',
          }),
        },
      );
      const body = (await res.json()) as {
        error?: string;
        refundError?: string;
        alreadyCancelled?: boolean;
        refundAmountCents?: number;
        refund?: { id: string } | null;
      };
      if (!res.ok) {
        setNotice(body.error ?? 'Cancellation failed.');
      } else if (body.alreadyCancelled) {
        setNotice('Booking was already cancelled.');
      } else {
        const refundLine = body.refund
          ? ` Refund of ${money(
              body.refundAmountCents ?? 0,
              detail.booking.currency,
            )} requested; approve it below.`
          : body.refundAmountCents
            ? ` Refund of ${money(
                body.refundAmountCents,
                detail.booking.currency,
              )} was due but could not be requested.`
            : ' No refund is due under the fare rules.';
        setNotice(
          `Booking cancelled.${refundLine}${
            body.refundError ? ` ${body.refundError}` : ''
          }`,
        );
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function approveRefund(refundId: string) {
    setBusy(true);
    setNotice('');
    try {
      const me = await fetch('/api/v1/auth/me');
      const meBody = (await me.json()) as { account?: { id?: string } };
      if (!me.ok || !meBody.account?.id) {
        setNotice('Could not identify the signed-in admin.');
        return;
      }
      const res = await fetch(`/api/v1/refunds/${encodeURIComponent(refundId)}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvedBy: meBody.account.id }),
      });
      const body = (await res.json()) as {
        error?: string;
        refund?: { state?: string };
      };
      if (!res.ok) {
        setNotice(body.error ?? 'Refund approval failed.');
      } else {
        setNotice(`Refund is ${body.refund?.state ?? 'processed'}.`);
      }
      if (detail) await load();
    } finally {
      setBusy(false);
    }
  }

  if (!detail) {
    return (
      <main className="min-h-screen grid place-items-center text-sm">
        {notice || 'Loading…'}
      </main>
    );
  }

  const { booking } = detail;
  const canRetry =
    booking.paidCents >= booking.totalCents &&
    ['confirmed', 'ticketing', 'failed'].includes(booking.status) &&
    detail.items.some((item) => item.itemType === 'flight' && !item.confirmationRef);
  const unresolvedTicketingAlert = detail.alerts.some(
    (alert) => alert.kind === 'ticketing_failed' && !alert.resolvedAt,
  );
  const unresolvedCancellationAlert = detail.alerts.some(
    (alert) => alert.kind === 'cancellation_refund_failed' && !alert.resolvedAt,
  );
  const flightItems = detail.items.filter((item) => item.itemType === 'flight');
  const cancelStatus = ['confirmed', 'ticketed', 'fulfilled', 'on_hold'].includes(
    booking.status,
  );
  const fareRefundable =
    flightItems.length === 1 ? flightRefundable(flightItems[0]?.snapshot) : null;
  const refundPreview = fareRefundable
    ? Math.max(0, booking.paidCents - booking.refundedCents)
    : 0;
  const canCancel =
    cancelStatus &&
    detail.items.length === 1 &&
    flightItems.length === 1 &&
    fareRefundable !== null;

  return (
    <main className="min-h-screen bg-[#f5f5f5]">
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Link href="/admin/bookings" className="text-sm text-[#0071C2]">
            ← Bookings
          </Link>
          <h1 className="text-2xl font-bold font-mono">{booking.ref}</h1>
          <span className="rounded-full border border-[#ddd] bg-white px-3 py-1 text-xs font-semibold">
            {booking.status}
          </span>
          {booking.status === 'ticketed' && (
            <a
              href={`/cdn/tickets/${encodeURIComponent(booking.ref)}.pdf`}
              className="text-sm text-[#0071C2]"
              target="_blank"
              rel="noreferrer"
            >
              Voucher PDF
            </a>
          )}
          <div className="ml-auto flex gap-2">
            {canRetry && (
              <button className={btn} onClick={retryTicketing} disabled={busy}>
                {busy ? 'Working…' : 'Retry ticketing'}
              </button>
            )}
            {unresolvedTicketingAlert && (
              <button
                className={btnGhost}
                onClick={() => resolveAlert('ticketing_failed')}
                disabled={busy}
              >
                Resolve alert
              </button>
            )}
            {unresolvedCancellationAlert && (
              <button
                className={btnGhost}
                onClick={() => resolveAlert('cancellation_refund_failed')}
                disabled={busy}
              >
                Resolve refund alert
              </button>
            )}
          </div>
        </div>

        {notice && <p className="mb-4 rounded-lg bg-white p-3 text-sm text-[#333]">{notice}</p>}

        <section className="mb-4 grid gap-3 rounded-[16px] border border-[#e3e3e3] bg-white p-4 md:grid-cols-4">
          <div>
            <div className="text-xs text-[#777]">Customer</div>
            <div>{detail.account.name ?? 'Guest'}</div>
            <div className="text-xs text-[#777]">{detail.account.email ?? ''}</div>
          </div>
          <div>
            <div className="text-xs text-[#777]">Total / paid / refunded</div>
            <div className="font-mono">{money(booking.totalCents, booking.currency)}</div>
            <div className="text-xs text-[#666]">
              {money(booking.paidCents, booking.currency)} paid ·{' '}
              {money(booking.refundedCents, booking.currency)} refunded
            </div>
          </div>
          <div>
            <div className="text-xs text-[#777]">Channel</div>
            <div>{booking.channel}</div>
            <div className="text-xs text-[#666]">{date(booking.createdAt)}</div>
          </div>
          <div>
            <div className="text-xs text-[#777]">Updated</div>
            <div className="text-sm">{date(booking.updatedAt)}</div>
            {booking.cancelledAt && (
              <div className="text-xs text-[#b91c1c]">cancelled {date(booking.cancelledAt)}</div>
            )}
          </div>
        </section>

        <Section title="Cancellation">
          {booking.status === 'cancelled' || booking.status === 'refunded' ? (
            <p className="p-4 text-sm text-[#555]">
              This booking is {booking.status}
              {booking.cancelledAt ? ` since ${date(booking.cancelledAt)}` : ''}.
            </p>
          ) : cancelStatus ? (
            canCancel ? (
              <div className="space-y-2 p-4 text-sm">
                <p>
                  Fare rules:{' '}
                  <strong>{fareRefundable ? 'refundable' : 'non-refundable'}</strong>.
                  Estimated guest refund:{' '}
                  <strong>{money(refundPreview, booking.currency)}</strong>.
                </p>
                <p className="text-xs text-[#777]">
                  The provider quote is checked before cancelling and may adjust the
                  final amount. A refund is created for admin approval; it is not sent
                  automatically.
                </p>
                <button className={btn} onClick={cancelFlight} disabled={busy}>
                  {busy ? 'Working…' : 'Cancel booking'}
                </button>
              </div>
            ) : (
              <p className="p-4 text-sm text-[#555]">
                Cancellation needs exactly one flight item with known fare rules. Use
                the manual refund workflow for this booking.
              </p>
            )
          ) : (
            <p className="p-4 text-sm text-[#555]">
              Cancellation is not available from this screen while the booking is{' '}
              {booking.status}.
            </p>
          )}
        </Section>

        <Section title="Items">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#fafafa] text-left text-xs text-[#666]">
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Ref</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Confirmation</th>
                <th className="px-4 py-2">PNR / ticket</th>
                <th className="px-4 py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {detail.items.map((item) => (
                <tr key={item.id} className="border-t border-[#eee]">
                  <td className="px-4 py-2">{item.itemType}</td>
                  <td className="px-4 py-2 font-mono">{item.itemRef}</td>
                  <td className="px-4 py-2">{item.status}</td>
                  <td className="px-4 py-2 font-mono">{item.confirmationRef ?? '—'}</td>
                  <td className="px-4 py-2 font-mono">
                    {snapshotValue(item.snapshot, 'pnr')} / {snapshotValue(item.snapshot, 'ticket')}
                  </td>
                  <td className="px-4 py-2 font-mono">{money(item.totalCents, booking.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="Passengers">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#fafafa] text-left text-xs text-[#666]">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">DOB</th>
                <th className="px-4 py-2">Nationality</th>
                <th className="px-4 py-2">Passport</th>
              </tr>
            </thead>
            <tbody>
              {detail.guests.map((guest) => (
                <tr key={guest.id} className="border-t border-[#eee]">
                  <td className="px-4 py-2">
                    {guest.firstName} {guest.lastName} {guest.isLead ? '(lead)' : ''}
                  </td>
                  <td className="px-4 py-2">{guest.guestType}</td>
                  <td className="px-4 py-2">{guest.dateOfBirth ?? '—'}</td>
                  <td className="px-4 py-2">{guest.nationality ?? '—'}</td>
                  <td className="px-4 py-2 font-mono">{guest.passportHint ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="Payments">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#fafafa] text-left text-xs text-[#666]">
                <th className="px-4 py-2">Method</th>
                <th className="px-4 py-2">Intent state</th>
                <th className="px-4 py-2">Provider ref</th>
                <th className="px-4 py-2">Amount</th>
                <th className="px-4 py-2">Created / expires</th>
              </tr>
            </thead>
            <tbody>
              {detail.intents.map((intent) => (
                <tr key={intent.id} className="border-t border-[#eee]">
                  <td className="px-4 py-2">{intent.method}</td>
                  <td className="px-4 py-2">{intent.state}</td>
                  <td className="px-4 py-2 font-mono text-xs">{intent.providerRef ?? '—'}</td>
                  <td className="px-4 py-2 font-mono">
                    {money(intent.amountCents, intent.currency)}
                  </td>
                  <td className="px-4 py-2 text-xs text-[#666]">
                    {date(intent.createdAt)} / {date(intent.expiresAt)}
                  </td>
                </tr>
              ))}
              {detail.payments.map((payment) => (
                <tr key={payment.id} className="border-t border-[#eee] bg-[#fbfefc]">
                  <td className="px-4 py-2">captured payment</td>
                  <td className="px-4 py-2">{payment.status}</td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {payment.providerPaymentId ?? '—'}
                  </td>
                  <td className="px-4 py-2 font-mono">
                    {money(payment.amountCents, payment.currency)}
                  </td>
                  <td className="px-4 py-2 text-xs text-[#666]">
                    {date(payment.createdAt)} / {date(payment.capturedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        {(detail.refunds.length > 0 || detail.ledger.length > 0) && (
          <Section title="Refunds and ledger">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#fafafa] text-left text-xs text-[#666]">
                  <th className="px-4 py-2">Kind</th>
                  <th className="px-4 py-2">Account / state</th>
                  <th className="px-4 py-2">Amount</th>
                  <th className="px-4 py-2">Created</th>
                  <th className="px-4 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {detail.refunds.map((refund) => (
                  <tr key={refund.id} className="border-t border-[#eee]">
                    <td className="px-4 py-2">refund</td>
                    <td className="px-4 py-2">{refund.state}</td>
                    <td className="px-4 py-2 font-mono">
                      {money(refund.amountCents, booking.currency)}
                    </td>
                    <td className="px-4 py-2 text-xs text-[#666]">{date(refund.createdAt)}</td>
                    <td className="px-4 py-2">
                      {refund.state === 'pending' && (
                        <button
                          className={btnGhost}
                          onClick={() => approveRefund(refund.id)}
                          disabled={busy}
                        >
                          Approve refund
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {detail.ledger.map((entry) => (
                  <tr key={entry.id} className="border-t border-[#eee]">
                    <td className="px-4 py-2">{entry.direction}</td>
                    <td className="px-4 py-2">{entry.accountName ?? entry.referenceType}</td>
                    <td className="px-4 py-2 font-mono">
                      {money(entry.amountCents, entry.currency)}
                    </td>
                    <td className="px-4 py-2 text-xs text-[#666]">{date(entry.createdAt)}</td>
                    <td className="px-4 py-2" />
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        <Section title="Alerts">
          {detail.alerts.length === 0 ? (
            <p className="p-4 text-sm text-[#777]">No alerts for this booking.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#fafafa] text-left text-xs text-[#666]">
                  <th className="px-4 py-2">Kind</th>
                  <th className="px-4 py-2">Severity</th>
                  <th className="px-4 py-2">First seen</th>
                  <th className="px-4 py-2">Resolved</th>
                  <th className="px-4 py-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {detail.alerts.map((alert) => (
                  <tr key={alert.id} className="border-t border-[#eee]">
                    <td className="px-4 py-2">{alert.kind}</td>
                    <td className="px-4 py-2">{alert.severity}</td>
                    <td className="px-4 py-2 text-xs text-[#666]">{date(alert.firstSeenAt)}</td>
                    <td className="px-4 py-2 text-xs text-[#666]">
                      {alert.resolvedAt ? date(alert.resolvedAt) : 'open'}
                    </td>
                    <td className="max-w-[420px] break-words px-4 py-2 font-mono text-xs">
                      {diffText(alert.details)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title="Audit timeline">
          <div className="divide-y divide-[#eee]">
            {detail.audit.map((event) => (
              <div key={event.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-mono">{event.action}</span>
                  <span className="text-xs text-[#777]">
                    {event.actorRealm ?? 'system'} · {date(event.createdAt)}
                  </span>
                </div>
                {event.diff !== null && event.diff !== undefined && (
                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words text-xs text-[#555]">
                    {diffText(event.diff)}
                  </pre>
                )}
              </div>
            ))}
            {detail.audit.length === 0 && (
              <p className="p-4 text-sm text-[#777]">No audit events for this booking.</p>
            )}
          </div>
        </Section>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-4 overflow-hidden rounded-[16px] border border-[#e3e3e3] bg-white">
      <h2 className="border-b border-[#eee] px-4 py-3 font-semibold">{title}</h2>
      {children}
    </section>
  );
}
