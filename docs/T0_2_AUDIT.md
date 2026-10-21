# T0.2 Audit Coverage

**Status:** Implemented and verified on 2026-10-21.  
**Related:** FR-5.13.49, FR-5.16.41, ADR-0015, T0.3.

## What changed

`apps/web/lib/audit.ts` adds a request-level audit fallback for successful
writes. It is invoked by `withIdempotency`, which already wraps every
idempotency-guarded mutation:

1. The handler performs the write and returns a response.
2. For the first execution only, `recordWriteAudit` resolves the actor from the
   request's cached session and inserts one `audit_events` row.
3. The response is then cached for idempotent replay.
4. A replay returns the cached response without running the handler, so it does
   not create a second audit row.
5. Responses with status `>= 400` are not audited by the fallback: validation,
   authentication, and conflict responses did not change state.

The fallback row uses:

| Field | Value |
|---|---|
| `action` | `api.write` |
| `entity_type` | `api_route` |
| `entity_id` | `METHOD /path` (max 100 chars) |
| `actor_id` / `actor_realm` | session actor, or empty for an anonymous write |
| `diff` | method, path, idempotency scope, status, and whether an idempotency key was present |
| `ip` | first `x-forwarded-for`, `x-real-ip`, or `cf-connecting-ip` value |
| `user_agent` | request user agent |
| `trace_id` | `TRACE_ID_HEADER` (default `x-trace-id`) or `x-request-id` |

Request bodies are deliberately not stored, so guest details, card data, and
provider secrets cannot leak into the audit log through this fallback.

### Avoiding duplicate audit rows

Routes that already write a domain-specific audit event pass `audit: false` to
`withIdempotency`. This covers the twelve route files below:

- booking creation: `bookings`, `cart/[id]/checkout`, `flights/orders`,
  `hotels/book` (via `booking.created` in `bookings-core`)
- payments: `payments/init` (`payment_intent.created`)
- refunds: `refunds` (`refund.requested`), `refunds/[id]/approve`
  (`refund.completed` / `refund.failed`)
- RFQs: `rfqs`, `rfqs/[id]/quotes`, `rfqs/[id]/accept`
- supplier onboarding: `suppliers` (`supplier.onboarded`)
- supplier no-show: `supplier/bookings/[id]/no-show`

The fallback therefore covers the remaining 25 idempotency-guarded route files,
including admin configuration, supplier inventory, room availability, blocks,
rates, tours, venues, holds, cart items, prebooks, and DPO token creation.

### Other write routes

- `auth/login` and `auth/signup` already write `auth.login`,
  `auth.login_failed`, and `auth.signup`.
- `auth/logout` now writes `auth.logout` after resolving the actor and before
  clearing the cookie. The audit insert is best-effort so logout still works if
  audit storage is unavailable.
- Provider webhooks (`paystack`, `stripe`, `flutterwave`, `onarrival`) continue
  to write their domain audit events.
- `flights/offers`, `hotels/search`, and `quotes` are POSTs but read-only; they
  are intentionally outside the write audit to avoid filling the audit log with
  search traffic.

## Actor resolution

`getSessionAccount` now caches its result in a request-scoped `WeakMap`
(`getRequestActor`). A route guard such as `requireAdmin` or `requireSupplier`
resolves the session once; the audit wrapper reuses that actor instead of
querying the session and account tables again. Public writes still attempt a
session lookup once, so a signed-in customer's cart or prebook write is
attributed to them when possible.

## Verification

| Check | Result |
|---|---|
| Web typecheck | Passed |
| Web unit tests | 4 files passed, 22 tests passed with the test database enabled |
| Request audit shape | Actor, route, status, IP, trace, and key presence are asserted in `apps/web/lib/audit.test.ts` |
| Body redaction | Test confirms request body and query values are absent from the audit row |
| Idempotent replay | DB-backed test confirms one `api.write` row for the first write and none for the replay |
| Domain routes | Twelve route files opt out and keep their existing domain events |

Run the DB-backed check with:

```powershell
$env:DATABASE_URL='postgresql://arrivesuite:arrivesuite_dev_password@localhost:5432/arrivesuite_test'
$env:TEST_DATABASE_URL=$env:DATABASE_URL
pnpm --filter @arrivesuite/web test
```

## Residual gaps

- The generic fallback records request metadata, not field-level before/after
  values. A route that changes business data should keep or add a domain event
  when the diff matters to compliance.
- Audit insertion is best-effort. A database failure is logged but does not fail
  the already-completed mutation. Production needs alerting on
  `[audit] could not record write`.
- The audit read screen, filters, export, and signed-hash export are later
  admin-console work (FR-5.16.42).
- `audit_events` immutability is enforced by application discipline today. The
  database trigger and revoked `UPDATE`/`DELETE` grants described in the data
  model are still a separate hardening task because the test suite currently
  cleans up rows by deleting them.
