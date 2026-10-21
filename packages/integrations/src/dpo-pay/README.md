# DPO Pay Integration — T0.6 Spike

## Status

Local harness ready. Five live sandbox cycles completed on 2026-10-21: 100 BWP create, unpaid verify (`900`), hosted-page payment, paid verify (`000`). Refund and duplicate-verify checks are also recorded. See `SANDBOX_RESULTS.md`.

The production client already lives at `packages/integrations/src/dpopay.ts`. It uses the DPO Pay v6 XML API through the platform `fetch` wrapper and exports:

- `dpoConfigFromEnv`
- `createDpoToken`
- `dpoHostedPageUrl`
- `verifyDpoToken`
- `refundDpoToken`

This directory contains the spike plan and its tests. It does **not** contain a second client.

## Quick Start

### 1. Get sandbox credentials

Visit `https://docs.dpopay.com/` and extract the test Company Token and Product Service ID.

### 2. Configure the environment

Add these to `apps/web/.env.local`:

```bash
DPO_PAY_COMPANY_TOKEN=<company-token>
DPO_PAY_PRODUCT_SERVICE_ID=<product-service-id>
DPO_PAY_SERVICE_SERVICE_ID=<service-service-id>
DPO_PAY_BASE_URL=https://secure.3gdirectpay.com/API/v6/
DPO_PAY_MODE=sandbox
```

For local development without credentials, set:

```bash
NEXT_PUBLIC_BYPASS_DPO_FOR_DEV=true
```

The bypass must never be enabled in production.

### 3. Run the local harness

```bash
pnpm --filter @arrivesuite/integrations test
pnpm --filter @arrivesuite/integrations typecheck
```

The default tests mock `fetch`; they do not need network access or credentials. The opt-in live tests are skipped unless `DPO_LIVE_SANDBOX=1`:

```powershell
$env:DPO_LIVE_SANDBOX='1'
$env:DPO_PAY_COMPANY_TOKEN='<sandbox-company-token>'
$env:DPO_PAY_PRODUCT_SERVICE_ID='<sandbox-product-service-id>'
$env:DPO_PAY_SERVICE_SERVICE_ID='<sandbox-service-service-id>'
$env:DPO_PAY_BASE_URL='https://secure.3gdirectpay.com/API/v6/'
pnpm --filter @arrivesuite/integrations exec vitest run src/dpo-pay/live.test.ts --reporter=verbose --disableConsoleIntercept
```

Set `DPO_LIVE_PAID_TOKEN` to an already-paid sandbox token to verify the paid path without repeating the hosted-page step.

## API Summary

| Operation | Request | Purpose |
|---|---|---|
| Create token | `POST /API/v6/` with `Request=createToken` | Payment intent (FR-5.17.2) |
| Verify token | `POST /API/v6/` with `Request=verifyToken` | Status and reconciliation (FR-5.17.6) |
| Refund token | `POST /API/v6/` with `Request=refundToken` | Full or partial refund (FR-5.17.5) |
| Guest return | `RedirectURL` / `BackURL` | Call `verifyToken` before confirming |

DPO Pay v6 is XML, not JSON. Send `Content-Type: application/xml`; parse the `<Result>` element. `900` means "not paid yet"; a paid transaction is `000` with `ResultExplanation` = `Transaction Paid`.

## Acceptance Criteria

- Five or more end-to-end cycles: create, verify, return, refund, idempotency. **Progress: 5/5 payment cycles; callback idempotency and Paystack fallback remain.**
- Paid state is derived from `verifyToken`, never from a return URL.
- Duplicate returns/callbacks cannot create a second payment or confirmation.
- Refunds cannot exceed the original charge or run twice.
- Sandbox credentials stay in `.env.local`.
- Paystack fallback is validated before Phase 1.

## References

- `SPIKE.md` — full plan and XML examples
- `packages/integrations/src/dpopay.ts` — production client
- `docs/requirements/03-requirements.md` §5.17
- `docs/requirements/06-delivery.md` D23
- ADR-0023
