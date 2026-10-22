'use client';

import Link from 'next/link';
import { useState } from 'react';

interface HotelOffer {
  hotelId: string;
  offerId: string;
  name: string;
  net: number;
  retail: number;
  freeCancel: string | null;
  badges: string[];
  imageUrl?: string;
}

interface FlightOffer {
  offerId: string;
  flight: string;
  type: string;
  bags?: string;
  baseMinor?: number;
  imageUrl?: string;
  origin?: string;
  destination?: string;
  departureDate?: string;
  departureTime?: string;
  arrivalTime?: string;
  durationMinutes?: number;
  stops?: number;
  airline?: string;
  fareBrand?: string;
}

interface FlightPricing {
  offerId: string;
  totalCents: number | null;
  currency: string;
}

function TileImage({ src, label }: { src?: string; label: string }) {
  if (!src) {
    return <div className={thumb}>280×240</div>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={label} className={`${thumb} object-cover`} />
  );
}

function getCartId(): string {
  let id = localStorage.getItem('ars_cart_id');
  if (!id) {
    id = `cart-${crypto.randomUUID()}`;
    localStorage.setItem('ars_cart_id', id);
  }
  return id;
}

async function addToCart(kind: 'hotel' | 'flight', offerId: string): Promise<number> {
  const res = await fetch('/api/v1/cart/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cartId: getCartId(), kind, offerId }),
  });
  if (!res.ok) throw new Error('Offer expired — search again');
  const data = await res.json();
  return data.cart.items.length as number;
}

const tile = 'flex gap-3 border border-[#e3e3e3] rounded-[16px] p-3 bg-white shadow-[0_4px_24px_rgba(0,0,0,0.04)]';
const thumb = 'w-[280px] h-[240px] max-w-[38%] shrink-0 rounded-[16px] bg-gradient-to-br from-[#003580] to-[#0071C2] border border-[#e3e3e3] grid place-items-center text-white/70 text-xs';
const priceCol = 'w-[200px] shrink-0 text-right flex flex-col justify-center gap-1';
const input = 'border border-[#e3e3e3] rounded-lg px-3 py-2 text-sm w-full';
const btn = 'bg-[#0071C2] hover:bg-[#005799] text-white font-semibold rounded-lg px-5 py-2.5 text-sm';

