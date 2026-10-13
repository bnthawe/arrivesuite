'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PropertiesManager from './properties';
import ToursManager from './tours';
import VenuesManager from './venues';

interface Supplier {
  id: string;
  legalName: string;
  tradingName: string | null;
  status: string;
  trustScore: number;
  countryCode: string;
}

const input = 'border border-[#e3e3e3] rounded-lg px-3 py-2 text-sm w-full';
const btn = 'bg-[#003580] hover:bg-[#005799] text-white font-semibold rounded-lg px-5 py-2.5 text-sm';

export default function ExtranetPage() {
  const [ready, setReady] = useState(false);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [legalName, setLegalName] = useState('');
  const [tradingName, setTradingName] = useState('');
  const [notice, setNotice] = useState('');
  const router = useRouter();

  const load = useCallback(async () => {
    const me = await fetch('/api/v1/auth/me');
    if (!me.ok) {
      router.push('/extranet/login');
      return;
    }
    const res = await fetch('/api/v1/suppliers');
    if (res.status === 404) {
      setSupplier(null);
    } else if (res.ok) {
      setSupplier((await res.json()).supplier);
    } else {
      router.push('/extranet/login');
      return;
    }
    setReady(true);
  }, [router]);

  useEffect(() => {
    // Initial extranet load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function onboard() {
    setNotice('');
    const res = await fetch('/api/v1/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legalName, tradingName: tradingName || undefined }),
    });
    const data = await res.json();
    if (!res.ok) {
      setNotice(data.error ?? 'Onboarding failed');
      return;
    }
    setSupplier(data.supplier);
  }

  async function logout() {
    await fetch('/api/v1/auth/logout', { method: 'POST' });
    router.push('/extranet/login');
  }

  if (!ready) return <main className="min-h-screen grid place-items-center text-sm">Loading…</main>;

  return (
    <main className="min-h-screen bg-[#f5f5f5]">
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-2xl font-bold">Supplier extranet</h1>
          <button onClick={logout} className="ml-auto text-sm text-[#0071C2]">Sign out</button>
        </div>

        {!supplier ? (
          <div className="bg-white border border-[#e3e3e3] rounded-[16px] p-6">
            <h2 className="font-semibold mb-1">Onboard your business</h2>
            <p className="text-xs text-[#666] mb-4">Profiles start as prospect for admin approval.</p>
            <div className="grid gap-3">
              <input className={input} value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Legal name" />
              <input className={input} value={tradingName} onChange={(e) => setTradingName(e.target.value)} placeholder="Trading name (optional)" />
              {notice && <p className="text-sm text-[#b91c1c]">{notice}</p>}
              <button className={btn} onClick={onboard}>Submit for approval</button>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-[#e3e3e3] rounded-[16px] p-6">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="font-semibold text-lg">{supplier.tradingName ?? supplier.legalName}</h2>
                <p className="text-xs text-[#666] font-mono">{supplier.id}</p>
              </div>
              <span className="ml-auto text-xs font-mono border border-[#d0e8d0] bg-[#e7f9ed] text-[#0a7a2a] px-2 py-1 rounded-full">
                {supplier.status} • trust {supplier.trustScore}
              </span>
            </div>
            <PropertiesManager />
            <ToursManager />
            <VenuesManager />
          </div>
        )}
      </div>
    </main>
  );
}
