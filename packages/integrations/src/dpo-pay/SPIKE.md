# DPO Pay Sandbox Integration Spike

**Goal:** validate DPO Pay sandbox for the Phase 0 → 1 gate (5+ end-to-end payment cycles)  
**Status:** 5 of 5 payment cycles complete (2026-10-21); refund and duplicate-verify checks complete; app-level callback idempotency and Paystack fallback pending

**Owner:** Solo developer  
**Deadline:** Day 3 (T0.6)  
**Risk:** 85% confidence per ADR-0023; covers payment capture, reconciliation, and idempotency

> The production client is `packages/integrations/src/dpopay.ts`. DPO Pay v6 is an XML API. This directory contains the spike plan and the local test harness. Do not add a second JSON/axios client.

---

## Sandbox Details

| Item | Value |
|---|---|
| Sandbox URL | `https://secure.3gdirectpay.com/API/v6/` |
| Docs | `https://docs.dpopay.com/` |
| Test environment | Simulated payments; no funds transferred |
| Merchant auth | Company Token + Product Service ID |
| Request format | `POST` with `Content-Type: application/xml` |

---

## Test Credentials

Get these from the DPO Pay sandbox page and keep them in `apps/web/.env.local` or your shell. Never commit them.

```text
DPO_PAY_COMPANY_TOKEN=<company-token>
DPO_PAY_PRODUCT_SERVICE_ID=<product-service-id>
DPO_PAY_SERVICE_SERVICE_ID=<service-service-id>
DPO_PAY_BASE_URL=https://secure.3gdirectpay.com/API/v6/
DPO_PAY_MODE=sandbox
```

For local development without credentials:

```text
NEXT_PUBLIC_BYPASS_DPO_FOR_DEV=true
```

The bypass returns deterministic sandbox tokens and never calls the gateway. It must never be enabled in production.

---

## API Endpoints to Validate

### 1. Create Token (Payment Intent)

**Endpoint:** `POST /API/v6/`

**Request:**

```xml
<?xml version="1.0" encoding="utf-8"?>
<API3G>
  <CompanyToken>{{COMPANY_TOKEN}}</CompanyToken>
  <Request>createToken</Request>
  <Transaction>
    <PaymentAmount>100.00</PaymentAmount>
    <PaymentCurrency>BWP</PaymentCurrency>
    <CompanyRef>{{BOOKING_REF}}</CompanyRef>
    <CompanyRefUnique>0</CompanyRefUnique>
    <PTL>5</PTL>
    <RedirectURL>{{FRONTEND_URL}}/api/v1/payments/dpo/return</RedirectURL>
    <BackURL>{{FRONTEND_URL}}/api/v1/payments/dpo/return</BackURL>
    <customerEmail>{{EMAIL}}</customerEmail>
    <customerFirstName>{{FIRST_NAME}}</customerFirstName>
    <customerLastName>{{LAST_NAME}}</customerLastName>
  </Transaction>
  <Services>
    <Service>
      <ServiceType>{{PRODUCT_SERVICE_ID}}</ServiceType>
      <ServiceDescription>Hotel booking</ServiceDescription>
      <ServiceDate>{{YYYY/MM/DD HH:mm}}</ServiceDate>
    </Service>
  </Services>
</API3G>
```

**Response:**

```xml
<API3G>
  <Result>000</Result>
  <ResultExplanation>Transaction Created</ResultExplanation>
  <TransToken>{{TRANSACTION_TOKEN}}</TransToken>
  <TransRef>{{GATEWAY_REF}}</TransRef>
</API3G>
```

**Acceptance:**

- Token created for the requested amount and currency.
- `TransToken` and `TransRef` stored against the payment intent.
- No card data is sent to or stored by ArriveSuite.

---

### 2. Verify Token (Reconciliation)

**Endpoint:** `POST /API/v6/`

**Request:**

```xml
<?xml version="1.0" encoding="utf-8"?>
<API3G>
  <CompanyToken>{{COMPANY_TOKEN}}</CompanyToken>
  <Request>verifyToken</Request>
  <TransactionToken>{{TRANSACTION_TOKEN}}</TransactionToken>
</API3G>
```

**Response:**

```xml
<API3G>
  <Result>000</Result>
  <ResultExplanation>Transaction Paid</ResultExplanation>
  <TransactionAmount>100.00</TransactionAmount>
  <TransactionCurrency>BWP</TransactionCurrency>
  <TransactionApproval>{{APPROVAL_CODE}}</TransactionApproval>
</API3G>
```

