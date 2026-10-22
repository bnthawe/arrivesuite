'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

type PassengerType = 'ADT' | 'CHD' | 'INF';

interface PassengerForm {
  type: PassengerType;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  passportNumber: string;
  nationality: string;
}

type EditableField = 'firstName' | 'lastName' | 'dateOfBirth' | 'passportNumber' | 'nationality';

function makeKey(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function typeLabel(type: PassengerType): string {
  if (type === 'CHD') return 'Child';
  if (type === 'INF') return 'Infant';
  return 'Adult';
}

async function readJson<T extends { error?: string }>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return { error: `Unexpected response (${res.status})` } as T;
  }
}

const input =
  'w-full rounded-lg border border-[#d9d9d9] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0071C2] focus:ring-1 focus:ring-[#0071C2]';

export default function CheckoutForm({
  offerId,
  checkoutId,
  currency,
  totalCents,
  adults,
  childCount,
  infants,
}: {
  offerId: string;
  checkoutId: string;
  currency: string;
  totalCents: number;
  adults: number;
  childCount: number;
  infants: number;
}) {
  const router = useRouter();
  const [passengers, setPassengers] = useState<PassengerForm[]>(() => [
    ...Array.from({ length: adults }, () => ({
      type: 'ADT' as const,
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      passportNumber: '',
      nationality: 'BW',
    })),
    ...Array.from({ length: childCount }, () => ({
      type: 'CHD' as const,
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      passportNumber: '',
      nationality: 'BW',
    })),
    ...Array.from({ length: infants }, () => ({
      type: 'INF' as const,
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      passportNumber: '',
      nationality: 'BW',
    })),
  ]);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [bookingRef, setBookingRef] = useState<string | null>(null);
  const [bookingAccess, setBookingAccess] = useState<string | null>(null);

  // A successful checkout must not be repeated with a fresh quote token: the
  // idempotency hash would differ and the server would reject it. Keep this key
  // for the booking attempt; retries after a payment failure reuse the booking.
  const checkoutKey = useRef(makeKey('checkout'));
  const paymentKey = useRef(makeKey('payment'));
  // Reuse the same signed quote across network retries so the idempotency
  // body hash stays stable. Clear it only after a definitive 4xx.
  const quoteRef = useRef<{ offerId: string; token: string } | null>(null);
  const sessionKey = `ars_flight_checkout:${checkoutId}`;

  // Restoring the in-progress booking is a sessionStorage subscription. The
  // state update must run after hydration, not during render.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const raw = sessionStorage.getItem(sessionKey);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as {
        checkoutId?: string;
        offerId?: string;
        arsRef?: string;
        accessToken?: string;
        email?: string;
        phone?: string;
        consent?: boolean;
        passengers?: unknown;
      };
      if (
        saved.checkoutId !== checkoutId ||
        saved.offerId !== offerId ||
        !saved.arsRef ||
        !saved.accessToken
      ) {
        return;
      }
      setBookingRef(saved.arsRef);
      setBookingAccess(saved.accessToken);
      if (typeof saved.email === 'string') setEmail(saved.email);
      if (typeof saved.phone === 'string') setPhone(saved.phone);
      setConsent(saved.consent === true);

      // Restore the locked traveller rows so a reload can retry payment
      // without asking for passport data again. The rows are display-only once
      // bookingRef is set; the booking is already persisted server-side.
      if (Array.isArray(saved.passengers)) {
        const restored: PassengerForm[] = [];
        for (const value of saved.passengers) {
          if (!value || typeof value !== 'object') continue;
          const row = value as Partial<PassengerForm>;
          if (
            (row.type !== 'ADT' && row.type !== 'CHD' && row.type !== 'INF') ||
            typeof row.firstName !== 'string' ||
            typeof row.lastName !== 'string'
          ) {
            continue;
          }
          restored.push({
            type: row.type,
            firstName: row.firstName,
            lastName: row.lastName,
            dateOfBirth: typeof row.dateOfBirth === 'string' ? row.dateOfBirth : '',
            passportNumber:
              typeof row.passportNumber === 'string' ? row.passportNumber : '',
            nationality: typeof row.nationality === 'string' ? row.nationality : '',
          });
        }
        setPassengers((current) =>
          restored.length === current.length ? restored : current,
        );
      }
    } catch {
      sessionStorage.removeItem(sessionKey);
    }
  }, [checkoutId, offerId, sessionKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function updatePassenger(index: number, field: EditableField, value: string) {
    setPassengers((current) =>
      current.map((passenger, i) => (i === index ? { ...passenger, [field]: value } : passenger)),
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice(bookingRef ? 'Opening DPO Pay…' : 'Preparing your booking…');

    const lead = passengers[0];
    if (!lead) {
      setError('At least one passenger is required.');
      setBusy(false);
      return;
    }

    const guestInfo = {
      firstName: lead.firstName.trim(),
      lastName: lead.lastName.trim(),
      email: email.trim(),
      phone: phone.trim(),
    };
    const normalizedPassengers = passengers.map((passenger) => ({
      type: passenger.type,
      firstName: passenger.firstName.trim(),
      lastName: passenger.lastName.trim(),
      ...(passenger.dateOfBirth ? { dateOfBirth: passenger.dateOfBirth } : {}),
      ...(passenger.passportNumber.trim()
        ? { passportNumber: passenger.passportNumber.trim() }
        : {}),
      ...(passenger.nationality.trim()
        ? { nationality: passenger.nationality.trim().toUpperCase() }
        : {}),
    }));

    try {
      let ref = bookingRef;
      let access = bookingAccess;
      if (!ref) {
        let quoteToken =
          quoteRef.current?.offerId === offerId ? quoteRef.current.token : null;
        if (!quoteToken) {
          const quoteRes = await fetch('/api/v1/flights/quote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ offerId }),
          });
          const quote = await readJson<{ quoteToken?: string; error?: string }>(quoteRes);
          if (!quoteRes.ok || !quote.quoteToken) {
            throw new Error(quote.error ?? 'This fare has expired — search again.');
          }
          quoteToken = quote.quoteToken;
          quoteRef.current = { offerId, token: quoteToken };
        }

        const checkoutRes = await fetch('/api/v1/flights/checkout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': checkoutKey.current,
          },
          body: JSON.stringify({
            offerId,
            quoteToken,
            guestInfo,
            passengers: normalizedPassengers,
          }),
        });
        const checkout = await readJson<{
          arsRef?: string;
          accessToken?: string;
          error?: string;
        }>(checkoutRes);
        if (!checkoutRes.ok || !checkout.arsRef || !checkout.accessToken) {
          // Definitive 4xx responses are cached under this key; a retry needs a
          // fresh key. Keep the key and quote on 5xx/network ambiguity so the
          // server can replay a booking that was actually created.
          if (checkoutRes.status >= 400 && checkoutRes.status < 500) {
            checkoutKey.current = makeKey('checkout');
            quoteRef.current = null;
          }
          throw new Error(checkout.error ?? 'We could not create your booking.');
        }
        ref = checkout.arsRef;
        access = checkout.accessToken;
        setBookingRef(ref);
        setBookingAccess(access);
        sessionStorage.setItem(
          sessionKey,
          JSON.stringify({
            checkoutId,
            offerId,
            arsRef: ref,
            accessToken: access,
            email: guestInfo.email,
            phone: guestInfo.phone,
            consent,
            passengers: normalizedPassengers,
          }),
        );
      }

      if (!access) {
        throw new Error('Booking access expired — reload checkout and try again.');
      }
      if (!guestInfo.email || !guestInfo.phone) {
        throw new Error(
          'The booking contact details are missing — reload checkout to retry payment.',
        );
      }

      setNotice('Opening DPO Pay…');
      const paymentRes = await fetch('/api/v1/payments/init', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': paymentKey.current,
        },
        body: JSON.stringify({
          bookingRef: ref,
          email: guestInfo.email,
          method: 'dpo',
          firstName: guestInfo.firstName,
          lastName: guestInfo.lastName,
          returnTo: 'confirmation',
          accessToken: access,
        }),
      });
      const payment = await readJson<{ authorizationUrl?: string; error?: string }>(paymentRes);
      if (payment.authorizationUrl) {
        // 201 for a new hosted page, or 409 with a resumable DPO page after a
        // reload/tab retry. Either way the payer goes to DPO, not an error.
        setNotice('Redirecting to DPO Pay…');
        window.location.assign(payment.authorizationUrl);
        return;
      }
      if (!paymentRes.ok) {
        if (paymentRes.status === 409 && payment.error?.toLowerCase().includes('already paid')) {
          router.push(
            `/bookings/${encodeURIComponent(ref)}/confirmation?token=${encodeURIComponent(access)}`,
          );
          return;
        }
        paymentKey.current = makeKey('payment');
        throw new Error(payment.error ?? 'Payment could not be started. Please try again.');
      }
      paymentKey.current = makeKey('payment');
      throw new Error('Payment could not be started. Please try again.');
    } catch (err) {
      setError((err as Error).message);
      setNotice('');
      setBusy(false);
    }
  }

  const totalLabel = `${currency} ${(totalCents / 100).toFixed(2)}`;

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4">
      <fieldset disabled={Boolean(bookingRef)} className="space-y-4">
      {bookingRef && (
        <p className="rounded-lg border border-[#d0e8d0] bg-[#f2fbf5] px-4 py-2 text-[11px] text-[#0a7a2a]">
          Booking {bookingRef} is created. Traveller details are locked; retry payment below.
        </p>
      )}
      <section className="rounded-[16px] border border-[#e3e3e3] bg-white p-5">
        <h2 className="text-sm font-bold">Contact details</h2>
        <p className="mt-1 text-xs text-[#777]">
          We send your booking confirmation and ticket updates to these details.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-[#444]">
            Email
            <input
              className={`${input} mt-1`}
              type="email"
              autoComplete="email"
              required
              maxLength={255}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="text-xs font-medium text-[#444]">
            WhatsApp / mobile
            <input
              className={`${input} mt-1`}
              type="tel"
              autoComplete="tel"
              required
              minLength={5}
              maxLength={30}
              placeholder="+267 …"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="rounded-[16px] border border-[#e3e3e3] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold">Travellers</h2>
            <p className="mt-1 text-xs text-[#777]">
              Names must match the traveller&apos;s passport or national ID.
            </p>
          </div>
          <Link href="/search" className="text-xs font-semibold text-[#0071C2]">
            Change traveller count
          </Link>
        </div>

        <div className="mt-3 space-y-3">
          {passengers.map((passenger, index) => (
            <div key={index} className="rounded-xl border border-[#eee] bg-[#fafafa] p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xs font-semibold text-[#333]">
                  Passenger {index + 1} · {typeLabel(passenger.type)}
                </h3>
                {index === 0 && (
                  <span className="rounded-full bg-[#e7f9ed] px-2 py-0.5 text-[10px] font-medium text-[#0a7a2a]">
                    Lead guest
                  </span>
                )}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-[#444]">
                  First name
                  <input
                    className={`${input} mt-1`}
                    required
                    maxLength={100}
                    autoComplete={index === 0 ? 'given-name' : 'off'}
                    value={passenger.firstName}
                    onChange={(event) => updatePassenger(index, 'firstName', event.target.value)}
                  />
                </label>
                <label className="text-xs font-medium text-[#444]">
                  Last name
                  <input
                    className={`${input} mt-1`}
                    required
                    maxLength={100}
                    autoComplete={index === 0 ? 'family-name' : 'off'}
                    value={passenger.lastName}
                    onChange={(event) => updatePassenger(index, 'lastName', event.target.value)}
                  />
                </label>
                <label className="text-xs font-medium text-[#444]">
                  Date of birth
                  <input
                    className={`${input} mt-1`}
                    type="date"
                    required
                    value={passenger.dateOfBirth}
                    onChange={(event) => updatePassenger(index, 'dateOfBirth', event.target.value)}
                  />
                </label>
                <label className="text-xs font-medium text-[#444]">
                  Passport number <span className="font-normal text-[#999]">(optional)</span>
                  <input
                    className={`${input} mt-1`}
                    maxLength={50}
                    value={passenger.passportNumber}
                    onChange={(event) =>
                      updatePassenger(index, 'passportNumber', event.target.value)
                    }
                  />
                </label>
                <label className="text-xs font-medium text-[#444]">
                  Nationality
                  <input
                    className={`${input} mt-1`}
                    maxLength={2}
                    value={passenger.nationality}
                    onChange={(event) =>
                      updatePassenger(index, 'nationality', event.target.value.toUpperCase())
                    }
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      </section>
      </fieldset>

      <section className="rounded-[16px] border border-[#e3e3e3] bg-white p-5">
        <h2 className="text-sm font-bold">Payment</h2>
        <div className="mt-3 rounded-xl border border-[#b9d7ee] bg-[#f7faff] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">DPO Pay</p>
              <p className="mt-0.5 text-xs text-[#666]">
                Card, bank transfer, or mobile money. You will complete payment on DPO&apos;s
                secure hosted page.
              </p>
            </div>
            <span className="rounded-full border border-[#b9d7ee] bg-white px-2.5 py-1 text-[10px] font-semibold text-[#005799]">
              Secure
            </span>
          </div>
        </div>
        <label className="mt-3 flex items-start gap-2 text-xs leading-5 text-[#555]">
          <input
            type="checkbox"
            required
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-0.5"
          />
          <span>
            I agree to the airline fare rules and ArriveSuite&apos;s booking terms. I understand
            the fare is not guaranteed until the airline ticket is issued.
          </span>
        </label>
      </section>

      <div aria-live="polite" className="space-y-2">
        {notice && <p className="text-xs text-[#666]">{notice}</p>}
        {error && (
          <div className="rounded-lg border border-[#f3b4b4] bg-[#fdecec] px-4 py-3 text-xs text-[#a61b1b]">
            <p>{error}</p>
            <Link href="/search" className="mt-1 inline-block font-semibold underline">
              Search again
            </Link>
          </div>
        )}
        {bookingRef && !error && (
          <p className="text-[11px] text-[#777]">
            Booking reference {bookingRef} has been created. If payment did not open, retry below.
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={busy || !consent}
        className="w-full rounded-lg bg-[#0071C2] px-5 py-3 text-sm font-semibold text-white hover:bg-[#005799] disabled:cursor-not-allowed disabled:bg-[#9bc4e5]"
      >
        {busy
          ? notice || 'Please wait…'
          : bookingRef
            ? `Retry DPO Pay · ${totalLabel}`
            : `Pay ${totalLabel} with DPO Pay`}
      </button>
      <p className="text-center text-[11px] text-[#888]">
        You will leave ArriveSuite to pay on DPO&apos;s hosted page.
      </p>
    </form>
  );
}
