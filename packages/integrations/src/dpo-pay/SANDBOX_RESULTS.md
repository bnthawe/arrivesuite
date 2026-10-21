# DPO Pay Sandbox Results — T0.6

**Date:** 2026-10-21  
**Environment:** DPO Pay sandbox (`https://secure.3gdirectpay.com/API/v6/`)  
**Account:** Sandbox Account 1 (public test credentials from DPO docs)  
**Result:** 5 of 5 required payment cycles complete; refund and provider-verify checks complete

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

Provider-level verification is stable and safe to repeat. Full duplicate-return/callback idempotency still needs the app/database path; the `payments-capture` helper uses `providerRef` as its replay key, but concurrent-request hardening belongs to T0.3.

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

The existing refund routes already calculate the remaining balance from `refunds.amountCents`; this must remain mandatory. The approve route's `pending → approved` check is sequential, but concurrent approvals still need an atomic claim or request idempotency key (T0.3).

---

## Findings

1. **XML contract works as implemented.** `createToken` and `verifyToken` accept the current request shapes in `packages/integrations/src/dpopay.ts`.
2. **`Result 900` is the unpaid state.** A newly created token returns `900` / `Transaction not paid yet`.
3. **`Result 000` plus `Transaction Paid` is the paid state.** `verifyDpoToken` now requires the paid explanation, not just `Result 000`.
4. **The hosted page requires the terms checkbox.**
5. **Provider refunds are not idempotent.** DPO accepted two 50.00 refunds and rejected only the third for exceeding the captured amount. ArriveSuite must enforce idempotency and the refundable balance.
6. **Refund state is not visible in `verifyToken`.** After a full refund the transaction still reports `Transaction Paid` with `TransactionNetAmount 0.00`; refund status must come from the `refunds` table, not the provider verification endpoint.
7. **The sandbox does not challenge this test Visa with 3-D Secure.** EU-card 3-D Secure remains unvalidated (§19.3).

---

## Remaining T0.6 Work

- [x] 5 payment cycles.
- [x] Duplicate provider verification is stable.
- [ ] Full duplicate return/callback test through the app and database (T0.3 dependency).
- [x] Partial refund and over-refund rejection.
- [x] Duplicate-refund behaviour documented; app-level idempotency required.
- [ ] Paystack fallback shape and error mapping (needs Paystack credentials).
- [ ] EU-issued card / 3-D Secure behaviour, if DPO can provide a test card.

## Reproduce

The opt-in live tests are skipped by default:

```powershell
$env:DPO_LIVE_SANDBOX='1'
$env:DPO_PAY_COMPANY_TOKEN='<sandbox-company-token>'
$env:DPO_PAY_PRODUCT_SERVICE_ID='<sandbox-product-service-id>'
$env:DPO_PAY_SERVICE_SERVICE_ID='<sandbox-service-service-id>'
$env:DPO_PAY_BASE_URL='https://secure.3gdirectpay.com/API/v6/'
pnpm --filter @arrivesuite/integrations exec vitest run src/dpo-pay/live.test.ts --reporter=verbose --disableConsoleIntercept
```

To verify an already-paid token, also set:

```powershell
$env:DPO_LIVE_PAID_TOKEN='<transaction-token>'
```

No sandbox credentials or card data are stored in this repository.
