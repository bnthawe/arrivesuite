'use client';

import { useCallback, useEffect, useState } from 'react';

interface Rfq {
  id: string;
  title: string;
  requirements: string;
  status: string;
  createdAt: string;
}

interface Quote {
  id: string;
  supplierId: string;
  amountCents: number;
  message: string | null;
  state: string;
}

const input = 'border border-[#e3e3e3] rounded-lg px-3 py-2 text-sm w-full';
const btn = 'bg-[#003580] hover:bg-[#005799] text-white font-semibold rounded-lg px-4 py-2 text-sm';

export default function RfqPage() {
  const [mine, setMine] = useState<Rfq[]>([]);
  const [open, setOpen] = useState<Rfq[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [title, setTitle] = useState('');
  const [requirements, setRequirements] = useState('');
  const [quoteAmount, setQuoteAmount] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const [m, o] = await Promise.all([fetch('/api/v1/rfqs'), fetch('/api/v1/rfqs?scope=open')]);
    if (m.status === 401) {
      setNotice('Sign in first (any account can raise an RFQ).');
      return;
    }
    setMine((await m.json()).rfqs ?? []);
    setOpen((await o.json()).rfqs ?? []);
  }, []);

  useEffect(() => {
    // Initial RFQ load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function create() {
    setNotice('');
    const res = await fetch('/api/v1/rfqs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, requirements }),
    });
    if (!res.ok) {
      setNotice((await res.json()).error ?? 'Failed');
      return;
    }
    setTitle('');
    setRequirements('');
    await load();
  }

  async function toggleQuotes(id: string) {
    const isOpen = !expanded[id];
    setExpanded((e) => ({ ...e, [id]: isOpen }));
    if (isOpen) {
      const res = await fetch(`/api/v1/rfqs/${id}/quotes`);
      if (res.ok) {
        const data = (await res.json()) as { quotes: Quote[] };
        setQuotes((q) => ({ ...q, [id]: data.quotes ?? [] }));
      }
    }
  }

  async function sendQuote(id: string) {
    const res = await fetch(`/api/v1/rfqs/${id}/quotes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amountCents: Math.round(Number(quoteAmount[id] || '0') * 100) }),
    });
    if (!res.ok) {
      setNotice((await res.json()).error ?? 'Failed');
      return;
    }
    const r = await (await fetch(`/api/v1/rfqs/${id}/quotes`)).json();
    setQuotes((q) => ({ ...q, [id]: r.quotes ?? [] }));
  }

  async function accept(id: string, quoteId: string) {
    const res = await fetch(`/api/v1/rfqs/${id}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId }),
    });
    if (!res.ok) {
      setNotice((await res.json()).error ?? 'Failed');
      return;
    }
    await load();
    const r = await (await fetch(`/api/v1/rfqs/${id}/quotes`)).json();
    setQuotes((q) => ({ ...q, [id]: r.quotes ?? [] }));
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5]">
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold mb-4">Corporate RFQs</h1>

        <div className="bg-white border border-[#e3e3e3] rounded-[16px] p-4 mb-6 grid gap-2">
          <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title, e.g. Board retreat Dec 12-14" />
          <textarea className={input} value={requirements} onChange={(e) => setRequirements(e.target.value)} placeholder="Requirements: pax, rooms, AV, catering…" rows={3} />
          <button className={btn} onClick={create}>Raise RFQ</button>
        </div>

        <h2 className="font-semibold mb-2">My requests</h2>
        <div className="space-y-2 mb-8">
          {mine.map((r) => (
            <div key={r.id} className="bg-white border border-[#e3e3e3] rounded-[12px] p-3">
              <button onClick={() => toggleQuotes(r.id)} className="font-semibold text-sm text-left">
                {r.title} <span className="text-[#999] font-normal">· {r.status}</span>
              </button>
              {expanded[r.id] && (
                <div className="mt-2 pl-2 space-y-1">
                  {(quotes[r.id] ?? []).map((q) => (
                    <div key={q.id} className="text-xs font-mono text-[#444]">
                      {(q.amountCents / 100).toFixed(2)} · {q.state}{' '}
                      {q.state === 'submitted' && r.status === 'open' && (
                        <button onClick={() => accept(r.id, q.id)} className="text-[#0071C2] ml-2">accept</button>
                      )}
                    </div>
                  ))}
                  {(quotes[r.id] ?? []).length === 0 && <div className="text-xs text-[#999]">No quotes yet.</div>}
                </div>
              )}
            </div>
          ))}
          {mine.length === 0 && <p className="text-sm text-[#666]">No requests yet.</p>}
        </div>

        <h2 className="font-semibold mb-2">Open RFQs (suppliers quote here)</h2>
        <div className="space-y-2">
          {open.map((r) => (
            <div key={r.id} className="bg-white border border-[#e3e3e3] rounded-[12px] p-3">
              <div className="font-semibold text-sm">{r.title}</div>
              <div className="text-xs text-[#666] mb-2">{r.requirements.slice(0, 160)}</div>
              <div className="flex gap-1.5">
                <input className="border border-[#e3e3e3] rounded-lg px-2 py-1.5 text-xs" type="number" value={quoteAmount[r.id] ?? ''} onChange={(e) => setQuoteAmount((m) => ({ ...m, [r.id]: e.target.value }))} placeholder="BWP" />
                <button onClick={() => sendQuote(r.id)} className="text-xs text-[#0071C2]">quote</button>
              </div>
            </div>
          ))}
          {open.length === 0 && <p className="text-sm text-[#666]">No open RFQs.</p>}
        </div>
        {notice && <p className="mt-3 text-sm text-[#b91c1c]">{notice}</p>}
      </div>
    </main>
  );
}
