'use client';

import { useCallback, useEffect, useState } from 'react';

interface Venue {
  id: string;
  name: string;
  standalone: boolean;
  status: string;
}

interface Space {
  id: string;
  name: string;
  halfDayCents: number | null;
  fullDayCents: number | null;
}

interface Hold {
  id: string;
  heldBy: string;
  expiresAt: string;
  state: string;
}

const input = 'border border-[#e3e3e3] rounded-lg px-3 py-2 text-sm w-full';
const smallInput = 'border border-[#e3e3e3] rounded-lg px-2 py-1.5 text-xs';
const btn = 'bg-[#003580] hover:bg-[#005799] text-white font-semibold rounded-lg px-4 py-2 text-sm';

export default function VenuesManager() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [spaces, setSpaces] = useState<Record<string, Space[]>>({});
  const [holds, setHolds] = useState<Record<string, Hold[]>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [openHolds, setOpenHolds] = useState<Record<string, boolean>>({});
  const [name, setName] = useState('');
  const [standalone, setStandalone] = useState(false);
  const [spaceName, setSpaceName] = useState<Record<string, string>>({});
  const [halfDay, setHalfDay] = useState<Record<string, string>>({});
  const [fullDay, setFullDay] = useState<Record<string, string>>({});
  const [holdBy, setHoldBy] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/v1/supplier/venues');
    if (!res.ok) return;
    setVenues((await res.json()).venues ?? []);
  }, []);

  useEffect(() => {
    // Initial venues load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function addVenue() {
    setNotice('');
    const res = await fetch('/api/v1/supplier/venues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, standalone }),
    });
    if (!res.ok) {
      setNotice((await res.json()).error ?? 'Failed');
      return;
    }
    setName('');
    await load();
  }

  async function toggleSpaces(venueId: string) {
    const isOpen = !open[venueId];
    setOpen((o) => ({ ...o, [venueId]: isOpen }));
    if (isOpen) {
      const res = await fetch(`/api/v1/supplier/venues/${venueId}/spaces`);
      if (res.ok) {
        const data = (await res.json()) as { spaces: Space[] };
        setSpaces((prev) => ({ ...prev, [venueId]: data.spaces ?? [] }));
      }
    }
  }

  async function addSpace(venueId: string) {
    const res = await fetch(`/api/v1/supplier/venues/${venueId}/spaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: spaceName[venueId] || 'Main Hall',
        halfDayCents: halfDay[venueId] ? Math.round(Number(halfDay[venueId]) * 100) : undefined,
        fullDayCents: fullDay[venueId] ? Math.round(Number(fullDay[venueId]) * 100) : undefined,
      }),
    });
    if (!res.ok) {
      setNotice((await res.json()).error ?? 'Failed');
      return;
    }
    const r = await (await fetch(`/api/v1/supplier/venues/${venueId}/spaces`)).json();
    setSpaces((prev) => ({ ...prev, [venueId]: r.spaces ?? [] }));
  }

  async function toggleHolds(spaceId: string) {
    const isOpen = !openHolds[spaceId];
    setOpenHolds((o) => ({ ...o, [spaceId]: isOpen }));
    if (isOpen) {
      const res = await fetch(`/api/v1/supplier/spaces/${spaceId}/holds`);
      if (res.ok) {
        const data = (await res.json()) as { holds: Hold[] };
        setHolds((prev) => ({ ...prev, [spaceId]: data.holds ?? [] }));
      }
    }
  }

  async function addHold(spaceId: string) {
    const res = await fetch(`/api/v1/supplier/spaces/${spaceId}/holds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ heldBy: holdBy[spaceId] || 'front desk' }),
    });
    if (!res.ok) {
      setNotice((await res.json()).error ?? 'Failed');
      return;
    }
    const r = await (await fetch(`/api/v1/supplier/spaces/${spaceId}/holds`)).json();
    setHolds((prev) => ({ ...prev, [spaceId]: r.holds ?? [] }));
  }

  async function releaseHold(spaceId: string, holdId: string, state: string) {
    await fetch(`/api/v1/supplier/spaces/${spaceId}/holds`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ holdId, state }),
    });
    const r = await (await fetch(`/api/v1/supplier/spaces/${spaceId}/holds`)).json();
    setHolds((prev) => ({ ...prev, [spaceId]: r.holds ?? [] }));
  }

  return (
    <div className="mt-6 border-t border-[#f0f0f0] pt-4">
      <h3 className="font-semibold mb-2">Venues &amp; spaces</h3>
      {venues.map((v) => (
        <div key={v.id} className="border border-[#e3e3e3] rounded-[12px] p-3 mb-2">
          <button onClick={() => toggleSpaces(v.id)} className="font-semibold text-sm text-left">
            {v.name} <span className="text-[#999] font-normal">· {v.standalone ? 'standalone' : 'attached'} · {v.status}</span>
          </button>
          {open[v.id] && (
            <div className="mt-2 pl-2 space-y-2">
              {(spaces[v.id] ?? []).map((s) => (
                <div key={s.id} className="text-sm">
                  <button onClick={() => toggleHolds(s.id)} className="font-medium">
                    {s.name} <span className="text-[#999] font-normal">
                      · {s.halfDayCents != null ? `half ${(s.halfDayCents / 100).toFixed(2)}` : '—'} / {s.fullDayCents != null ? `full ${(s.fullDayCents / 100).toFixed(2)}` : '—'}
                    </span>
                  </button>
                  {openHolds[s.id] && (
                    <div className="mt-1 pl-2 space-y-1">
                      {(holds[s.id] ?? []).map((h) => (
                        <div key={h.id} className="text-xs font-mono text-[#444]">
                          {h.heldBy} · {h.state} · exp {new Date(h.expiresAt).toLocaleString()}{' '}
                          {h.state === 'held' && (
                            <>
                              <button onClick={() => releaseHold(s.id, h.id, 'released')} className="text-[#0071C2] ml-2">release</button>
                              <button onClick={() => releaseHold(s.id, h.id, 'converted')} className="text-[#0071C2] ml-2">convert</button>
                            </>
                          )}
                        </div>
                      ))}
                      <div className="flex gap-1.5">
                        <input className={smallInput} value={holdBy[s.id] ?? ''} onChange={(e) => setHoldBy((m) => ({ ...m, [s.id]: e.target.value }))} placeholder="Held by" />
                        <button onClick={() => addHold(s.id)} className="text-xs text-[#0071C2]">+ hold</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div className="flex gap-1.5">
                <input className={smallInput} value={spaceName[v.id] ?? ''} onChange={(e) => setSpaceName((m) => ({ ...m, [v.id]: e.target.value }))} placeholder="Space name" />
                <input className={smallInput} type="number" value={halfDay[v.id] ?? ''} onChange={(e) => setHalfDay((m) => ({ ...m, [v.id]: e.target.value }))} placeholder="Half-day BWP" />
                <input className={smallInput} type="number" value={fullDay[v.id] ?? ''} onChange={(e) => setFullDay((m) => ({ ...m, [v.id]: e.target.value }))} placeholder="Full-day BWP" />
                <button onClick={() => addSpace(v.id)} className="text-xs text-[#0071C2]">+ space</button>
              </div>
            </div>
          )}
        </div>
      ))}
      <div className="flex gap-2 mt-3">
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="New venue name" />
        <label className="text-xs flex items-center gap-1">
          <input type="checkbox" checked={standalone} onChange={(e) => setStandalone(e.target.checked)} /> standalone
        </label>
        <button className={btn} onClick={addVenue}>Add</button>
      </div>
      {notice && <p className="mt-2 text-sm text-[#b91c1c]">{notice}</p>}
    </div>
  );
}
