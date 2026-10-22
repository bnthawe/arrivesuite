import type { Metadata } from 'next';
import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { getCachedOffer } from '@/lib/prebooks';
import { applyRouteMarkup } from '@/lib/route-pricing';
import FlightOfferActions from './actions';

export const metadata: Metadata = {
  title: 'Flight details — ArriveSuite',
  description: 'Review your fare before continuing to checkout.',
};

export const dynamic = 'force-dynamic';

function money(currency: string, cents: number): string {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

function duration(minutes?: number): string {
  if (minutes == null) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`;
}

function stopLabel(stops?: number): string {
  if (stops == null) return 'Stops confirmed at checkout';
  if (stops === 0) return 'Direct';
  return `${stops} stop${stops === 1 ? '' : 's'}`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[#f0f0f0] py-2 text-sm last:border-0">
      <span className="text-[#666]">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function MissingOffer() {
  return (
    <main className="min-h-screen bg-[#f5f5f5]">
      <div className="container mx-auto max-w-3xl px-4 py-16">
        <div className="rounded-[16px] border border-[#e3e3e3] bg-white p-6">
          <h1 className="text-xl font-bold">This fare has expired</h1>
          <p className="mt-2 text-sm text-[#666]">
            Airline fares are held for a short time. Search again to see current
            prices and availability.
          </p>
          <Link
            href="/search"
            className="mt-5 inline-block rounded-lg bg-[#0071C2] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#005799]"
          >
            Back to search
          </Link>
        </div>
      </div>
    </main>
  );
}

export default async function FlightOfferPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const query = await searchParams;
  const offerId = typeof query.offerId === 'string' ? query.offerId : '';
  if (!offerId) return <MissingOffer />;

  const fallbackAdultsRaw =
    typeof query.adults === 'string' ? Number.parseInt(query.adults, 10) : 1;
  const fallbackAdults = Number.isFinite(fallbackAdultsRaw)
    ? Math.min(9, Math.max(1, fallbackAdultsRaw))
    : 1;
  const fallbackChildrenRaw =
    typeof query.children === 'string' ? Number.parseInt(query.children, 10) : 0;
  const fallbackChildren = Number.isFinite(fallbackChildrenRaw)
    ? Math.min(9 - fallbackAdults, Math.max(0, fallbackChildrenRaw))
    : 0;
  const fallbackInfantsRaw =
    typeof query.infants === 'string' ? Number.parseInt(query.infants, 10) : 0;
  const fallbackInfants = Number.isFinite(fallbackInfantsRaw)
    ? Math.min(9 - fallbackAdults - fallbackChildren, Math.max(0, fallbackInfantsRaw))
    : 0;

  let cached: Awaited<ReturnType<typeof getCachedOffer>>;
  try {
    cached = await getCachedOffer(offerId);
  } catch (err) {
    console.error('[flights.offer] cache read failed', err);
    return (
      <main className="min-h-screen bg-[#f5f5f5]">
        <div className="container mx-auto max-w-3xl px-4 py-16">
          <div className="rounded-[16px] border border-[#e3e3e3] bg-white p-6">
            <h1 className="text-xl font-bold">Fare details are temporarily unavailable</h1>
            <p className="mt-2 text-sm text-[#666]">Please try again in a moment.</p>
            <Link href="/search" className="mt-5 inline-block text-sm text-[#0071C2]">
              ← Back to search
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!cached || cached.kind !== 'flight') return <MissingOffer />;

  const offer = cached.offer;
  const origin = offer.origin ?? cached.route?.origin;
  const destination = offer.destination ?? cached.route?.destination;
  const currency = cached.currency;
  // The fare is priced for the search occupancy stored in the cache. URL
  // counts are only a fallback for old offers; they cannot change the price.
  const adults = cached.occupancy?.adults ?? fallbackAdults;
  const children = cached.occupancy?.children ?? fallbackChildren;
  const infants = cached.occupancy?.infants ?? fallbackInfants;
  const totalTravellers = adults + children + infants;
  const checkoutId = randomUUID();
  const checkoutHref = `/flights/checkout?offerId=${encodeURIComponent(offerId)}&adults=${adults}&children=${children}&infants=${infants}&checkoutId=${checkoutId}`;

  let price: { netCents: number; markupCents: number; totalCents: number } | null = null;
  if (offer.baseMinor != null) {
    try {
      const [priced] = await applyRouteMarkup(
        [
          {
            itemType: 'flight',
            itemRef: offer.offerId,
            netCents: offer.baseMinor,
            origin,
            destination,
          },
        ],
        'b2c',
      );
      price = {
        netCents: priced.netCents,
        markupCents: priced.markupCents,
        totalCents: priced.netCents + priced.markupCents,
      };
    } catch (err) {
      console.error('[flights.offer] pricing failed', err);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5]">
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <div className="mb-5 flex items-center gap-3">
          <Link href="/search" className="text-sm text-[#0071C2]">
            ← Search
          </Link>
          <h1 className="text-xl font-bold tracking-tight">Flight details</h1>
          <span className="ml-auto rounded-full border border-[#d0e8d0] bg-[#e7f9ed] px-3 py-1 text-[11px] font-medium text-[#0a7a2a]">
            Fare refreshed at checkout
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <section className="rounded-[16px] border border-[#e3e3e3] bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#666]">
                    {offer.airline ?? 'Airline'}
                  </p>
                  <p className="mt-1 text-sm text-[#444]">{offer.flight}</p>
                </div>
                <span className="rounded-full border border-[#d0e8d0] px-2.5 py-1 text-[11px]">
                  {offer.type}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-4 rounded-xl bg-[#f7faff] p-4">
                <div>
                  <div className="text-2xl font-bold">{origin ?? '—'}</div>
                  <div className="mt-1 text-sm text-[#666]">{offer.departureTime ?? 'Time at checkout'}</div>
                  <div className="text-[11px] text-[#888]">Departure</div>
                </div>
                <div className="text-center text-[#0071C2]">
                  <div className="text-[11px] text-[#666]">{duration(offer.durationMinutes)}</div>
                  <div className="my-1 h-px w-20 bg-[#b9d7ee]" />
                  <div className="text-[11px]">{stopLabel(offer.stops)}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold">{destination ?? '—'}</div>
                  <div className="mt-1 text-sm text-[#666]">{offer.arrivalTime ?? 'Time at checkout'}</div>
                  <div className="text-[11px] text-[#888]">Arrival</div>
                </div>
              </div>

              <p className="mt-3 text-[11px] text-[#777]">
                {offer.departureDate ?? 'Date confirmed at checkout'}
                {offer.ticketingDeadline ? ` • Ticket by ${offer.ticketingDeadline}` : ''}
              </p>
            </section>

            <section className="rounded-[16px] border border-[#e3e3e3] bg-white p-5">
              <h2 className="text-sm font-bold">Fare includes</h2>
              <div className="mt-2">
                <Row label="Cabin / fare" value={offer.fareBrand ?? 'Economy'} />
                <Row label="Baggage" value={offer.bags ?? 'See airline rules'} />
                <Row label="Stops" value={stopLabel(offer.stops)} />
                <Row
                  label="Changes / refunds"
                  value={
                    offer.refundable == null
                      ? 'Confirmed at checkout'
                      : offer.refundable
                        ? 'Refundable under fare rules'
                        : 'Non-refundable'
                  }
                />
                <Row label="Ticketing" value="Issued after payment" />
              </div>
            </section>

            <section className="rounded-[16px] border border-[#e3e3e3] bg-white p-5">
              <h2 className="text-sm font-bold">Before you book</h2>
              <p className="mt-2 text-xs leading-5 text-[#666]">
                Sourced flights are fulfilled by the airline. ArriveSuite is the booking
                agent, not the carrier. The final fare and availability are rechecked
                when you continue to checkout.
              </p>
            </section>
          </div>

          <aside className="h-fit rounded-[16px] border border-[#e3e3e3] bg-white p-5 md:sticky md:top-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#666]">
              Total for {totalTravellers} traveller{totalTravellers === 1 ? '' : 's'}
            </p>
            <div className="mt-2 text-3xl font-bold">
              {price ? money(currency, price.totalCents) : 'Price on request'}
            </div>
            <p className="mt-1 text-[11px] text-[#777]">Including taxes and service fee</p>

            {price && (
              <div className="mt-4 border-t border-[#eee] pt-3">
                <Row label="Airline fare" value={money(currency, price.netCents)} />
                <Row label="ArriveSuite service fee" value={money(currency, price.markupCents)} />
                <Row label="Total" value={money(currency, price.totalCents)} />
              </div>
            )}

            <div className="mt-5">
              <FlightOfferActions
                offerId={offerId}
                checkoutHref={checkoutHref}
                disabled={!price}
              />
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
