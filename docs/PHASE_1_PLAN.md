# Phase 1 implementation plan — sourced flights + B2C

Status: **started (2026-10-22)**
Baseline: `master` at `53ac56c` (Phase 0 gate passed locally).

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
| Pricing engine v1 with signed quotes | Route markup + signed quotes exist; flight search now returns server-priced retail totals; flight quote endpoint added | Enforce quote in the flight checkout path |
| B2C search → detail → checkout → confirmation | Search and cart exist; detail page added; separate checkout/confirmation URLs still missing | Payment-first flight checkout |
| DPO Pay payment (intent, capture, refund) | Complete from Phase 0 | Wire flight checkout to `payments/init` |
| WhatsApp templates | Booking confirmation exists | Add ticketing/payment-state templates |
| FX rates | Not started | Bank of Botswana hourly ingestion |
| R2 media/voucher storage | Local/R2 voucher path exists | Production bucket + retention |
| Basic admin console | Markup/agency admin exists | Bookings list/detail + kill switch |
| Ticketing workflow (§5.19) | State machine exists; provider order is still created before payment in the cart path | Move provider order behind payment capture |
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

## Slice 2 — payment-first flight checkout (next)

1. Add a flight checkout endpoint that:
   - resolves the cached offer and validates the signed quote;
   - creates the booking in `pending_payment` without calling OnArrival;
   - creates a DPO payment intent and returns the hosted-page URL.
2. Persist passenger data for fulfilment (booking guest rows, not loose PII in
   logs or snapshots).
3. After `capturePaymentByProviderRef` succeeds, move `confirmed → ticketing`,
   create the OnArrival order, store PNR/e-ticket, and move `ticketing →
   ticketed`.
4. On provider rejection, move to `failed`, audit the provider response, and
   route the case to refund handling. Never silently re-price.
5. Generate the voucher and send `ars_booking_ticketing` after ticketing.
6. Redirect the DPO return to a distinct `/bookings/[ref]/confirmation` URL.

## Slice 3 — admin + cancellation

- Admin bookings list/detail with payment, ledger, and audit timeline.
- Kill switch for new bookings/payments.
- OnArrival cancel adapter and §5.20 cancellation/refund wiring.

## Open risks

- Segregated test database is required for destructive end-to-end runs.
- Paystack live sandbox validation remains blocked by the local test key (401).
- DPO does not expose refund state via `verifyToken`; refund evidence must come
  from the refund response and reconciliation.
- 3-D Secure test coverage remains unavailable from DPO; web-first checkout is
  the mitigation.
