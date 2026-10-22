import { describe, expect, it } from 'vitest';
import {
  isPostPaymentFlightItem,
  toProviderPassengers,
  type TicketingGuest,
  type TicketingItem,
} from './ticketing-helpers';

function item(overrides: Partial<TicketingItem>): TicketingItem {
  return {
    itemType: 'flight',
    snapshot: {},
    ...overrides,
  };
}

describe('post-payment flight items', () => {
  it('only treats items with a frozen offer as post-payment ticketing work', () => {
    expect(
      isPostPaymentFlightItem(
        item({ snapshot: { fulfillment: 'post_payment', flightOffer: { offerId: 'off_test' } } }),
      ),
    ).toBe(true);
    expect(isPostPaymentFlightItem(item({ snapshot: { flightOffer: { offerId: 'off_test' } } }))).toBe(
      true,
    );
    // Legacy cart-created flight items already have a provider order and must
    // not be sent to OnArrival again after capture.
    expect(isPostPaymentFlightItem(item({ snapshot: { itemType: 'flight' } }))).toBe(false);
    expect(isPostPaymentFlightItem(item({ itemType: 'hotel', snapshot: {} }))).toBe(false);
  });
});

describe('provider passenger mapping', () => {
  it('carries the booking guest fields the airline order needs', () => {
    const guests: TicketingGuest[] = [
      {
        guestType: 'ADT',
        firstName: 'Neo',
        lastName: 'Molefe',
        dateOfBirth: '1990-04-12',
        passportNumber: 'BW123456',
        nationality: 'bw',
      },
      {
        guestType: 'CHD',
        firstName: 'Lesedi',
        lastName: 'Molefe',
        dateOfBirth: '2016-08-01',
        passportNumber: null,
        nationality: null,
      },
      {
        guestType: 'INF',
        firstName: 'Kagiso',
        lastName: 'Molefe',
        dateOfBirth: '2025-01-20',
        passportNumber: null,
        nationality: 'BW',
      },
    ];

    expect(toProviderPassengers(guests)).toEqual([
      {
        type: 'ADT',
        firstName: 'Neo',
        lastName: 'Molefe',
        dateOfBirth: '1990-04-12',
        passportNumber: 'BW123456',
        nationality: 'BW',
      },
      {
        type: 'CHD',
        firstName: 'Lesedi',
        lastName: 'Molefe',
        dateOfBirth: '2016-08-01',
      },
      {
        type: 'INF',
        firstName: 'Kagiso',
        lastName: 'Molefe',
        dateOfBirth: '2025-01-20',
        nationality: 'BW',
      },
    ]);
  });

  it('defaults an unexpected guest type to adult', () => {
    const guests: TicketingGuest[] = [
      {
        guestType: 'XXX',
        firstName: 'A',
        lastName: 'B',
        dateOfBirth: null,
        passportNumber: null,
        nationality: null,
      },
    ];
    expect(toProviderPassengers(guests)[0]?.type).toBe('ADT');
  });
});
