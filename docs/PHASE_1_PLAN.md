# Phase 1 implementation plan — sourced flights + B2C

Status: **slices 1–4 committed; slice 4 cancellation/refund controls implemented
and locally validated (2026-10-22). Browser runs with local DPO simulation
reached ticketed + voucher + WhatsApp sandbox, then cancelled + refunded. The
live DPO sandbox API is currently blocked by CloudFront HTTP 403 from this
environment.**
Baseline: slice 3 at `ed16cb9`; slice 4 at `871a53a`, with the single-sourced-item
guard at `bca37e7`.

## Provider decision

Phase 1 is delivered on the providers already shipped in the repository and
accepted by D22 / §18.1:

| Capability | Provider | Notes |
| --- | --- | --- |
| Flights | OnArrival | Existing XML/JSON gateway client in `packages/integrations/src/onarrival.ts` |
| Hotels (sourced) | LiteAPI | Already wired; not the Phase 1 acceptance path |
| Payments | DPO Pay (primary), Paystack (fallback) | Phase 0 hardening complete |

The “Duffel adapter” line in §17.4 is stale: D22 replaces Duffel/Amadeus with
OnArrival/LiteAPI. Adding Duffel would be a new provider decision under the
ask-first rule. The integration boundary is kept provider-neutral so a Duffel
adapter can be added later without changing booking or pricing code.

## Deliverables and current state

| §17.4 deliverable | State | Next slice |
| --- | --- | --- |
| Flight provider adapter (search, offer, order, cancel) | Search/order/cancel exist on OnArrival; offer data enriched; cancellation quote/cancel contract tests added | Provider-native idempotency |
| Pricing engine v1 with signed quotes | Server-priced search/detail totals; search-scoped opaque offer keys; signed quote enforced by checkout; occupancy pinned to the cached search | FX and tax edge cases |
| B2C search → detail → checkout → confirmation | Payment-first flight path implemented; confirmation page is signed-token protected; local-simulation browser E2E passed; admin cancellation/refund controls added | Live DPO network unblock |
| DPO Pay payment (intent, capture, refund) | Complete from Phase 0; flight checkout now creates intents with a signed booking-access token | Resolve DPO CloudFront 403 for the new-flow live sandbox run |
| WhatsApp templates | Booking confirmation exists; ticketing template added with confirmation fallback | Approve `ars_booking_ticketing` in WhatsApp |
| FX rates | Not started | Bank of Botswana hourly ingestion |
| R2 media/voucher storage | Local/R2 voucher path exists; ticketing generates the voucher | Production bucket + retention |
| Basic admin console | Bookings list/detail, payment/ledger/audit views, runtime kill switches, manual ticketing retry/alert resolution, and cancellation/refund approval added | Refund retry/reconciliation |
| Ticketing workflow (§5.19) | Provider order now created after capture; status `confirmed → ticketing → ticketed`; legacy cart-created flight items are skipped; failed attempts can be retried by an admin | Provider idempotency |
| Cancellation baseline (§5.20) | Single sourced-flight item: provider quote + cancel, fare/provider-quote refund, pending admin approval, non-refundable no-refund path | Multi-item/hotel policies, partial fees, failed-refund repair |

## Slice 1 — search result → fare detail (done)

What changed:

- OnArrival offers now carry structured route, schedule, duration, stops,
  airline, fare brand, and refundability. A mapper parses the gateway’s
  human-readable summary when the gateway omits structured fields.
- Sandbox fares use realistic minor-unit amounts and the requested route.
- `POST /api/v1/flights/offers` now returns server-computed retail pricing
  (`netCents`, `markupCents`, `totalCents`) alongside offers. The client never
  computes markup.
- `/flights/offer?offerId=…` is a server-rendered fare detail page with route
  timeline, fare conditions, and a server-computed total.
- `POST /api/v1/flights/quote` mints a signed, 15-minute quote from the cached
  offer. The client supplies only the offer id.
- Search results link to the detail page and show retail totals instead of the
  provider net fare.

Tests:

- `packages/integrations/src/onarrival.test.ts` covers sandbox fields, summary
  fallback parsing, structured-field precedence, and sandbox orders.

## Slice 2 — payment-first flight checkout (done, locally validated)

