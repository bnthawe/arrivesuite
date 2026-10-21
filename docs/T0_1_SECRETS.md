# T0.1 Runtime Secrets

**Status:** Committed credentials and card data removed on 2026-10-21.  
**Related:** Section 12 security baseline, DPOPay sandbox docs.

## What was exposed

The repository contained DPO Pay sandbox credentials and test card numbers in
tracked files:

- `.env.example`
- `Setup-ArriveSuite-Laptop.ps1`
- `Setup-ArriveSuite-Laptop-Fixed.ps1`
- `app/api/dpo/create/route.ts` (root-level mock route)
- `packages/integrations/src/dpopay.ts` (comment)

The DPO company token, product/service ids, and test card numbers are published
sandbox values, but they do not belong in source control. The local development
values remain in the ignored `.env.local`.

## Current policy

- Runtime secrets live in `.env.local` (ignored) or the deployment secret
  manager.
- `.env.example` contains placeholders only.
- DPO sandbox values are copied from
  https://docs.dpopay.com/dpo-pay-by-network/reference/sandbox-test-credentials
  when needed; they are never committed.
- Test card numbers are supplied at test time and are not stored in the repo.
- CI uses ephemeral PostgreSQL credentials created by the GitHub Actions service
  container, not real provider keys.

## Verification

```powershell
git grep -n -E "B3F59BE7|54841|85325|5436 8862|4012 8888|3456 7890" -- ':!pnpm-lock.yaml'
git grep -n -E "sk_live_[A-Za-z0-9]|FLWSECK-[A-Za-z0-9]" -- ':!pnpm-lock.yaml' ':!**/*.test.ts'
```

Both return no matches. The only `sk_live_` strings are fake fixtures in
`packages/integrations/src/paystack.test.ts`. The only remaining DPO values are
placeholders in `.env.example`, and the sandbox documentation URL.

## Remaining

- If the published sandbox token is considered sensitive by DPO, rotate it with
  DPO support; removing it from the repository does not invalidate it.
- Production provider keys were not present in the repository. Confirm the
  deployment secret manager before the Phase 0/1 gate.
