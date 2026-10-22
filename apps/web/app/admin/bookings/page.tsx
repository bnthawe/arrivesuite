'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { BOOKING_STATUSES } from '@/lib/booking-state';

interface BookingRow {
  id: string;
  ref: string;
  status: string;
  currency: string;
  totalCents: number;
  paidCents: number;
  createdAt: string;
  accountEmail: string | null;
  accountName: string | null;
}

interface Flag {
  key: 'bookings_enabled' | 'payments_enabled';
  enabled: boolean;
  note: string | null;
  updatedAt: string | null;
}

const input = 'border border-[#e3e3e3] rounded-lg px-3 py-2 text-sm';
const btn = 'bg-[#003580] hover:bg-[#005799] text-white font-semibold rounded-lg px-4 py-2 text-sm';

function money(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

function flagLabel(key: Flag['key']): string {
  return key === 'bookings_enabled' ? 'New bookings' : 'New payments';
}

export default function AdminBookingsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(
    async (nextQuery: string, nextStatus: string) => {
      setNotice('');
      const params = new URLSearchParams();
      if (nextQuery.trim()) params.set('query', nextQuery.trim());
      if (nextStatus) params.set('status', nextStatus);
      const [flagsRes, bookingsRes] = await Promise.all([
        fetch('/api/v1/admin/flags'),
        fetch(`/api/v1/admin/bookings?${params.toString()}`),
      ]);
      if (flagsRes.status === 401 || bookingsRes.status === 401) {
        router.push('/admin/login');
        return;
      }
      if (!flagsRes.ok || !bookingsRes.ok) {
        setNotice('Could not load admin bookings.');
        return;
      }
      const [flagsBody, bookingsBody] = await Promise.all([
        flagsRes.json() as Promise<{ flags?: Flag[] }>,
        bookingsRes.json() as Promise<{ bookings?: BookingRow[] }>,
      ]);
      setFlags(flagsBody.flags ?? []);
      setBookings(bookingsBody.bookings ?? []);
      setReady(true);
    },
    [router],
  );

  useEffect(() => {
    // Initial admin data load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load('', '');
  }, [load]);

  async function toggleFlag(flag: Flag) {
    setNotice('');
    const res = await fetch('/api/v1/admin/flags', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: flag.key, enabled: !flag.enabled }),
    });
    if (!res.ok) {
      setNotice((await res.json()).error ?? 'Flag update failed');
      return;
    }
    await load(query, status);
  }

  async function logout() {
    await fetch('/api/v1/auth/logout', { method: 'POST' });
    router.push('/admin/login');
  }

  if (!ready) {
    return <main className="min-h-screen grid place-items-center text-sm">Loading…</main>;
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5]">
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <h1 className="text-2xl font-bold">Bookings</h1>
          <Link href="/admin" className="text-sm text-[#0071C2]">
            Markup admin
          </Link>
          <button onClick={logout} className="ml-auto text-sm text-[#0071C2]">
            Sign out
          </button>
        </div>

        <section className="mb-6 rounded-[16px] border border-[#e3e3e3] bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="font-semibold">Kill switches</h2>
            <span className="text-xs text-[#777]">Changes apply immediately; idempotent retries still replay.</span>
          </div>
          <div className="flex flex-wrap gap-3">
            {flags.map((flag) => (
              <button
                key={flag.key}
                onClick={() => toggleFlag(flag)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  flag.enabled
                    ? 'border-[#b7e1c1] bg-[#effaf2] text-[#166534]'
                    : 'border-[#ffb4b4] bg-[#ffeaea] text-[#b91c1c]'
                }`}
              >
                {flagLabel(flag.key)}: {flag.enabled ? 'enabled' : 'paused'}
              </button>
            ))}
          </div>
        </section>

        <form
          className="mb-4 flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void load(query, status);
          }}
        >
          <input
            className={`${input} min-w-[220px] flex-1`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Booking ref or customer email"
          />
          <select className={input} value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            {BOOKING_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <button className={btn} type="submit">
            Search
          </button>
        </form>

        <div className="overflow-hidden rounded-[16px] border border-[#e3e3e3] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#fafafa] text-left text-xs text-[#666]">
                <th className="px-4 py-2">Ref</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Customer</th>
                <th className="px-4 py-2">Total</th>
                <th className="px-4 py-2">Paid</th>
                <th className="px-4 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking) => (
                <tr key={booking.id} className="border-t border-[#eee] hover:bg-[#fafcff]">
                  <td className="px-4 py-2 font-mono">
                    <Link href={`/admin/bookings/${encodeURIComponent(booking.ref)}`} className="text-[#0071C2]">
                      {booking.ref}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{booking.status}</td>
                  <td className="px-4 py-2">
                    <div>{booking.accountName ?? 'Guest'}</div>
                    <div className="text-xs text-[#777]">{booking.accountEmail ?? ''}</div>
                  </td>
                  <td className="px-4 py-2 font-mono">{money(booking.totalCents, booking.currency)}</td>
                  <td className="px-4 py-2 font-mono">{money(booking.paidCents, booking.currency)}</td>
                  <td className="px-4 py-2 text-xs text-[#666]">
                    {new Date(booking.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
              {bookings.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-[#777]">
                    No bookings match this search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {notice && <p className="mt-3 text-sm text-[#b91c1c]">{notice}</p>}
      </div>
    </main>
  );
}