1. `POST /api/v1/flights/offers` returns an opaque, search-scoped cache key as
   `offerId`. The provider offer token stays server-side. This prevents reused
   sandbox ids (and any reused live ids) from overwriting another search’s
   route or occupancy. A legacy cache copy keyed by provider id remains for the
   cart path.
2. `POST /api/v1/flights/checkout`:
   - requires an `Idempotency-Key`;
   - resolves the cached offer and re-prices it server-side;
   - rejects a traveller count that differs from the cached search occupancy;
   - validates the signed quote;
   - creates a `pending_payment` booking, `booking_items` snapshot, and
     `booking_guests` rows atomically;
   - returns an HMAC booking-access token. It does not call OnArrival.
3. `POST /api/v1/payments/init` accepts `returnTo: 'confirmation'`. That mode
   requires a valid booking-access token, so a booking reference alone cannot
   start a payment. A reload without the client idempotency key reuses the
   active DPO intent and returns its hosted-page URL instead of creating a
   second payable intent.
4. The DPO browser return goes to
   `/api/v1/payments/dpo/return/confirmation`, verifies the token, captures the
   payment atomically, then redirects to
   `/bookings/[ref]/confirmation?token=…`. The JSON return route remains for
   API callers.
5. After capture, `lib/ticketing.ts`:
   - claims `confirmed → ticketing` conditionally;
   - takes a Redis lock and re-reads the booking/items;
   - creates the OnArrival order from the frozen `flightOffer` snapshot and
     `booking_guests`;
   - writes the PNR/e-ticket into the item snapshot and moves the booking to
     `ticketed`;
   - generates the PDF voucher and sends `ars_booking_ticketing`, falling back
     to the approved booking-confirmation template if the ticketing template
     is not yet approved.
6. If provider fulfilment is rejected, the booking moves to `failed`, the
   provider code/status is audited, and a `ticketing_failed` manual alert is
   raised. If the ticket was already issued and only a later side effect failed,
   the booking stays `ticketed` and the error is audited separately. There is
   no silent re-pricing.
7. The confirmation page uses signed, expiring tokens rather than trusting the
   booking ref. It shows honest payment and ticketing states and links the
   voucher only when ticketed.
8. Search results, fare detail, checkout, and the quote are pinned to the same
   cached occupancy. The client never computes markup or invents a fare.

Validation completed locally:

- `pnpm typecheck` and `pnpm lint` pass.
- `pnpm test` passes with the segregated test database and Redis (44 web tests,
  3 worker tests, 41 integration tests; live provider tests skipped).
- DB-backed tests cover capture → ticketing → replay, and the new route tests
  cover checkout occupancy/token behaviour and payment-init access control.
- `pnpm --filter @arrivesuite/web build` passes; the only warnings are the three
  pre-existing dynamic-filesystem warnings in `tickets/[ref]`.
- Browser run (GBE → MUB, 2 adults + 1 child) with `DPO_PAY_SIMULATE=true` and
  the OnArrival sandbox:
  - search → fare detail → checkout created `ARS-2026-000049` in
    `pending_payment`;
  - the simulated DPO return captured BWP 5,962.00 and moved the booking to
    `ticketed`;
  - the OnArrival sandbox order returned PNR `ABC123` / ticket `H-77421`;
  - the voucher PDF was written and served, and the WhatsApp sandbox send was
    audited;
  - the confirmation page shows paid, ticketed, PNR, ticket, and the voucher
    link.

Still unvalidated:

- A live DPO sandbox browser run. The `createToken` API currently returns
  CloudFront HTTP 403 (“Request blocked”) from this environment, so the new
  flow could not open a real DPO hosted page. The same client path completed
  five 100 BWP live sandbox cycles in Phase 0; retry from an allowed network or
  ask DPO to allowlist the environment.
- A Paystack test-key run of the new flow (the local `sk_test_...` key returns
  401).
- EU-card 3-D Secure.

## Slice 3 — admin controls (done, locally validated)

What changed:

- Migration `0018_system_flags.sql` adds runtime `system_flags` rows
  (`bookings_enabled`, `payments_enabled`) that default to enabled when a row
  is missing.
- `GET /api/v1/admin/flags` lists both switches and
  `PUT /api/v1/admin/flags` updates one with an admin audit event. The admin
  bookings page exposes both toggles.
