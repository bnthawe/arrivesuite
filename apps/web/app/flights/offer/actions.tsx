'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';

function getCartId(): string {
  let id = localStorage.getItem('ars_cart_id');
  if (!id) {
    id = `cart-${crypto.randomUUID()}`;
    localStorage.setItem('ars_cart_id', id);
  }
  return id;
}

export default function FlightOfferActions({
  offerId,
  checkoutHref,
  disabled,
}: {
  offerId: string;
  checkoutHref: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  async function addToCart() {
    setBusy(true);
    setNotice('');
    try {
      const res = await fetch('/api/v1/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cartId: getCartId(), kind: 'flight', offerId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Offer expired — search again');
      router.push('/cart');
    } catch (err) {
      setNotice((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      <Link
        href={checkoutHref}
        aria-disabled={disabled}
        onClick={(event) => {
          if (disabled) event.preventDefault();
        }}
        className={`text-center font-semibold rounded-lg px-5 py-3 text-sm ${
          disabled
            ? 'bg-[#9bc4e5] text-white pointer-events-none'
            : 'bg-[#0071C2] hover:bg-[#005799] text-white'
        }`}
      >
        Continue to checkout
      </Link>
      <button
        type="button"
        onClick={() => void addToCart()}
        disabled={disabled || busy}
        className="border border-[#0071C2] text-[#0071C2] hover:bg-[#f0f7fc] disabled:border-[#9bc4e5] disabled:text-[#9bc4e5] font-semibold rounded-lg px-5 py-2.5 text-sm"
      >
        {busy ? 'Adding…' : 'Add to cart instead'}
      </button>
      {notice && <p className="text-xs text-[#b91c1c]">{notice}</p>}
      <p className="text-[11px] leading-4 text-[#666]">
        Checkout collects traveller details and payment. The airline order is created only after
        payment is confirmed.
      </p>
    </div>
  );
}
