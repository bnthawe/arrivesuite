# T0.5 Critical-Path Tests and CI Gate

**Status:** Critical-path booking/capture tests, the worker reconciliation
test, and the CI test gate are in place. Browser E2E and refund-route
automation remain.

## What runs

`apps/web` uses Vitest:

- `lib/idempotency.test.ts` — 11 tests for key validation, replay, conflict,
  in-progress handling, identity isolation, and fail-closed behavior.
- `lib/booking-state.test.ts` — 6 tests for the Section 9.1 transition table.
- `lib/critical-path.test.ts` — 4 database-backed tests, skipped unless
  `TEST_DATABASE_URL` is set:
  1. Create a booking (`pending_payment`) → insert a payment intent → capture →
     `confirmed`, `paidCents = 10000`, one payment, one `booking.transition`
     audit, and a duplicate capture that replays without charging twice.
  2. Cancel a booking before capture → capture returns `409` and the whole
     transaction rolls back: intent stays `requires_payment`, zero payments,
     `paidCents = 0`.
  3. Full refund settlement moves the booking to `refunded` only after the
     capture is fully refunded.
  4. A guarded write appends one request audit row; an idempotent replay
     appends none.

The integration tests clean up the rows they create and close the database
client. They mock the best-effort reconciliation queue so the test does not
depend on Redis.

`services/worker` uses Vitest with a real BullMQ queue and worker:

- `src/jobs/reconcile.test.ts` — 3 database-and-Redis tests, skipped unless
  both `TEST_DATABASE_URL` and `TEST_REDIS_URL` are set:
  1. Single-booking mode reports a captured-payment mismatch and appends
     `reconciliation.completed` with `scope: booking`.
  2. A sweep enqueued through BullMQ checks `pending_payment` and `confirmed`
     bookings, expires a stale intent, raises `booking_mismatch` and
     `ledger_missing` findings, writes the sweep audit, and creates alert
     state.
  3. `/health` returns `200` with Redis up and the worker running; unknown
     paths return `404`.

The sweep now scans every active §9.1 state, including `pending_payment`,
`ticketing`, `ticketed`, and `exchanging`. The processor also clears its
four-minute timeout after each run instead of leaving a live timer behind.

## CI gate

`.github/workflows/ci.yml` starts PostgreSQL 16 and Redis 7 services, runs
migrations and the seed, and executes `pnpm test` before the production build.
The old typecheck/lint steps remain. The test step receives:

```text
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/arrivesuite_test
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/arrivesuite_test
REDIS_URL=redis://localhost:6379/1
TEST_REDIS_URL=redis://localhost:6379/1
```

`turbo.json` declares the test database and Redis variables on the `test` task
so Turborepo passes them through and includes them in the cache key.

## Running locally

Use a disposable database and a separate Redis database, never development or
production:

```powershell
$env:DATABASE_URL='postgresql://arrivesuite:arrivesuite_dev_password@localhost:5432/arrivesuite_test'
pnpm --filter @arrivesuite/db db:migrate
pnpm --filter @arrivesuite/db db:seed

$env:TEST_DATABASE_URL=$env:DATABASE_URL
$env:TEST_REDIS_URL='redis://localhost:6379/1'
pnpm --filter @arrivesuite/web test:integration
pnpm --filter @arrivesuite/worker test
```

The full suite is `pnpm test`. Without `TEST_DATABASE_URL` the database tests
are reported as skipped; without `TEST_REDIS_URL` the worker reconciliation
tests are skipped. The worker test obliterates the reconciliation queue on
Redis DB 1 before and after the run, so do not point `TEST_REDIS_URL` at a
shared queue.

## Remaining gaps

- No Playwright/browser test for the guest checkout UI.
- Refund creation and approval are covered by the local end-to-end evidence in
  `packages/integrations/src/dpo-pay/SANDBOX_RESULTS.md`, not by an automated
  database test yet.
- Live DPO and Paystack sandbox tests remain opt-in and are skipped in CI.
