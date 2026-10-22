import type { Metadata } from 'next';
import Link from 'next/link';
import { getCachedOffer } from '@/lib/prebooks';
import { applyRouteMarkup } from '@/lib/route-pricing';
import CheckoutForm from './checkout-form';

export const metadata: Metadata = {
  title: 'Flight checkout — ArriveSuite',
  description: 'Enter traveller details and pay securely with DPO Pay.',
};

// The checkout page reads the short-lived offer cache and must not be
// statically cached with another user's fare.
export const dynamic = 'force-dynamic';

function money(currency: string, cents: number): string {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

function Expired() {
  return (
    <main className="min-h-screen bg-[#f5f5f5]">
      <div className="container mx-auto max-w-3xl px-4 py-16">
        <div className="rounded-[16px] border border-[#e3e3e3] bg-white p-6">
          <h1 className="text-xl font-bold">This fare has expired</h1>
          <p className="mt-2 text-sm text-[#666]">
            Airline fares are held for a short time. Search again to see current prices and
            availability.
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

export default async function FlightCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const query = await searchParams;
  const offerId = typeof query.offerId === 'string' ? query.offerId : '';
  const checkoutId = typeof query.checkoutId === 'string' ? query.checkoutId : offerId;
  if (!offerId) return <Expired />;

  let cached: Awaited<ReturnType<typeof getCachedOffer>>;
  try {
    cached = await getCachedOffer(offerId);
  } catch (err) {
    console.error('[flights.checkout.page] cache read failed', err);
    return (
      <main className="min-h-screen bg-[#f5f5f5]">
        <div className="container mx-auto max-w-3xl px-4 py-16">
          <div className="rounded-[16px] border border-[#e3e3e3] bg-white p-6">
            <h1 className="text-xl font-bold">Checkout is temporarily unavailable</h1>
            <p className="mt-2 text-sm text-[#666]">Please try again in a moment.</p>
            <Link href="/search" className="mt-5 inline-block text-sm text-[#0071C2]">
              ← Back to search
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!cached || cached.kind !== 'flight') return <Expired />;
  const offer = cached.offer;
  if (offer.baseMinor == null || !cached.occupancy) return <Expired />;

  const adults = cached.occupancy.adults;
  const children = cached.occupancy.children;
  const infants = cached.occupancy.infants;
  const totalTravellers = adults + children + infants;

  let price: { netCents: number; markupCents: number; totalCents: number } | null = null;
  try {
    const [priced] = await applyRouteMarkup(
      [
        {
          itemType: 'flight',
          itemRef: offer.offerId,
          netCents: offer.baseMinor,
          origin: offer.origin ?? cached.route?.origin,
          destination: offer.destination ?? cached.route?.destination,
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
    console.error('[flights.checkout.page] pricing failed', err);
  }

  if (!price) {
    return (
      <main className="min-h-screen bg-[#f5f5f5]">
        <div className="container mx-auto max-w-3xl px-4 py-16">
          <div className="rounded-[16px] border border-[#e3e3e3] bg-white p-6">
            <h1 className="text-xl font-bold">We could not price this fare</h1>
            <p className="mt-2 text-sm text-[#666]">Please search again for current prices.</p>
            <Link href="/search" className="mt-5 inline-block text-sm text-[#0071C2]">
              ← Back to search
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const currency = cached.currency;
  return (
    <main className="min-h-screen bg-[#f5f5f5]">
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <div className="mb-5 flex items-center gap-3">
          <Link
            href={`/flights/offer?offerId=${encodeURIComponent(offer.offerId)}&adults=${adults}&children=${children}`}
            className="text-sm text-[#0071C2]"
          >
            ← Fare details
          </Link>
          <h1 className="text-xl font-bold tracking-tight">Secure checkout</h1>
          <span className="ml-auto text-[11px] text-[#777]">Payment by DPO Pay</span>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_320px]">
          <CheckoutForm
            offerId={offer.offerId}
            checkoutId={checkoutId}
            currency={currency}
            totalCents={price.totalCents}
            adults={adults}
            childCount={children}
            infants={infants}
          />

          <aside className="h-fit rounded-[16px] border border-[#e3e3e3] bg-white p-5 md:sticky md:top-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#666]">
              Your trip
            </p>
            <div className="mt-2">
              <p className="text-lg font-bold">
                {offer.origin ?? '—'} → {offer.destination ?? '—'}
              </p>
              <p className="mt-1 text-sm text-[#555]">{offer.airline ?? 'Airline'}</p>
              <p className="text-xs text-[#777]">
                {[offer.flight, offer.departureDate, offer.departureTime]
                  .filter(Boolean)
                  .join(' • ')}
              </p>
              <p className="mt-2 text-xs text-[#777]">
                {totalTravellers} traveller{totalTravellers === 1 ? '' : 's'}
                {totalTravellers > 1
                  ? ` (${[
                      `${adults} adult${adults === 1 ? '' : 's'}`,
                      children > 0 ? `${children} child${children === 1 ? '' : 'ren'}` : null,
                      infants > 0 ? `${infants} infant${infants === 1 ? '' : 's'}` : null,
                    ]
                      .filter(Boolean)
                      .join(', ')})`
                  : ''}
              </p>
            </div>

            <div className="mt-4 border-t border-[#eee] pt-3 text-sm">
              <div className="flex justify-between gap-4 py-1">
                <span className="text-[#666]">Airline fare</span>
                <span className="font-medium">{money(currency, price.netCents)}</span>
              </div>
              <div className="flex justify-between gap-4 py-1">
                <span className="text-[#666]">ArriveSuite service fee</span>
                <span className="font-medium">{money(currency, price.markupCents)}</span>
              </div>
              <div className="mt-2 flex justify-between gap-4 border-t border-[#eee] pt-2 text-base">
                <span className="font-semibold">Total</span>
                <span className="font-bold">{money(currency, price.totalCents)}</span>
              </div>
            </div>

            <p className="mt-4 text-[11px] leading-4 text-[#777]">
              The fare is held while you pay. If the airline rejects the fare, we will not
              silently re-price it; our team will contact you.
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}