export default function SearchPage() {
  const [tab, setTab] = useState<'hotels' | 'flights'>('hotels');
  const [location, setLocation] = useState('Maun, BW');
  const [checkin, setCheckin] = useState('2026-12-10');
  const [checkout, setCheckout] = useState('2026-12-13');
  const [adults, setAdults] = useState(2);
  const [childAges, setChildAges] = useState<string>('7');
  const [origin, setOrigin] = useState('GBE');
  const [destination, setDestination] = useState('MUB');
  const [departureDate, setDepartureDate] = useState('2026-12-10');
  const [hotels, setHotels] = useState<HotelOffer[]>([]);
  const [flights, setFlights] = useState<FlightOffer[]>([]);
  const [flightPricing, setFlightPricing] = useState<Record<string, FlightPricing>>({});
  const [cartCount, setCartCount] = useState(0);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const childArray = childAges.split(',').map((s) => s.trim()).filter(Boolean).map(Number).filter((n) => !isNaN(n));

  async function searchHotels() {
    setLoading(true);
    setNotice('');
    try {
      const res = await fetch('/api/v1/hotels/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkin,
          checkout,
          occupancies: [{ adults, children: childArray, infants: [] }],
          location,
          currency: 'BWP',
          guestNationality: 'BW',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Search failed');
      setHotels(data.data);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function searchFlights() {
    setLoading(true);
    setNotice('');
    try {
      const res = await fetch('/api/v1/flights/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin, destination, departureDate, adults, children: childArray, infants: 0, currency: 'BWP' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Search failed');
      setFlights(data.offers);
      const pricing = (data.pricing ?? []) as FlightPricing[];
      setFlightPricing(Object.fromEntries(pricing.map((p) => [p.offerId, p])));
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function add(kind: 'hotel' | 'flight', offerId: string) {
    try {
      setCartCount(await addToCart(kind, offerId));
      setNotice('Added to cart');
    } catch (e) {
      setNotice((e as Error).message);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5]">
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <Link href="/" className="text-sm text-[#0071C2]">← ArriveSuite</Link>
          <h1 className="text-2xl font-bold tracking-tight">Search stays &amp; flights</h1>
          <Link
            href="/cart"
            className="ml-auto inline-flex items-center gap-1.5 border border-[#ffb4b4] bg-[#ffeaea] text-[#b91c1c] px-3 py-1.5 rounded-full text-xs font-mono"
          >
            <span className="w-2 h-2 rounded-full bg-[#b91c1c] animate-pulse" />
            cart • {cartCount} items
          </Link>
        </div>

        <div className="mb-4 flex gap-2">
          {(['hotels', 'flights'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === t ? 'bg-[#003580] text-white' : 'bg-white border border-[#e3e3e3]'}`}
            >
              {t === 'hotels' ? 'Hotels' : 'Flights'}
            </button>
          ))}
        </div>

        {tab === 'hotels' ? (
          <div className="bg-white border border-[#e3e3e3] rounded-[16px] p-4 mb-6 grid md:grid-cols-5 gap-3">
            <input className={input} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location" />
            <input className={input} type="date" value={checkin} onChange={(e) => setCheckin(e.target.value)} />
            <input className={input} type="date" value={checkout} onChange={(e) => setCheckout(e.target.value)} />
            <div className="flex gap-2">
              <input className={input} type="number" min={1} value={adults} onChange={(e) => setAdults(Number(e.target.value))} title="Adults" />
              <input
                className={input}
                value={childAges}
                onChange={(e) => setChildAges(e.target.value)}
                placeholder="Child ages"
                title="Child ages, comma separated — per-hotel bands are configurable, not hardcoded"
              />
            </div>
            <button className={btn} onClick={searchHotels} disabled={loading}>{loading ? '…' : 'Search'}</button>
          </div>
        ) : (
          <div className="bg-white border border-[#e3e3e3] rounded-[16px] p-4 mb-6 grid md:grid-cols-5 gap-3">
            <input className={input} value={origin} onChange={(e) => setOrigin(e.target.value.toUpperCase())} placeholder="From" maxLength={3} />
            <input className={input} value={destination} onChange={(e) => setDestination(e.target.value.toUpperCase())} placeholder="To" maxLength={3} />
            <input className={input} type="date" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} />
            <input className={input} type="number" min={1} value={adults} onChange={(e) => setAdults(Number(e.target.value))} title="Adults" />
            <button className={btn} onClick={searchFlights} disabled={loading}>{loading ? '…' : 'Search'}</button>
          </div>
        )}

        {notice && <p className="mb-4 text-sm text-[#666]">{notice}</p>}

        <div className="space-y-3">
          {tab === 'hotels' && hotels.map((h) => (
            <div key={h.offerId} className={tile}>
              <TileImage src={h.imageUrl} label={h.name} />
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-semibold">{h.name}</div>
                <div className="text-xs text-[#666] mt-1">net {h.net} → retail {h.retail} BWP</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {h.badges.map((b) => (
                    <span key={b} className="inline-flex items-center border border-[#d0e8d0] rounded-full px-2 py-0.5 text-[11px]">{b}</span>
                  ))}
                </div>
                {h.freeCancel && <div className="mt-2 text-[11px]"><span className="bg-[#e7f9ed] text-[#0a7a2a] px-1.5 py-0.5 rounded">Free cancel until {h.freeCancel}</span></div>}
              </div>
              <div className={priceCol}>
                <div className="text-[22px] font-bold">BWP {(h.retail / 100).toFixed(2)}</div>
                <button className={btn} onClick={() => add('hotel', h.offerId)}>Add to cart</button>
              </div>
            </div>
          ))}
          {tab === 'flights' && flights.map((f) => {
            const pricing = flightPricing[f.offerId];
            const stops = f.stops == null ? null : f.stops === 0 ? 'Direct' : `${f.stops} stop${f.stops === 1 ? '' : 's'}`;
            return (
              <div key={f.offerId} className={tile}>
                <TileImage src={f.imageUrl} label={f.flight} />
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/flights/offer?offerId=${encodeURIComponent(f.offerId)}&adults=${adults}&children=${childArray.length}&infants=0`}
                    className="text-[15px] font-semibold hover:text-[#0071C2]"
                  >
                    {f.flight}
                  </Link>
                  <div className="mt-1 text-xs text-[#666]">
                    {[f.origin && f.destination ? `${f.origin} → ${f.destination}` : null, f.departureTime && f.arrivalTime ? `${f.departureTime}–${f.arrivalTime}` : null, stops]
                      .filter(Boolean)
                      .join(' • ')}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center border border-[#d0e8d0] rounded-full px-2 py-0.5 text-[11px]">{f.type}</span>
                    {f.bags && <span className="inline-flex items-center border border-[#e3e3e3] rounded-full px-2 py-0.5 text-[11px]">{f.bags}</span>}
                    {f.fareBrand && <span className="inline-flex items-center border border-[#e3e3e3] rounded-full px-2 py-0.5 text-[11px]">{f.fareBrand}</span>}
                  </div>
                  <Link
                    href={`/flights/offer?offerId=${encodeURIComponent(f.offerId)}&adults=${adults}&children=${childArray.length}&infants=0`}
                    className="mt-2 inline-block text-xs font-semibold text-[#0071C2]"
                  >
                    View fare details →
                  </Link>
                </div>
                <div className={priceCol}>
                  <div className="text-[22px] font-bold">
                    {pricing?.totalCents != null
                      ? `${pricing.currency} ${(pricing.totalCents / 100).toFixed(2)}`
                      : 'Price at checkout'}
                  </div>
                  <button className={btn} onClick={() => add('flight', f.offerId)}>Add to cart</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
