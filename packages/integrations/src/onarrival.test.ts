import { describe, expect, it } from 'vitest';
import { createFlightOrder, mapOnArrivalOffer, searchFlightOffers } from './onarrival';

const request = {
  origin: 'GBE',
  destination: 'MUB',
  departureDate: '2026-12-10',
  adults: 1,
  children: [],
  infants: 0,
  currency: 'BWP',
};

describe('OnArrival flight offers', () => {
  it('fills the requested route and presentation fields in sandbox', async () => {
    const { offers } = await searchFlightOffers(request, {
      apiKey: '',
      baseUrl: 'https://example.invalid',
      sandbox: true,
    });

    expect(offers).toHaveLength(3);
    expect(offers[0]).toMatchObject({
      origin: 'GBE',
      destination: 'MUB',
      departureDate: '2026-12-10',
      departureTime: '10:15',
      arrivalTime: '11:55',
      stops: 0,
      airline: 'Qatar Airways',
      baseMinor: 542_000,
    });
    expect(offers[2]).toMatchObject({ stops: 1, refundable: false, baseMinor: 420_000 });
  });

  it('parses the gateway summary when structured fields are absent', () => {
    const offer = mapOnArrivalOffer(
      {
        id: 'offer-1',
        type: 'NDC',
        flight: 'QR1362 GAB→JNB 10:15-11:55 Direct 1h40m 23kg base 5420 trust 88',
      },
      { origin: 'GBE', destination: 'MUB', departureDate: '2026-12-10' },
    );

    expect(offer).toMatchObject({
      offerId: 'offer-1',
      origin: 'GAB',
      destination: 'JNB',
      departureDate: '2026-12-10',
      departureTime: '10:15',
      arrivalTime: '11:55',
      durationMinutes: 100,
      stops: 0,
      baseMinor: 542_000,
    });
  });

  it('prefers structured gateway fields over the summary fallback', () => {
    const offer = mapOnArrivalOffer({
      api: { token: 'encrypted-token' },
      flight: 'Synthetic summary',
      type: 'GDS',
      origin: 'jnb',
      destination: 'mub',
      departureTime: '08:00',
      arrivalTime: '09:30',
      durationMinutes: 90,
      stops: 0,
      airline: 'Airlink',
      refundable: true,
    });

    expect(offer).toMatchObject({
      offerId: 'encrypted-token',
      origin: 'JNB',
      destination: 'MUB',
      departureTime: '08:00',
      arrivalTime: '09:30',
      durationMinutes: 90,
      airline: 'Airlink',
      refundable: true,
    });
  });

  it('returns a sandbox order for a valid offer', async () => {
    const order = await createFlightOrder(
      { offerId: 'off_abc123', paymentToken: 'demo', passengers: [{ type: 'ADT' }] },
      { apiKey: '', baseUrl: 'https://example.invalid', sandbox: true },
    );
    expect(order).toMatchObject({ orderId: 'ord_off_abc123', pnr: 'ABC123' });
  });
});
