'use client';

import { useCallback, useEffect, useState } from 'react';

interface Tour {
  id: string;
  name: string;
  category: string | null;
  status: string;
}

interface Departure {
  id: string;
  departureAt: string;
  capacity: number;
  bookedCount: number;
  status: string;
}

interface Tier {
  id: string;
  tier: string;
  priceCents: number;
}

interface ItineraryDay {
  id: string;
  dayNumber: number;
  title: string;
}

const input = 'border border-[#e3e3e3] rounded-lg px-3 py-2 text-sm w-full';
const smallInput = 'border border-[#e3e3e3] rounded-lg px-2 py-1.5 text-xs';
const btn = 'bg-[#003580] hover:bg-[#005799] text-white font-semibold rounded-lg px-4 py-2 text-sm';

export default function ToursManager() {
  const [tours, setTours] = useState<Tour[]>([]);
  const [departures, setDepartures] = useState<Record<string, Departure[]>>({});
  const [tiers, setTiers] = useState<Record<string, Tier[]>>({});
  const [days, setDays] = useState<Record<string, ItineraryDay[]>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [openTiers, setOpenTiers] = useState<Record<string, boolean>>({});
  const [name, setName] = useState('');
  const [depDate, setDepDate] = useState<Record<string, string>>({});
  const [depCap, setDepCap] = useState<Record<string, string>>({});
  const [tierName, setTierName] = useState<Record<string, string>>({});
  const [tierPrice, setTierPrice] = useState<Record<string, string>>({});
  const [dayTitle, setDayTitle] = useState<Record<string, string>>({});
  const [dayNum, setDayNum] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/v1/supplier/tours');
    if (!res.ok) return;
    setTours((await res.json()).tours ?? []);
  }, []);

  useEffect(() => {
    // Initial tours load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function addTour() {
    setNotice('');
    const res = await fetch('/api/v1/supplier/tours', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      setNotice((await res.json()).error ?? 'Failed');
      return;
    }
    setName('');
    await load();
  }

  async function toggleTour(tourId: string) {
    const isOpen = !open[tourId];
    setOpen((o) => ({ ...o, [tourId]: isOpen }));
    if (isOpen) {
      const [d, y] = await Promise.all([
        fetch(`/api/v1/supplier/tours/${tourId}/departures`),
        fetch(`/api/v1/supplier/tours/${tourId}/itinerary`),
      ]);
      if (d.ok) {
        const data = (await d.json()) as { departures: Departure[] };
        setDepartures((prev) => ({ ...prev, [tourId]: data.departures ?? [] }));
      }
      if (y.ok) {
        const data = (await y.json()) as { days: ItineraryDay[] };
        setDays((prev) => ({ ...prev, [tourId]: data.days ?? [] }));
      }
    }
  }

  async function addDeparture(tourId: string) {
    const res = await fetch(`/api/v1/supplier/tours/${tourId}/departures`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ departureAt: depDate[tourId], capacity: Number(depCap[tourId] || '0') }),
    });
    if (!res.ok) {
      setNotice((await res.json()).error ?? 'Failed');
      return;
    }
    const d = await (await fetch(`/api/v1/supplier/tours/${tourId}/departures`)).json();
    setDepartures((prev) => ({ ...prev, [tourId]: d.departures ?? [] }));
  }

  async function toggleTiers(depId: string) {
    const isOpen = !openTiers[depId];
    setOpenTiers((o) => ({ ...o, [depId]: isOpen }));
    if (isOpen) {
      const res = await fetch(`/api/v1/supplier/departures/${depId}/tiers`);
      if (res.ok) {
        const data = (await res.json()) as { tiers: Tier[] };
        setTiers((prev) => ({ ...prev, [depId]: data.tiers ?? [] }));
      }
    }
  }

  async function addTier(depId: string) {
    const res = await fetch(`/api/v1/supplier/departures/${depId}/tiers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier: tierName[depId] || 'adult', priceCents: Math.round(Number(tierPrice[depId] || '0') * 100) }),
    });
    if (!res.ok) {
      setNotice((await res.json()).error ?? 'Failed');
      return;
    }
    const r = await (await fetch(`/api/v1/supplier/departures/${depId}/tiers`)).json();
    setTiers((prev) => ({ ...prev, [depId]: r.tiers ?? [] }));
  }

  async function addDay(tourId: string) {
    const res = await fetch(`/api/v1/supplier/tours/${tourId}/itinerary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dayNumber: Number(dayNum[tourId] || '1'), title: dayTitle[tourId] || 'Day' }),
    });
    if (!res.ok) {
      setNotice((await res.json()).error ?? 'Failed');
      return;
    }
    const r = await (await fetch(`/api/v1/supplier/tours/${tourId}/itinerary`)).json();
    setDays((prev) => ({ ...prev, [tourId]: r.days ?? [] }));
  }

  return (
    <div className="mt-6 border-t border-[#f0f0f0] pt-4">
      <h3 className="font-semibold mb-2">Tours</h3>
      {tours.map((t) => (
        <div key={t.id} className="border border-[#e3e3e3] rounded-[12px] p-3 mb-2">
          <button onClick={() => toggleTour(t.id)} className="font-semibold text-sm text-left">
            {t.name} <span className="text-[#999] font-normal">· {t.category ?? 'tour'} · {t.status}</span>
          </button>
          {open[t.id] && (
            <div className="mt-2 pl-2 space-y-2">
              <div className="text-xs font-semibold text-[#666]">Itinerary</div>
              {(days[t.id] ?? []).map((d) => (
                <div key={d.id} className="text-xs text-[#444]">Day {d.dayNumber}: {d.title}</div>
              ))}
              <div className="flex gap-1.5">
                <input className={smallInput} type="number" value={dayNum[t.id] ?? ''} onChange={(e) => setDayNum((m) => ({ ...m, [t.id]: e.target.value }))} placeholder="Day #" />
                <input className={smallInput} value={dayTitle[t.id] ?? ''} onChange={(e) => setDayTitle((m) => ({ ...m, [t.id]: e.target.value }))} placeholder="Day title" />
                <button onClick={() => addDay(t.id)} className="text-xs text-[#0071C2]">+ day</button>
              </div>
              <div className="text-xs font-semibold text-[#666] pt-1">Departures</div>
              {(departures[t.id] ?? []).map((dep) => (
                <div key={dep.id} className="text-sm">
                  <button onClick={() => toggleTiers(dep.id)} className="font-medium">
                    {new Date(dep.departureAt).toLocaleString()} <span className="text-[#999] font-normal">· {dep.bookedCount}/{dep.capacity} · {dep.status}</span>
                  </button>
                  {openTiers[dep.id] && (
                    <div className="mt-1 pl-2 space-y-1">
                      {(tiers[dep.id] ?? []).map((tr) => (
                        <div key={tr.id} className="text-xs font-mono text-[#444]">{tr.tier} · {(tr.priceCents / 100).toFixed(2)}</div>
                      ))}
                      <div className="flex gap-1.5">
                        <input className={smallInput} value={tierName[dep.id] ?? ''} onChange={(e) => setTierName((m) => ({ ...m, [dep.id]: e.target.value }))} placeholder="Tier" />
                        <input className={smallInput} type="number" value={tierPrice[dep.id] ?? ''} onChange={(e) => setTierPrice((m) => ({ ...m, [dep.id]: e.target.value }))} placeholder="BWP" />
                        <button onClick={() => addTier(dep.id)} className="text-xs text-[#0071C2]">+ tier</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div className="flex gap-1.5">
                <input className={smallInput} type="datetime-local" value={depDate[t.id] ?? ''} onChange={(e) => setDepDate((m) => ({ ...m, [t.id]: e.target.value }))} />
                <input className={smallInput} type="number" value={depCap[t.id] ?? ''} onChange={(e) => setDepCap((m) => ({ ...m, [t.id]: e.target.value }))} placeholder="Seats" />
                <button onClick={() => addDeparture(t.id)} className="text-xs text-[#0071C2]">+ departure</button>
              </div>
            </div>
          )}
        </div>
      ))}
      <div className="flex gap-2 mt-3">
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="New tour name" />
        <button className={btn} onClick={addTour}>Add</button>
      </div>
      {notice && <p className="mt-2 text-sm text-[#b91c1c]">{notice}</p>}
    </div>
  );
}
