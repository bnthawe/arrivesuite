import type { Passenger } from '@arrivesuite/types';

export interface TicketingItem {
  itemType: string;
  snapshot: unknown;
}

export interface TicketingGuest {
  guestType: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  passportNumber: string | null;
  nationality: string | null;
}

export interface FlightItemSnapshot {
  flightOffer?: unknown;
  fulfillment?: string;
  pnr?: string;
  ticket?: string;
  pdf?: string;
  providerOrderId?: string;
  ticketedAt?: string;
  [key: string]: unknown;
}

export function snapshotOf(value: unknown): FlightItemSnapshot {
  return value && typeof value === 'object' ? (value as FlightItemSnapshot) : {};
}

export function isPostPaymentFlightItem(item: TicketingItem): boolean {
  if (item.itemType !== 'flight') return false;
  const snapshot = snapshotOf(item.snapshot);
  return snapshot.fulfillment === 'post_payment' || Boolean(snapshot.flightOffer);
}

// Names are required by the airline order API; the base Passenger schema keeps
// them optional for older callers, so this mapper is the only place that
// narrows a booking guest into the provider shape.
export function toProviderPassengers(guests: TicketingGuest[]): Passenger[] {
  return guests.map((guest) => {
    const type = guest.guestType === 'CHD' || guest.guestType === 'INF' ? guest.guestType : 'ADT';
    return {
      type,
      firstName: guest.firstName,
      lastName: guest.lastName,
      ...(guest.dateOfBirth ? { dateOfBirth: guest.dateOfBirth } : {}),
      ...(guest.passportNumber ? { passportNumber: guest.passportNumber } : {}),
      ...(guest.nationality ? { nationality: guest.nationality.toUpperCase() } : {}),
    };
  });
}