- `createBooking` rejects new bookings with `503` while `bookings_enabled` is
  false. `POST /api/v1/payments/init` rejects new payment intents with `503`
  while `payments_enabled` is false. Both checks run after idempotent replay
  and active-intent resume, so retries never fail because of a pause.
- `/admin/bookings` is an admin-only searchable list (ref or customer email,
  status filter). `/admin/bookings/[ref]` shows the booking, passengers
  (passport numbers masked), items with PNR/ticket, payment intents and
  captured payments, refunds, ledger lines, alerts, and the audit timeline.
- `POST /api/v1/admin/bookings/[ref]/retry-ticketing` retries a failed
  post-payment ticketing attempt. The state machine now permits
  `failed → ticketing` and `failed → refunded`; the retry only proceeds when
  the booking is fully paid. A successful retry resolves the open
  `ticketing_failed` alert and audits the resolution under the admin actor.
- `POST /api/v1/admin/bookings/[ref]/resolve-alert` lets an operator close
  `ticketing_failed` or `ticketing_stuck` after manual investigation.
- The worker now reopens an existing resolved alert row when the same finding
  recurs. The `(kind, reference)` unique index means inserting a second row
  would otherwise crash the sweep after the first resolution.

Validation completed locally:

- `pnpm lint` and `pnpm typecheck` pass; `pnpm test` passes with the segregated
  test database and Redis (46 web tests, 3 worker tests, 41 integration tests;
  live provider tests skipped).
- `pnpm --filter @arrivesuite/web build` passes with only the three pre-existing
  dynamic-filesystem warnings in `tickets/[ref]`.
- DB-backed tests cover capture → ticketing → replay and admin retry of a
  failed ticketing attempt. Worker reconciliation tests cover alert recurrence
  after a manual resolution.
- Browser validation as `admin@arrivesuite.com`:
  - `/admin/bookings` lists `ARS-2026-000049` as ticketed with BWP 5,962.00
    paid;
  - `/admin/bookings/ARS-2026-000049` shows the PNR, ticket, captured payment,
    balanced ledger lines, voucher, and audit timeline;
  - pausing `bookings_enabled` made `POST /api/v1/bookings` return `503`, and
    pausing `payments_enabled` made `POST /api/v1/payments/init` return `503`;
    both were restored to enabled and the paused attempts created no rows;
  - the retry endpoint returned `ticketed` for the already-ticketed booking
    and wrote an admin `booking.ticketing_retry` audit event.

## Slice 4 — cancellation and refund controls (implemented, locally validated)

What changed:

- `packages/integrations/src/onarrival.ts` now implements
  `getFlightCancellationQuote` (`GET /v1/flight/orders/{orderId}/cancellation`)
  and `cancelFlightOrder` (`POST` to the same path). Both have sandbox paths and
  map the gateway’s eligibility, reason codes, support flag, refund estimate,
  booking status, and cancellation id. They are exported from
  `@arrivesuite/integrations` and covered by sandbox and live-envelope tests.
- `apps/web/lib/cancellation.ts` is the Phase 1 cancellation service. It:
  - accepts exactly one sourced flight item with a known
    `flightOffer.refundable` flag; legacy, multi-item, and mixed bookings are
    escalated to manual handling;
  - takes the `cancelling:*` and `ticketing:*` Redis locks so a cancellation
    cannot race a paid ticketing run;
  - fetches the provider quote and refuses non-cancellable or
    support-required orders;
  - computes the refund from the provider quote when present, otherwise from the
    fare’s `refundable` flag, capped to the remaining captured balance and
    existing non-failed refunds;
  - marks the item and booking `cancelled`, sets `cancelledAt`, and writes
    `booking.transition` / `booking.cancelled` audit events;
  - requests a pending refund through the shared refund helper. If that request
    fails after cancellation, it writes
    `booking.cancellation_refund_failed` and raises a P1
    `cancellation_refund_failed` alert for manual repair. The existing
    `resolve-alert` route and admin button now accept that alert kind.
- `apps/web/lib/refunds.ts` extracts the existing refund creation and balance
  lock from `POST /api/v1/refunds`; both the public route and cancellation use
  the same helper, so the one-refund-balance rule is unchanged.
- `POST /api/v1/admin/bookings/[ref]/cancel` is an admin-only, idempotent route
  that accepts an optional `reasonCode` (default `CR01`) and `remarks`.
