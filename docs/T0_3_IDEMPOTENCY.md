# T0.3 Idempotency

**Status:** Implemented and verified against the local app/database on 2026-10-21.  
**Related:** ADR-0014, FR-5.15.34, FR-5.17.7, T0.6.5, T0.6.6.

## What changed

### Route-level response cache

`apps/web/lib/idempotency.ts` adds `withIdempotency`, which wraps unsafe route
handlers:

1. Reads and validates `Idempotency-Key`.
2. Hashes the method, path, query, caller identity, and request body.
3. Claims the key atomically in Redis (`SET ... NX EX 120`).
4. Runs the handler only for the claim owner.
5. Caches the completed status, body, and headers for 24 hours.
6. Replays the cached response with `Idempotent-Replayed: true`.
7. Returns `409 idempotency_key_conflict` when the same key is reused with a
   different payload.
8. Returns `409 idempotency_in_progress` while the original request is still
   running.
9. Fails closed with `503 idempotency_store_unavailable` if Redis cannot serve
   the request.

Keys must be 8-100 characters from `A-Z`, `a-z`, `0-9`, `.`, `:`, `_`, or `-`.
Clients should send a UUID v4.

Responses with `401`, `403`, `408`, `429`, or `5xx` are not cached, so callers
can retry after fixing auth/rate-limit/transient failures. Successful redirects
and 4xx validation responses are cached for the same key and payload.

The Redis claim TTL is 120 seconds; completed responses are retained for 24
hours. A cached response is scoped by route and caller identity, so two callers
cannot replay each other's response even if they choose the same key.

### Coverage

37 of 43 API route files that export `POST`, `PUT`, `PATCH`, or `DELETE` now
use the guard. The six exclusions are deliberate:

- `auth/login`, `auth/logout`, `auth/signup`: session/cookie semantics are not
  replay-safe through a cached response.
- `flights/offers`, `hotels/search`, `quotes`: read-only POST endpoints whose
  responses should not be pinned for 24 hours.

Provider webhooks are not wrapped because they authenticate and deduplicate on
provider references and signatures instead of client keys.

The checkout UI sends a session-scoped key from
`apps/web/lib/idempotency-client.ts`. The key is cleared after a completed
checkout so a new cart attempt does not reuse it.

### Atomic domain claims

Route-level caching prevents repeated requests with the same key. Two further
claims protect against concurrent deliveries that arrive with different keys or
through provider callbacks:

- `apps/web/lib/payments-capture.ts` claims the payment intent with a
  conditional `requires_payment -> captured` update inside the same transaction
  that inserts the payment and increments `bookings.paid_cents`. The loser of
  the race returns `replayed: true`.
- `apps/web/app/api/v1/refunds/route.ts` locks the payment row
  (`SELECT ... FOR UPDATE`) before calculating the remaining refundable
  balance, so two concurrent refund requests with different keys cannot both
  pass the balance check.
- `apps/web/app/api/v1/refunds/[id]/approve/route.ts` claims a pending refund
  with a conditional `pending -> approved` update before calling the provider.
  The loser returns `409` and never reaches DPO/Paystack.

## End-to-end evidence

The local `arrivesuite_test` database and Redis DB 1 were used; Paystack was in
sandbox mode. The Paystack callback and DPO return handler share
`capturePaymentByProviderRef`.

| Scenario | Result |
|---|---|
| Booking: same key and body twice | `201`, then `201` with `Idempotent-Replayed: true`; one booking |
| Booking: same key, different body | `409 idempotency_key_conflict` |
| Payment callback: sequential duplicate | First returned a `paymentId`; second returned `replayed: true` |
| Payment callback: two concurrent deliveries | One capture and one replay; one `payments` row |
| Booking paid amount after duplicate callback | `10000`, not `20000` |
| Refund request: same key twice | `201`, then replay of the same refund |
| Refund request: two concurrent 60.00 requests on a 100.00 payment | One `201`; one `409` `Amount exceeds refundable balance of 4000`; one refund row |
| Refund approval: two concurrent keys | One `200` completed; one `409`; one `refund.completed` audit |
| Booking refunded amount after both refunds | `10000`, not `20000` |

## Residual risks

- A crash after the provider side effect but before the response cache write
  leaves a small retry window. The atomic domain claims cover the database
  writes; providers that do not support idempotency keys (DPO refunds) still
  need operational reconciliation for that window.
- A handler that runs longer than 120 seconds can lose its claim and allow a
  second delivery. Payment/provider calls are bounded well below that.
- If Redis is unavailable, writes with an idempotency key fail closed. This is
  intentional for payment safety but means Redis is on the critical path.
- The live Paystack sandbox run still needs credentials. The contract and error
  mapping are covered by mocked tests.
