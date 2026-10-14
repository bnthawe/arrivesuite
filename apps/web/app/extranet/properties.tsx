'use client';

import { useCallback, useEffect, useState } from 'react';

interface Property {
  id: string;
  name: string;
  type: string;
  status: string;
}

interface Room {
  id: string;
  name: string;
  maxAdults: number;
  maxChildren: number;
  unitCount: number;
}

interface Rate {
  id: string;
  name: string;
  mealPlan: string | null;
  baseNightlyCents: number;
  minStay: number;
  status: string;
}

const input = 'border border-[#e3e3e3] rounded-lg px-3 py-2 text-sm w-full';
const smallInput = 'border border-[#e3e3e3] rounded-lg px-2 py-1.5 text-xs';
const btn = 'bg-[#003580] hover:bg-[#005799] text-white font-semibold rounded-lg px-4 py-2 text-sm';

export default function PropertiesManager() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [rooms, setRooms] = useState<Record<string, Room[]>>({});
  const [rates, setRates] = useState<Record<string, Rate[]>>({});
  const [openRooms, setOpenRooms] = useState<Record<string, boolean>>({});
  const [openRates, setOpenRates] = useState<Record<string, boolean>>({});
  const [name, setName] = useState('');
  const [type, setType] = useState('lodge');
  const [roomName, setRoomName] = useState<Record<string, string>>({});
  const [rateName, setRateName] = useState<Record<string, string>>({});
  const [ratePrice, setRatePrice] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/v1/supplier/properties');
    if (!res.ok) return;
    setProperties((await res.json()).properties ?? []);
  }, []);

  useEffect(() => {
    // Initial properties load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function addProperty() {
    setNotice('');
    const res = await fetch('/api/v1/supplier/properties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type }),
    });
    if (!res.ok) {
      setNotice((await res.json()).error ?? 'Failed');
      return;
    }
    setName('');
    await load();
  }

  async function setStatus(id: string, status: string) {
    setNotice('');
    const res = await fetch(`/api/v1/supplier/properties/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) setNotice((await res.json()).error ?? 'Failed');
    await load();
  }

  async function toggleRooms(propertyId: string) {
    const open = !openRooms[propertyId];
    setOpenRooms((o) => ({ ...o, [propertyId]: open }));
    if (open && !rooms[propertyId]) {
      const res = await fetch(`/api/v1/supplier/properties/${propertyId}/rooms`);
      if (res.ok) {
        const data = (await res.json()) as { rooms: Room[] };
        setRooms((r) => ({ ...r, [propertyId]: data.rooms ?? [] }));
      }
    }
  }

  async function addRoom(propertyId: string) {
    const res = await fetch(`/api/v1/supplier/properties/${propertyId}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: roomName[propertyId] || 'Standard Room' }),
    });
    if (!res.ok) {
      setNotice((await res.json()).error ?? 'Failed');
      return;
    }
    setRoomName((m) => ({ ...m, [propertyId]: '' }));
    const r = await (await fetch(`/api/v1/supplier/properties/${propertyId}/rooms`)).json();
    setRooms((prev) => ({ ...prev, [propertyId]: r.rooms ?? [] }));
  }

  async function toggleRates(roomId: string) {
    const open = !openRates[roomId];
    setOpenRates((o) => ({ ...o, [roomId]: open }));
    if (open && !rates[roomId]) {
      const res = await fetch(`/api/v1/supplier/rooms/${roomId}/rates`);
      if (res.ok) {
        const data = (await res.json()) as { rates: Rate[] };
        setRates((r) => ({ ...r, [roomId]: data.rates ?? [] }));
      }
    }
  }

  async function addRate(roomId: string) {
    const res = await fetch(`/api/v1/supplier/rooms/${roomId}/rates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: rateName[roomId] || 'Standard Rate',
        baseNightlyCents: Math.round(Number(ratePrice[roomId] || '0') * 100),
      }),
    });
    if (!res.ok) {
      setNotice((await res.json()).error ?? 'Failed');
      return;
    }
    const r = await (await fetch(`/api/v1/supplier/rooms/${roomId}/rates`)).json();
    setRates((prev) => ({ ...prev, [roomId]: r.rates ?? [] }));
  }

  return (
    <div className="mt-6 border-t border-[#f0f0f0] pt-4">
      <h3 className="font-semibold mb-2">Properties</h3>
      {properties.map((p) => (
        <div key={p.id} className="border border-[#e3e3e3] rounded-[12px] p-3 mb-2">
          <div className="flex items-center gap-2">
            <button onClick={() => toggleRooms(p.id)} className="font-semibold text-sm text-left">
              {p.name} <span className="text-[#999] font-normal">· {p.type}</span>
            </button>
            <span className="text-[11px] font-mono border rounded-full px-2 py-0.5">{p.status}</span>
            {p.status === 'draft' && (
              <button onClick={() => setStatus(p.id, 'published')} className="ml-auto text-xs text-[#0071C2]">publish</button>
            )}
            {p.status === 'published' && (
              <button onClick={() => setStatus(p.id, 'disabled')} className="ml-auto text-xs text-[#0071C2]">disable</button>
            )}
          </div>
          {openRooms[p.id] && (
            <div className="mt-2 pl-2 space-y-2">
              {(rooms[p.id] ?? []).map((rm) => (
                <div key={rm.id} className="text-sm">
                  <button onClick={() => toggleRates(rm.id)} className="font-medium">
                    {rm.name} <span className="text-[#999] font-normal">· {rm.unitCount} units · sleeps {rm.maxAdults}+{rm.maxChildren}</span>
                  </button>
                  {openRates[rm.id] && (
                    <div className="mt-1 pl-2 space-y-1">
                      {(rates[rm.id] ?? []).map((rt) => (
                        <div key={rt.id} className="text-xs font-mono text-[#444]">
                          {rt.name} · {(rt.baseNightlyCents / 100).toFixed(2)} · min {rt.minStay} · {rt.mealPlan ?? 'no meals'}
                        </div>
                      ))}
                      <div className="flex gap-1.5">
                        <input className={smallInput} value={rateName[rm.id] ?? ''} onChange={(e) => setRateName((m) => ({ ...m, [rm.id]: e.target.value }))} placeholder="Rate name" />
                        <input className={smallInput} type="number" value={ratePrice[rm.id] ?? ''} onChange={(e) => setRatePrice((m) => ({ ...m, [rm.id]: e.target.value }))} placeholder="BWP/night" />
                        <button onClick={() => addRate(rm.id)} className="text-xs text-[#0071C2]">+ rate</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div className="flex gap-1.5">
                <input className={smallInput} value={roomName[p.id] ?? ''} onChange={(e) => setRoomName((m) => ({ ...m, [p.id]: e.target.value }))} placeholder="Room name" />
                <button onClick={() => addRoom(p.id)} className="text-xs text-[#0071C2]">+ room</button>
              </div>
            </div>
          )}
        </div>
      ))}
      <div className="flex gap-2 mt-3">
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="New property name" />
        <select className={input} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="lodge">lodge</option>
          <option value="hotel">hotel</option>
          <option value="guesthouse">guesthouse</option>
          <option value="inn">inn</option>
          <option value="motel">motel</option>
          <option value="bnb">bnb</option>
          <option value="camp">camp</option>
          <option value="villa">villa</option>
          <option value="self-catering">self-catering</option>
        </select>
        <button className={btn} onClick={addProperty}>Add</button>
      </div>
      {notice && <p className="mt-2 text-sm text-[#b91c1c]">{notice}</p>}
    </div>
  );
}