- The admin booking detail page now shows the fare rule, estimated guest refund,
  a cancel button, and an approve button for pending refunds. Approval uses the
  existing `/api/v1/refunds/[id]/approve` route and the signed-in admin id.
  Refunds are deliberately not sent automatically: cancellation creates a
  pending refund, and an operator approves it.

Validation completed locally:

- `pnpm lint` and `pnpm typecheck` pass.
- `pnpm test` passes with the segregated test database and Redis (48 web tests,
  3 worker tests, 43 integration tests; live provider tests skipped).
- `pnpm --filter @arrivesuite/web build` passes with only the three pre-existing
  dynamic-filesystem warnings in `tickets/[ref]`.
- `packages/integrations` tests pass (43 passed, 2 skipped), including the
  cancellation quote/cancel contract.
- DB-backed tests cover:
  - refundable cancellation → item/booking `cancelled`, pending refund for the
    paid amount, `booking.cancelled` + `refund.requested` audits, and an
    idempotent replay;
  - non-refundable cancellation → `cancelled` with no refund row.
- Browser validation with `DPO_PAY_SIMULATE=true` and the OnArrival sandbox:
  - created `ARS-2026-000050` from the refundable Airlink offer, captured BWP
    7,150.00, ticketed with PNR `ABC123` / ticket `H-77421`;
  - the admin detail showed “refundable” and a BWP 7,150.00 refund preview;
  - cancelling moved the booking to `cancelled` and created a pending BWP
    7,150.00 refund;
  - approving the refund completed it, moved the booking to `refunded`, updated
    `refundedCents`, and posted the balanced refund ledger lines;
  - `ARS-2026-000049` (non-refundable) showed a BWP 0.00 preview and was left
    ticketed.

Remaining for the full §5.20 engine:

- Multi-item, hotel, and mixed bookings; the standard policy library and
  cancellation-fee schedules.
- Provider-native cancellation idempotency, and a reconciliation path for the
  window where OnArrival cancels but the local transaction fails.
- A retry/repair UI for refunds that fail provider approval.

## Open risks

- OnArrival order creation has no provider-native idempotency key. The Redis
  ticketing lock reduces duplicate orders, but a crash between provider success
  and the item update can still leave a duplicate-order window. Manual
  reconciliation is required, including before an admin uses the ticketing
  retry button.
- OnArrival cancellation also has no provider-native idempotency key. The
  cancellation service holds both the cancellation and ticketing locks and
  stores the provider cancellation id in the item snapshot, but a provider
  success followed by a local database failure can still require manual
  reconciliation.
- Phase 1 cancellation is intentionally limited to one sourced flight item with
  a known refundable flag and, when a refund is due, one captured payment.
  Multi-item, hotel, mixed, legacy, and partial-refund cases must use the
  manual workflow until the full §5.20 policy engine exists.
- Refunds created by cancellation stay `pending` until an admin approves them.
  A provider refund failure leaves the booking `cancelled` and the refund
  `failed`; there is no automatic retry UI yet.
- The provider’s cancellation quote is treated as authoritative when present.
  If the live quote and the frozen fare flag disagree, the quote wins, capped to
  the remaining captured balance.
- One active payment intent per booking is enforced by the application check
  and migration `0017_one_active_payment_intent.sql` (partial unique index).
- DPO does not expose refund state via `verifyToken`; refund evidence must come
  from the refund response and reconciliation.
- A DPO hosted page can expire before the app intent’s 60-minute expiry, so a
  resumed intent may point at an expired provider page. The user must wait for
  the app intent to expire or support must intervene.
- The `ars_booking_ticketing` WhatsApp template needs provider approval. Until
  then, the fallback sends the approved booking-confirmation template.
- `booking_guests` PII retention and export redaction still need the §6.4
  retention job and admin redaction rules.
- Segregated test database is required for destructive end-to-end runs.
- DPO’s live sandbox API is blocked by CloudFront HTTP 403 from this environment;
  the local-simulation path is green, but live acceptance needs a network that
  DPO allows (or an allowlist entry).
- Paystack live sandbox validation remains blocked by the local test key (401).
- 3-D Secure test coverage remains unavailable from DPO; web-first checkout is
  the mitigation.
