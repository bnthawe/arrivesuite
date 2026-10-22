import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cancelFlightOrder,
  createFlightOrder,
  getFlightCancellationQuote,
  mapOnArrivalOffer,
  searchFlightOffers,
} from './onarrival';

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

  it('returns a sandbox cancellation quote and cancellation', async () => {
    const cfg = { apiKey: '', baseUrl: 'https://example.invalid', sandbox: true };
    const quote = await getFlightCancellationQuote('ord_off_abc123', cfg);
    expect(quote).toMatchObject({
      cancellable: true,
      supportRequired: false,
      reasons: [{ code: 'CR01', display: 'My plans changed' }],
      estimatedRefundMinor: null,
    });

    const cancelled = await cancelFlightOrder(
      { orderId: 'ord_off_abc123', code: 'CR01', reason: 'My plans changed' },
      cfg,
    );
    expect(cancelled).toMatchObject({
      orderId: 'ord_off_abc123',
      bookingStatus: 'CANCELLED',
      cancellationId: 'cancel_ord_off_abc123',
    });
  });

  it('maps live cancellation quote and cancel responses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'success',
            data: {
              cancellable: true,
              supportRequired: false,
              reasons: [{ code: 'CR01', display: 'My plans changed' }],
              refund: { totalRefundAmount: 1234.5 },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'success',
            data: {
              id: 'OAFLT10023451',
              bookingStatus: 'CANCELLATION_REQUESTED',
              cancellationTransactionInfos: [{ cancellationId: 'CXL-1' }],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const cfg = {
      apiKey: 'test-key',
      baseUrl: 'https://example.invalid',
      sandbox: false,
    };

    const quote = await getFlightCancellationQuote('OAFLT10023451', cfg);
    expect(quote).toEqual({
      cancellable: true,
      supportRequired: false,
      reasons: [{ code: 'CR01', display: 'My plans changed' }],
      estimatedRefundMinor: 123450,
    });

    const cancelled = await cancelFlightOrder(
      {
        orderId: 'OAFLT10023451',
        code: 'CR01',
        reason: 'My plans changed',
        remarks: 'Guest request',
      },
      cfg,
    );
    expect(cancelled).toEqual({
      orderId: 'OAFLT10023451',
      bookingStatus: 'CANCELLATION_REQUESTED',
      cancellationId: 'CXL-1',
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://example.invalid/v1/flight/orders/OAFLT10023451/cancellation',
    );
    expect(String(fetchMock.mock.calls[1]?.[1]?.body)).toContain('"code":"CR01"');
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
