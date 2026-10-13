'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Agency {
  id: string;
  name: string;
  creditLimitCents: number;
  status: string;
}

interface Credit {
  agencyId: string;
  limitCents: number;
  outstandingCents: number;
  availableCents: number;
}

interface Booking {
  id: string;
  ref: string;
  status: string;
  currency: string;
  totalCents: number;
  paidCents: number;
  createdAt: string;
}

export default function AgentPage() {
  const [ready, setReady] = useState(false);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [credits, setCredits] = useState<Record<string, Credit>>({});
  const [bookings, setBookings] = useState<Booking[]>([]);
  const router = useRouter();

  const load = useCallback(async () => {
    const me = await fetch('/api/v1/auth/me');
    if (!me.ok) {
      router.push('/agent/login');
      return;
    }
    const [a, b] = await Promise.all([fetch('/api/v1/agencies/mine'), fetch('/api/v1/bookings/list')]);
    const agencyList: Agency[] = (await a.json()).agencies ?? [];
    setAgencies(agencyList);
    setBookings((await b.json()).bookings ?? []);
    const entries = await Promise.all(
      agencyList.map(async (ag) => {
        const r = await fetch(`/api/v1/agencies/${ag.id}/credit`);
        return [ag.id, (await r.json()).credit] as const;
      }),
    );
    setCredits(Object.fromEntries(entries));
    setReady(true);
  }, [router]);

  useEffect(() => {
    // Initial agent dashboard load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function logout() {
    await fetch('/api/v1/auth/logout', { method: 'POST' });
    router.push('/agent/login');
  }

  if (!ready) return <main className="min-h-screen grid place-items-center text-sm">Loading…</main>;

  return (
    <main className="min-h-screen bg-[#f5f5f5]">
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-2xl font-bold">Agent portal</h1>
          <Link href="/search" className="text-sm text-[#0071C2]">New booking →</Link>
          <button onClick={logout} className="ml-auto text-sm text-[#0071C2]">Sign out</button>
        </div>

        <h2 className="font-semibold mb-2">My agencies &amp; credit</h2>
        <div className="bg-white border border-[#e3e3e3] rounded-[16px] overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#fafafa] text-left text-xs text-[#666]">
                <th className="px-4 py-2">Agency</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Limit</th>
                <th className="px-4 py-2">Outstanding</th>
                <th className="px-4 py-2">Available</th>
              </tr>
            </thead>
            <tbody>
              {agencies.map((a) => (
                <tr key={a.id} className="border-t border-[#eee]">
                  <td className="px-4 py-2">{a.name}</td>
                  <td className="px-4 py-2">{a.status}</td>
                  <td className="px-4 py-2 font-mono">{((credits[a.id]?.limitCents ?? 0) / 100).toFixed(2)}</td>
                  <td className="px-4 py-2 font-mono">{((credits[a.id]?.outstandingCents ?? 0) / 100).toFixed(2)}</td>
                  <td className="px-4 py-2 font-mono">{((credits[a.id]?.availableCents ?? 0) / 100).toFixed(2)}</td>
                </tr>
              ))}
              {agencies.length === 0 && (
                <tr><td className="px-4 py-3 text-sm text-[#666]" colSpan={5}>No agency membership yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <h2 className="font-semibold mb-2">My bookings</h2>
        <div className="bg-white border border-[#e3e3e3] rounded-[16px] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#fafafa] text-left text-xs text-[#666]">
                <th className="px-4 py-2">Ref</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Total</th>
                <th className="px-4 py-2">Paid</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((bk) => (
                <tr key={bk.id} className="border-t border-[#eee]">
                  <td className="px-4 py-2 font-mono">{bk.ref}</td>
                  <td className="px-4 py-2">{bk.status}</td>
                  <td className="px-4 py-2 font-mono">{(bk.totalCents / 100).toFixed(2)} {bk.currency}</td>
                  <td className="px-4 py-2 font-mono">{(bk.paidCents / 100).toFixed(2)}</td>
                </tr>
              ))}
              {bookings.length === 0 && (
                <tr><td className="px-4 py-3 text-sm text-[#666]" colSpan={4}>No bookings yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
