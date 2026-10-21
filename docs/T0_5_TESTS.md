# T0.5 Critical-Path Tests and CI Gate

**Status:** Critical-path booking/capture tests and the CI test gate are in
place. Browser E2E and refund-route automation remain.

## What runs

`apps/web` uses Vitest:

- `lib/idempotency.test.ts` — 11 tests for key validation, replay, conflict,
  in-progress handling, identity isolation, and fail-closed behavior.
- `lib/booking-state.test.ts` — 6 tests for the Section 9.1 transition table.
- `lib/critical-path.test.ts` — 2 database-backed tests, skipped unless
  `TEST_DATABASE_URL` is set:
  1. Create a booking (`pending_payment`) → insert a payment intent → capture →
     `confirmed`, `paidCents = 10000`, one payment, one `booking.transition`
     audit, and a duplicate capture that replays without charging twice.
  2. Cancel a booking before capture → capture returns `409` and the whole
     transaction rolls back: intent stays `requires_payment`, zero payments,
     `paidCents = 0`.

The integration tests clean up the rows they create and close the database
client. They mock the best-effort reconciliation queue so the test does not
depend on Redis.

## CI gate

`.github/workflows/ci.yml` now starts a PostgreSQL 16 service, runs migrations
and the seed, and executes `pnpm test` before the production build. The old
typecheck/lint steps remain. The test step receives:

```text
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/arrivesuite_test
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/arrivesuite_test
```

`turbo.json` declares `TEST_DATABASE_URL` on the `test` task so Turborepo
passes it through and includes it in the cache key.

## Running locally

Use a disposable database, never the development or production database:

```powershell
$env:DATABASE_URL='postgresql://arrivesuite:arrivesuite_dev_password@localhost:5432/arrivesuite_test'
pnpm --filter @arrivesuite/db db:migrate
pnpm --filter @arrivesuite/db db:seed

$env:TEST_DATABASE_URL=$env:DATABASE_URL
pnpm --filter @arrivesuite/web test:integration
```

The full web suite is `pnpm --filter @arrivesuite/web test`. Without
`TEST_DATABASE_URL` the two database tests are reported as skipped.

## Remaining gaps

- No Playwright/browser test for the guest checkout UI.
- Refund creation and approval are covered by the local end-to-end evidence in
  `packages/integrations/src/dpo-pay/SANDBOX_RESULTS.md`, not by an automated
  database test yet.
- Live DPO and Paystack sandbox tests remain opt-in and are skipped in CI.
- The worker package has no test suite yet.
