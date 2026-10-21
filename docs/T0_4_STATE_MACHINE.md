# T0.4 Booking State Machine

**Status:** Core implemented and verified on 2026-10-21.  
**Related:** Section 9.1, ADR-0020, FR-5.15.34, T0.6.5.

## States and transitions

`apps/web/lib/booking-state.ts` is the single transition table. The database
enum is migrated to the same state names; adding a state requires both a
migration and a code change.

| From | Allowed to |
|---|---|
| `draft` | `pending_payment` |
| `pending` (legacy) | `pending_payment`, `confirmed`, `failed`, `expired`, `no_show` |
| `pending_payment` | `confirmed`, `failed`, `expired` |
| `confirmed` | `ticketing`, `fulfilled`, `on_hold`, `cancelled`, `no_show` |
| `on_hold` | `confirmed`, `cancelled`, `expired` |
| `ticketing` | `ticketed`, `failed` |
| `ticketed` | `exchanging`, `fulfilled`, `cancelled`, `no_show` |
| `exchanging` | `ticketed`, `failed` |
| `fulfilled` | `cancelled`, `refunded`, `no_show` |
| `cancelled` | `refunded` |
| `refunded`, `expired`, `no_show`, `failed` | terminal |

`pending` is retained only for rows created before this migration. New
bookings are written as `pending_payment`.

## Migration

`packages/db/drizzle/0015_booking_states.sql` adds the missing enum values
(`draft`, `pending_payment`, `ticketing`, `ticketed`, `exchanging`, `fulfilled`).

PostgreSQL cannot use a new enum value in the transaction that adds it, so the
row backfill and default change run in a second step:

```text
pnpm --filter @arrivesuite/db db:migrate
  -> tsx src/migrate.ts
  -> tsx src/backfill-booking-status.ts
```

The backfill moves `pending` rows to `pending_payment` and changes the column
default. It is idempotent. `db:backfill-booking-status` can also be run alone.

## Integration points

- **Booking creation** writes `pending_payment`.
- **Payment capture** (`apps/web/lib/payments-capture.ts`) locks the booking
  row in the same transaction that claims the payment intent, inserts the
  payment, and adds `paidCents`. It only commits
  `pending_payment -> confirmed` when the transition is legal, and writes a
  `booking.transition` audit event. An illegal state rolls the whole
  transaction back, so the intent remains `requires_payment` and no payment is
  recorded.
- **Supplier no-show** uses the same transition table. It permits
  `confirmed`, `fulfilled`, `ticketed`, and legacy `pending` to move to
  `no_show`, and updates conditionally so a concurrent state change cannot be
  overwritten.
- **Refund settlement** (`apps/web/lib/refund-settlement.ts`) runs after the
  provider refund succeeds, in one database transaction. It marks the refund
  `completed`, adds to `bookings.refunded_cents`, and only moves the booking to
  `refunded` once the full captured amount is returned. States that cannot move
  directly to `refunded` pass through `cancelled` first, with one
  `booking.transition` audit row for each step.

## Verification

Fresh `arrivesuite_test` database:

| Check | Result |
|---|---|
| Migrations + backfill | Applied; enum has 14 values; default is `pending_payment` |
| New booking | `201`; status `pending_payment` |
| Paystack capture | Status `confirmed`; `paid_cents = 10000` |
| Duplicate Paystack callback | Second delivery replayed; no second payment or paid increment |
| Cancelled booking capture | `409 Booking is cancelled`; intent still `requires_payment`; zero payments; `paid_cents = 0` |
| Transition audit | One `booking.transition` row with `pending_payment -> confirmed` |
| Partial refund | Booking stays `confirmed`; `refunded_cents` increases |
| Full refund | Booking becomes `refunded`; confirmed bookings pass through `cancelled` with two transition audit rows |

## Remaining gaps

- Ticketing, exchange, and cancellation endpoints do not exist yet, so those
  transitions are defined but not wired to user flows.
- Ledger posting remains best-effort after capture/refund (ADR-0017), not part
  of the state/payment transaction.
- `no_show` from `fulfilled`/`ticketed` and legacy `pending` are operational
  extensions beyond the transitions printed in Section 9.1; they are explicit
  in the code table.
