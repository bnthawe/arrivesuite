# DPO Pay Sandbox Results — T0.6

**Date:** 2026-10-21  
**Environment:** DPO Pay sandbox (`https://secure.3gdirectpay.com/API/v6/`)  
**Account:** Sandbox Account 1 (public test credentials from DPO docs)  
**Result:** 5 of 5 required payment cycles plus 2 optional amount cycles complete; app-level DPO return replay, refund, and provider-verify checks complete

---

## Payment Cycles

All five cycles used 100.00 BWP and DPO’s public sandbox Visa test card.

| Cycle | Company ref | TransToken | TransRef | Approval |
|---|---|---|---|---|
| 1 | `ARS-T06-MVIFOMAF` | `BCC8C6AE-54AD-4A27-999D-9EBFD67F3718` | `R87655644` | `4444444422` |
| 2 | `ARS-T06-C2-MVIG3CWU` | `02C1CE0C-400A-4302-BD3C-37FA6C0826CE` | `R87655928` | `4444444429` |
| 3 | `ARS-T06-C3-MVIG5R7P` | `1E852620-B259-404B-B49D-C4460E6A3F6D` | — | `4444444431` |
| 4 | `ARS-T06-C4-MVIG7J5I` | `B6E09918-2CBA-4277-98A9-06BB29801BBD` | — | `4444444432` |
| 5 | `ARS-T06-C5-MVIG89E1` | `6EE5F896-B1D4-4442-AB38-E8BBA6816FF5` | — | `4444444433` |

Each cycle:

1. `createToken` returned `Result 000` with a `TransToken` and `TransRef`.
2. `verifyToken` before payment returned `Result 900` / `Transaction not paid yet`.
3. The hosted page accepted the sandbox Visa.
4. `verifyToken` after payment returned `Result 000` / `Transaction Paid` with the approval code.

The hosted page requires the DPO terms checkbox before “Pay Now” becomes active.

### Optional amount cycles (T0.6.3)

Tokens were created through `POST /api/v1/dpo/create` and paid through the same
sandbox hosted page. `verifyToken` returned `000` / `Transaction Paid` for each.

| TransToken | Amount | Approval |
|---|---|---|
| `2DF8D4F5-B4E5-431B-9747-0912416EDA58` | 500.00 BWP | `4444444459` |
| `8BA5E304-FAEA-4EB7-88AC-D0BC3EC07357` | 1,000.00 BWP | `4444444404` |

These were amount-validation runs only; no booking or payment intent was created
for them in the app database.

---

## Sandbox vs simulation

`DPO_PAY_MODE=sandbox` selects the provider test environment. It is not the same
as local simulation:

- `DPO_PAY_SIMULATE=true` returns local fake responses and never calls DPO.
- With a usable company token and no explicit simulate flag, sandbox mode calls
  the real DPO sandbox gateway.
- Live mode never simulates, even if a simulate flag or the public development
  bypass is present.
- Paystack follows the same split through `PAYSTACK_MODE` and
  `PAYSTACK_SIMULATE`.

---

## Duplicate Verify Check

Each paid token was verified twice. Both calls returned identical results:

```json
{
  "resultCode": "000",
  "resultExplanation": "Transaction Paid",
  "amountMajor": "100.00",
  "currency": "BWP",
  "approval": "4444444422"
}
```

Provider-level verification is stable and safe to repeat.

---

## App-level Duplicate Delivery (2026-10-21)

The app/database path was tested against a local `arrivesuite_test` database and Redis DB 1. Paystack signed webhook deliveries and the DPO return route both use the same `capturePaymentByProviderRef` helper.

| Check | Result |
|---|---|
| Same `Idempotency-Key` + same booking payload | First `201`; second `201` with `Idempotent-Replayed: true`; one booking row |
| Same `Idempotency-Key` + different booking payload | `409` `idempotency_key_conflict` |
| Duplicate Paystack webhook, sequential | First returned a `paymentId`; second returned `{ "ok": true, "replayed": true }` |
| Duplicate Paystack webhook, concurrent | One `paymentId`; one `{ "replayed": true }`; one `payments` row |
| Duplicate DPO return, sequential | First `200 { "ok": true, "paymentId": ... }`; replay `200 { "ok": true, "replayed": true }`; one `payments` row |
| Booking after DPO capture | `confirmed`; `paid_cents = 10000` (not doubled); `booking.transition` and `payment.captured` audit rows |
| Duplicate refund request key | First `201`; second replayed the same refund |
| Concurrent refund requests, different keys | One `201`; one `409` balance exceeded; one refund row |
| Concurrent refund approvals, different keys | One `200` completed; one `409` already processing; one `refund.completed` audit |
| Booking after refunds | `refunded_cents = 10000` (not doubled) |

