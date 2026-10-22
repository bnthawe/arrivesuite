# Phase 1 implementation plan — sourced flights + B2C

Status: **slice 1 committed; slice 2 implemented and locally validated
(2026-10-22). A browser run with local DPO simulation reached ticketed +
voucher + WhatsApp sandbox. The live DPO sandbox API is currently blocked by
CloudFront HTTP 403 from this environment.**
Baseline: `master` at `7623541`; slice 2 changes are uncommitted at the time of
writing.

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
| Flight provider adapter (search, offer, order, cancel) | Search/order exist on OnArrival; offer data enriched; cancel missing | Add cancel + contract tests |
| Pricing engine v1 with signed quotes | Server-priced search/detail totals; search-scoped opaque offer keys; signed quote enforced by checkout; occupancy pinned to the cached search | FX and tax edge cases |
| B2C search → detail → checkout → confirmation | Payment-first flight path implemented; confirmation page is signed-token protected; local-simulation browser E2E passed | Admin/cancel; live DPO network unblock |
| DPO Pay payment (intent, capture, refund) | Complete from Phase 0; flight checkout now creates intents with a signed booking-access token | Resolve DPO CloudFront 403 for the new-flow live sandbox run |
| WhatsApp templates | Booking confirmation exists; ticketing template added with confirmation fallback | Approve `ars_booking_ticketing` in WhatsApp |
| FX rates | Not started | Bank of Botswana hourly ingestion |
| R2 media/voucher storage | Local/R2 voucher path exists; ticketing generates the voucher | Production bucket + retention |
| Basic admin console | Markup/agency admin exists | Bookings list/detail + kill switch |
| Ticketing workflow (§5.19) | Provider order now created after capture; status `confirmed → ticketing → ticketed`; legacy cart-created flight items are skipped | Provider idempotency and admin retry |
| Cancellation baseline (§5.20) | Refund settlement exists | Provider cancel + policy engine |

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

## Slice 3 — admin + cancellation

- Admin bookings list/detail with payment, ledger, and audit timeline.
- Kill switch for new bookings/payments.
- OnArrival cancel adapter and §5.20 cancellation/refund wiring.
- Manual retry/resolution path for `ticketing_failed` alerts.

## Open risks

- OnArrival order creation has no provider-native idempotency key. The Redis
  ticketing lock reduces duplicate orders, but a crash between provider success
  and the item update can still leave a duplicate-order window. Manual
  reconciliation is required.
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
