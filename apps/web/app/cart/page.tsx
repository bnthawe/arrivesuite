'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

interface CartItem {
  kind: string;
  offerId: string;
  label: string;
  netCents: number;
  markupCents: number;
  currency: string;
}

interface Confirmation {
  arsRef: string;
  voucher: string;
  providers: { kind: string; providerRef: string; status: string }[];
}

function fmtClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function initialCartId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem('ars_cart_id');
  if (!id) {
    id = `cart-${crypto.randomUUID()}`;
    localStorage.setItem('ars_cart_id', id);
  }
  return id;
}

export default function CartPage() {
  const [cartId] = useState(initialCartId);
  const [items, setItems] = useState<CartItem[]>([]);
  const [total, setTotal] = useState(0);
  const [expiresIn, setExpiresIn] = useState<number | null>(null);
  const [loadedAt, setLoadedAt] = useState<number>(0);
  const [nowMs, setNowMs] = useState<number>(0);
  const [firstName, setFirstName] = useState('Boipelo');
  const [lastName, setLastName] = useState('Nthawe');
  const [email, setEmail] = useState('boipelo@example.com');
  const [phone, setPhone] = useState('+26771123456');
  const [transactionId, setTransactionId] = useState('tx_cart_demo');
  const [notice, setNotice] = useState('');
  const [done, setDone] = useState<Confirmation | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (id: string) => {
    const res = await fetch(`/api/v1/cart/${id}`);
    if (!res.ok) {
      setItems([]);
      setExpiresIn(null);
      return;
    }
    const data = await res.json();
    setItems(data.cart.items);
    setTotal(data.totalCents);
    setExpiresIn(data.expiresIn);
    setLoadedAt(Date.now());
  }, []);

  useEffect(() => {
    // Client cart fetch on mount; no external sync primitive fits better.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cartId) void load(cartId);
  }, [cartId, load]);

  // Latest at bottom: auto-scroll on new items. Countdown ticks every second.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [items.length]);
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining =
    expiresIn == null || loadedAt === 0
      ? null
      : Math.max(0, expiresIn - Math.floor((nowMs - loadedAt) / 1000));

  async function checkout() {
    setNotice('');
    const res = await fetch(`/api/v1/cart/${cartId}/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guestInfo: { firstName, lastName, email, phone },
        payment: { transactionId },
        passengers: [{ type: 'ADT' }],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setNotice(data.error ?? 'Checkout failed');
      return;
    }
    setDone({ arsRef: data.arsRef, voucher: data.voucher, providers: data.providers });
    setItems([]);
    setExpiresIn(null);
  }

  if (done) {
    return (
      <main className="min-h-screen bg-[#f5f5f5]">
        <div className="container mx-auto max-w-2xl px-4 py-16 text-center">
          <h1 className="text-2xl font-bold mb-2">Booking confirmed</h1>
          <p className="font-mono text-lg mb-4">{done.arsRef}</p>
          <a href={done.voucher} target="_blank" rel="noreferrer" className="inline-block bg-[#0071C2] text-white font-semibold rounded-lg px-5 py-2.5 text-sm">
            View voucher (PDF)
          </a>
          <div className="mt-4 text-xs text-[#666] font-mono">
            {done.providers.map((p) => <div key={p.providerRef}>{p.kind}: {p.providerRef} ({p.status})</div>)}
          </div>
          <div className="mt-6"><Link href="/search" className="text-sm text-[#0071C2]">← Back to search</Link></div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5]">
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <div className="mb-4 flex items-center gap-3">
          <Link href="/search" className="text-sm text-[#0071C2]">← Search</Link>
          <h1 className="text-xl font-bold">Combined cart</h1>
          <span className="ml-auto inline-flex items-center gap-1.5 border border-[#ffb4b4] bg-[#ffeaea] text-[#b91c1c] px-2 py-1 rounded-full text-[11px] font-mono">
            <span className="w-2 h-2 rounded-full bg-[#b91c1c] animate-pulse" />
            {items.length} items{remaining != null && ` • expires ${fmtClock(remaining)}`}
          </span>
        </div>

        <div className="space-y-3">
          {items.map((it, i) => (
            <div key={`${it.offerId}-${i}`} className="flex gap-3 border border-[#e3e3e3] rounded-[16px] p-3 bg-white">
              <div className="w-[72px] h-[72px] rounded-[12px] bg-gradient-to-br from-[#003580] to-[#0071C2] shrink-0 grid place-items-center text-white/70 text-[10px]">280×240</div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold leading-[16px]">{it.label}</div>
                <div className="text-[11px] text-[#666]">{it.kind} • {(it.netCents + it.markupCents) / 100} {it.currency}</div>
              </div>
            </div>
          ))}
          {items.length === 0 && <p className="text-sm text-[#666]">Cart is empty. <Link href="/search" className="text-[#0071C2]">Find something →</Link></p>}
          <div ref={bottomRef} />
        </div>

        {items.length > 0 && (
          <div className="mt-6 bg-white border border-[#e3e3e3] rounded-[16px] p-4 grid gap-3">
            <div className="font-mono text-sm">Total: BWP {(total / 100).toFixed(2)}</div>
            <div className="grid md:grid-cols-2 gap-3">
              <input className="border border-[#e3e3e3] rounded-lg px-3 py-2 text-sm" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" />
              <input className="border border-[#e3e3e3] rounded-lg px-3 py-2 text-sm" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" />
              <input className="border border-[#e3e3e3] rounded-lg px-3 py-2 text-sm" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
              <input className="border border-[#e3e3e3] rounded-lg px-3 py-2 text-sm" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" />
            </div>
            <input className="border border-[#e3e3e3] rounded-lg px-3 py-2 text-sm font-mono" value={transactionId} onChange={(e) => setTransactionId(e.target.value)} placeholder="Payment transaction ID" />
            {notice && <p className="text-sm text-[#b91c1c]">{notice}</p>}
            <button onClick={checkout} className="bg-[#0071C2] hover:bg-[#005799] text-white font-semibold rounded-lg px-5 py-2.5 text-sm">
              Pay BWP {(total / 100).toFixed(2)} — one booking, one voucher
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