**Acceptance:**

- Paid state comes from `verifyToken`, not from a return URL query string.
- Amount and currency match the payment intent.
- A failed or pending result leaves the intent in its current state and raises no false confirmation.

---

### 3. Return / Callback Handling

DPO Pay returns the guest to the `RedirectURL`/`BackURL`. The return route must call `verifyDpoToken` before confirming the booking. Treat every query parameter and callback body as untrusted.

If server-to-server callbacks are enabled in the sandbox, verify them the same way: extract the transaction token, call `verifyToken`, and only then update the payment intent. Do not confirm a payment from payload fields alone.

**Acceptance:**

- Duplicate return/callback deliveries are idempotent.
- A replayed token cannot create a second payment or booking confirmation.
- The booking state machine transition is atomic with the payment capture.

---

### 4. Refund (T0.6.6; production refund flow lands in Phase 1)

**Endpoint:** `POST /API/v6/`

**Request:**

```xml
<?xml version="1.0" encoding="utf-8"?>
<API3G>
  <Request>refundToken</Request>
  <CompanyToken>{{COMPANY_TOKEN}}</CompanyToken>
  <TransactionToken>{{TRANSACTION_TOKEN}}</TransactionToken>
  <refundAmount>50.00</refundAmount>
  <refundDetails>Guest cancellation</refundDetails>
</API3G>
```

**Response:**

```xml
<API3G>
  <Result>000</Result>
  <ResultExplanation>Refund OK</ResultExplanation>
</API3G>
```

**Acceptance:**

- Partial and full refunds are supported.
- A refund cannot exceed the original charge or be issued twice.
- Two-person approval above the FR-5.16.14 threshold is enforced before the provider call.

---

## Implementation Checklist

- [x] T0.6.1 Document the DPO Pay v6 XML contract in this spike.
- [x] T0.6.2 Add local tests for config, create, verify, refund, and sandbox bypass.
- [x] T0.6.3 Run createToken against the sandbox with 100 BWP (500 and 1,000 BWP still pending).
- [x] T0.6.4 Run verifyToken before and after payment; `900` unpaid and `000` paid confirmed.
- [ ] T0.6.5 Deliver duplicate return/callback notifications through the app and verify idempotency (T0.3 dependency). Provider-level duplicate `verifyToken` calls are stable.
- [x] T0.6.6 Partial refund and over-refund rejection verified. **DPO does not use `refundRef` as an idempotency key**, so the app must prevent duplicate refunds.
- [ ] T0.6.7 Validate the Paystack fallback shape and error mapping (needs Paystack credentials).
- [x] T0.6.8 Record sandbox results in `SANDBOX_RESULTS.md`.

The local harness:

```bash
pnpm --filter @arrivesuite/integrations test
pnpm --filter @arrivesuite/integrations typecheck
```

---

## Success Criteria (Phase 0 → 1 Gate)

Five or more end-to-end cycles covering:

> **Progress:** 5 of 5 payment cycles complete on 2026-10-21. Refund and duplicate-verify checks are recorded in `SANDBOX_RESULTS.md`; app-level callback idempotency and Paystack fallback remain.

1. Create token (payment intent)
2. Verify token and reconcile
3. Return/callback handling
4. Refund
5. Idempotency on duplicate requests and notifications

Plus:

- Sandbox credentials live only in `.env.local`, never in git.
- Integration errors are normalized through `ProviderError` and carry a trace ID at the route boundary.
- Paystack fallback is validated before Phase 1 kickoff.

---

## Known Risks

1. **3-D Secure in the WhatsApp in-app browser.** Mitigation: web-first checkout for the P3 persona (§19.3).
2. **Callback reliability.** Mitigation: the 5-minute reconciliation job and `verifyToken` are the source of truth (FR-5.17.6).
3. **Sandbox throttling.** Mitigation: keep local tests mocked; run live cycles sequentially.
4. **Provider contract drift.** Mitigation: record the exact XML request/response pairs from the sandbox in T0.6.8.

---

## References

- Production client: `packages/integrations/src/dpopay.ts`
- DPO Pay docs: `https://docs.dpopay.com/`
- Requirements: §5.17 Payments & Settlement, FR-5.17.6 reconciliation
- Decision: ADR-0023 (DPO Pay primary, Paystack fallback)