The DPO return replay used the paid 100.00 BWP sandbox token linked to a payment intent in the isolated test database. See `docs/T0_3_IDEMPOTENCY.md` for implementation and coverage.

---

## Refund Check

Cycle 5 was used for refund testing.

| Attempt | Amount | Result |
|---|---|---|
| First partial refund | 50.00 BWP | `000` / `Refund successful` |
| Second partial refund | 50.00 BWP | `000` / `Refund successful` |
| Third partial refund | 50.00 BWP | `999` / `Refund request is larger than amount paid in transaction. (150.00>100.00)` |

After both 50.00 refunds, `verifyToken` still returned:

```xml
<Result>000</Result>
<ResultExplanation>Transaction Paid</ResultExplanation>
<TransactionAmount>100.00</TransactionAmount>
<TransactionNetAmount>0.00</TransactionNetAmount>
```

### Important finding

**DPO does not treat `refundRef` as an idempotency key.** The second refund used a different `refundRef` and succeeded again. A retry with the same logical refund could therefore double-refund unless ArriveSuite enforces idempotency and the remaining refundable balance.

The refund routes calculate the remaining balance from `refunds.amountCents`; this remains mandatory. The approve route now uses an atomic `pending → approved` conditional update plus the route-level `Idempotency-Key` guard, so concurrent approvals cannot both reach the provider.

---

## Findings

1. **XML contract works as implemented.** `createToken` and `verifyToken` accept the current request shapes in `packages/integrations/src/dpopay.ts`.
2. **`Result 900` is the unpaid state.** A newly created token returns `900` / `Transaction not paid yet`.
3. **`Result 000` plus `Transaction Paid` is the paid state.** `verifyDpoToken` now requires the paid explanation, not just `Result 000`.
4. **The hosted page requires the terms checkbox.**
5. **Provider refunds are not idempotent.** DPO accepted two 50.00 refunds and rejected only the third for exceeding the captured amount. ArriveSuite must enforce idempotency and the refundable balance.
6. **Refund state is not visible in `verifyToken`.** After a full refund the transaction still reports `Transaction Paid` with `TransactionNetAmount 0.00`; refund status must come from the `refunds` table, not the provider verification endpoint.
7. **The sandbox does not challenge this test Visa with 3-D Secure.** DPO’s published sandbox credentials do not include a 3-D Secure test card; DPO documents 3-D Secure as case-by-case. EU-card 3-D Secure remains unvalidated (§19.3).
8. **App-level idempotency now covers duplicate delivery.** Route responses are cached in Redis for 24 hours, captures claim the intent atomically, and refund approval claims the pending refund atomically.
9. **Paystack live sandbox validation is blocked by the local key.** A real `POST /transaction/initialize` with the local `sk_test_...` key returned `HTTP 401` (`ProviderError`, code `auth`, retryable `false`). The client contract and error mapping are covered by mocked tests; a valid test key is still required.

---

## Remaining T0.6 Work

- [x] 5 payment cycles.
- [x] Duplicate provider verification is stable.
- [x] Full duplicate return/callback test through the app and database (T0.3). Sequential and concurrent Paystack webhooks produced one capture; a paid DPO token replayed through the return route produced one capture.
- [x] Optional 500.00 and 1,000.00 BWP sandbox cycles.
- [x] Partial refund and over-refund rejection.
- [x] Duplicate-refund behaviour documented; app-level idempotency implemented with an atomic approval claim.
- [x] Paystack fallback shape and error mapping covered by mocked tests (`paystack.test.ts`, `http.test.ts`). Live Paystack sandbox validation remains blocked by an invalid local test key (`HTTP 401`).
- [ ] EU-issued card / 3-D Secure behaviour; DPO publishes no 3-D Secure test card and assesses it case-by-case.

## Reproduce

The opt-in live tests are skipped by default:

```powershell
$env:DPO_LIVE_SANDBOX='1'
$env:DPO_PAY_COMPANY_TOKEN='<sandbox-company-token>'
$env:DPO_PAY_PRODUCT_SERVICE_ID='<sandbox-product-service-id>'
$env:DPO_PAY_SERVICE_SERVICE_ID='<sandbox-service-service-id>'
$env:DPO_PAY_BASE_URL='https://secure.3gdirectpay.com/API/v6/'
$env:DPO_PAY_MODE='sandbox'
$env:DPO_PAY_SIMULATE='false'
pnpm --filter @arrivesuite/integrations exec vitest run src/dpo-pay/live.test.ts --reporter=verbose --disableConsoleIntercept
```

To verify an already-paid token, also set:

```powershell
$env:DPO_LIVE_PAID_TOKEN='<transaction-token>'
$env:DPO_LIVE_PAID_AMOUNT='100.00' # use 500.00 or 1000.00 for optional cycles
```

No sandbox credentials or card data are stored in this repository.
