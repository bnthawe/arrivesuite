# DPO Pay Sandbox Results — T0.6

**Date:** 2026-10-21  
**Environment:** DPO Pay sandbox (`https://secure.3gdirectpay.com/API/v6/`)  
**Account:** Sandbox Account 1 (public test credentials from DPO docs)  
**Result:** 1 of 5 required cycles complete

---

## Cycle 1 — Create, Pay, Verify

### 1. Create token

| Field | Value |
|---|---|
| Company ref | `ARS-T06-MVIFOMAF` |
| Amount | `100.00` |
| Currency | `BWP` |
| TransToken | `BCC8C6AE-54AD-4A27-999D-9EBFD67F3718` |
| TransRef | `R87655644` |
| Hosted page | `https://secure.3gdirectpay.com/payv3.php?ID=BCC8C6AE-54AD-4A27-999D-9EBFD67F3718` |

**Result:** success. `createToken` returned `Result 000` with a `TransToken` and `TransRef`.

### 2. Verify before payment

```xml
<Result>900</Result>
<ResultExplanation>Transaction not paid yet</ResultExplanation>
<TransactionAmount>100.00</TransactionAmount>
<TransactionCurrency>BWP</TransactionCurrency>
```

**Result:** unpaid, as expected. `Result 900` means "not paid yet"; it must not be treated as a completed payment.

### 3. Pay on the hosted page

| Field | Value |
|---|---|
| Card | Visa `4012 8888 8888 1881` |
| Expiry | Future date |
| CVV | `123` |
| Country | Botswana |
| City | Gaborone |
| ZIP | `00000` |
| Terms | Accepted |

**Result:** payment accepted. DPO redirected to:

```text
https://example.com/api/v1/payments/dpo/return
  ?TransID=BCC8C6AE-54AD-4A27-999D-9EBFD67F3718
  &CCDapproval=4444444422
  &PnrID=ARS-T06-MVIFOMAF
  &TransactionToken=BCC8C6AE-54AD-4A27-999D-9EBFD67F3718
  &CompanyRef=ARS-T06-MVIFOMAF
```

`example.com` is a reserved documentation domain and was used only as a sandbox return URL. The production route must be the real ArriveSuite return endpoint.

### 4. Verify after payment

```xml
<Result>000</Result>
<ResultExplanation>Transaction Paid</ResultExplanation>
<CustomerCredit>1881</CustomerCredit>
<CustomerCreditType>VISA</CustomerCreditType>
<TransactionApproval>4444444422</TransactionApproval>
<TransactionCurrency>BWP</TransactionCurrency>
<TransactionAmount>100.00</TransactionAmount>
<TransactionSettlementDate>2026/10/21</TransactionSettlementDate>
```

**Result:** paid. The client returned:

```json
{
  "paid": true,
  "resultCode": "000",
  "resultExplanation": "Transaction Paid",
  "amountMajor": "100.00",
  "currency": "BWP",
  "approval": "4444444422"
}
```

---

## Findings

1. **The XML API works as implemented.** `createToken` and `verifyToken` both accept the current request shapes in `packages/integrations/src/dpopay.ts`.
2. **`Result 900` is the unpaid state.** A newly created token returns `900` / `Transaction not paid yet`.
3. **`Result 000` plus `Transaction Paid` is the paid state.** The approval code appears in `TransactionApproval` and in the return URL as `CCDapproval`.
4. **The hosted page requires the terms checkbox.** The "Pay Now" button stays inactive until the DPO terms checkbox is checked.
5. **`verifyDpoToken` was hardened.** It now requires a paid explanation, not just `Result 000`, so a `000` response with a contradictory explanation cannot mark a booking paid.
6. **The sandbox does not challenge this test Visa with 3-D Secure.** EU-card 3-D Secure remains unvalidated (§19.3).

---

## Remaining T0.6 Work

- [ ] 4 more end-to-end cycles (target: 5+ total).
- [ ] Duplicate return/callback delivery and idempotency.
- [ ] Partial refund and duplicate-refund rejection.
- [ ] Paystack fallback shape and error mapping.
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
