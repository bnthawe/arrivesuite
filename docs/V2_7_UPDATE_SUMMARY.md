# ArriveSuite v2.7 Update Summary

**Requirements update:** 2026-10-13  
**Ported to `master`:** 2026-10-21  
**Status:** Requirements merged; Phase 0 unblocked; DPO Pay sandbox validation has 5 of 5 payment cycles complete (2026-10-21); app-level idempotency, the core booking state machine, the CI critical-path test gate, and the secrets cleanup are implemented and verified; a live Paystack sandbox run remains

---

## What Changed

### 1. Payment provider: PayTabs → DPO Pay (ADR-0023)

- **Primary:** DPO Pay (85% confidence, subject to sandbox validation)
- **Fallback:** Paystack
- **Tertiary:** Flutterwave, Stripe
- **Rationale:** lower fees and better Botswana/SADC coverage
- **Risk:** DPO Pay 3-D Secure coverage for EU-issued cards is unvalidated; mitigation is web-first checkout for the P3 persona

### 2. Pay-at-property settlement (FR-5.5.9A — new)

Walk-in and cash bookings:

- recorded in the same booking envelope as online transactions
- auto-complete 24 hours after checkout
- commission is earned on auto-completion
- suppliers can dispute or report no-show within 48 hours post-check-in

Commission debt tracking:

- `online_collected_cents − walk_in_commission_debt_cents = balance_cents`
- hard cap: **−BWP 10,000**
- manual escalation only; no automatic card pull
- monthly settlement offsets online collections against walk-in debt

Finance Ops workflow:

- a dispute or no-show pauses commission posting
- Finance Ops decides whether to waive
- the decision is recorded on the audit trail and the `commission_debt` row

### 3. Roadmap impact

| Item | v3.0 | v2.7 | Delta |
|---|---|---|---|
| Total weeks | 10 | ~11 | +8 days in Phase 4 |
| Phase 4 work | Hardening + launch | Finance Ops + hardening | + commission debt UI + reconciliation |
| Tours | Phase 3 | Phase 4 | Keeps the timeline stable |
| Phase 0 → 1 gate | 4 criteria | 5 criteria | + DPO Pay sandbox validation |

**Phase 0 → 1 gate:**

- CI green
- hello-world booking works
- worker processes jobs
- DPO Pay sandbox: 5+ payment cycles (create, verify, return, refund, idempotency)
- Paystack fallback request shape/error mapping contract-tested (live sandbox pending credentials)

---

## Requirements Files Updated

- `docs/requirements/00-index.md` — version bumped to v2.7
- `docs/requirements/03-requirements.md`
  - §5.5.9A added: pay-at-property, commission debt, manual escalation
  - §5.15.32: DPO Pay primary, Paystack fallback
  - §5.17: DPO Pay capture model, 3-D Secure posture, PCI posture
  - §5.22: chargeback intake and evidence pack wording
- `docs/requirements/06-delivery.md`
  - §18.1: MVP integrations include DPO Pay and pay-at-property
  - §18.2: automatic card pull removed
  - §20: D23 added
  - §22: traceability includes §5.5.9A

---

## Implementation

The production DPO client already exists at `packages/integrations/src/dpopay.ts`. It uses the DPO Pay v6 **XML** API and exports config, create, verify, hosted-page, and refund functions.

The spike artifacts are in `packages/integrations/src/dpo-pay/`:

- `SPIKE.md` — sandbox plan and exact XML request/response shapes
- `README.md` — credentials, commands, acceptance criteria
- `client.test.ts` — local mocked tests for config, create, verify, refund, and sandbox bypass
- `live.test.ts` — opt-in live sandbox tests, skipped unless `DPO_LIVE_SANDBOX=1`
- `SANDBOX_RESULTS.md` — evidence for the first 100 BWP create/pay/verify cycle

Do not add a separate JSON/axios DPO client. DPO Pay v6 is XML; the existing client is the integration point used by `apps/web`.

### Local verification

```bash
pnpm --filter @arrivesuite/integrations test
pnpm --filter @arrivesuite/integrations typecheck
```

The default tests mock `fetch` and run without credentials. Live sandbox cycles require DPO Pay test credentials and are opt-in via `DPO_LIVE_SANDBOX=1`.

**Sandbox progress:** 5 of 5 payment cycles complete. Each 100 BWP Visa payment returned `Result 900` before payment and `Result 000` / `Transaction Paid` after. Duplicate `verifyToken` calls are stable. Partial refunds succeeded, and a third 50.00 refund on a 100.00 payment was rejected with `999`. **DPO does not enforce `refundRef` idempotency**, so ArriveSuite prevents duplicate refunds with a route key, a locked balance check, and an atomic approval claim. Duplicate and concurrent Paystack webhooks produced one capture and one payment row; booking duplicate delivery replayed the original response. Full evidence is in `packages/integrations/src/dpo-pay/SANDBOX_RESULTS.md` and `docs/T0_3_IDEMPOTENCY.md`.

---

## Phase 0 Blockers

| Task | Effort | Blocker? | Notes |
|---|---|---|---|
| T0.1 - Secrets | 1 day | Yes | Done: committed DPO sandbox token/service ids/test cards removed; `.env.example` placeholders; runtime values stay in ignored `.env.local` (`docs/T0_1_SECRETS.md`) |
| T0.2 — Audit | 2 days | Yes | Done: request-level audit on guarded writes, cached actor resolution, domain-route opt-outs (`docs/T0_2_AUDIT.md`) |
| T0.3 - Idempotency | 1 day | Yes | Done: Redis response cache (24h), atomic capture/refund claims, 37 route files covered (`docs/T0_3_IDEMPOTENCY.md`) |
| T0.4 - State machine | 2 days | Yes | Done: §9.1 states/transition map, `pending_payment` backfill, atomic capture transition, no-show guard (`docs/T0_4_STATE_MACHINE.md`) |
| T0.5 - Tests | 3 days | Yes | Done: unit tests, DB-backed booking/capture critical path, PostgreSQL service and `pnpm test` in CI (`docs/T0_5_TESTS.md`); browser/refund E2E pending |
| T0.6 — DPO Pay sandbox | 2–3 days | Phase 1 gate | Can run in parallel with T0.1–T0.5 |

**Total:** ~8–9 days across parallel tracks. T0.6 must complete before Phase 1 kickoff.

---

## Next Steps

### Week 1 (Phase 0)

- **Day 1:** T0.1 (secrets) + T0.6.1 (DPO credentials)
- **Day 2:** T0.2 (audit) + T0.6.2 (local harness complete)
- **Day 3:** T0.3 (idempotency) + T0.6.3 (sandbox create)
- **Day 4:** T0.4 (state machine) + T0.6.4 (verify and return)
- **Day 5:** T0.5 (tests) + T0.6.5–6 (idempotency and refund)
- **Day 6:** Phase 0 acceptance gate

### Phase 0 → 1 Gate

- CI green (lint, typecheck, tests)
- hello-world booking works
- worker processes jobs
- DPO Pay: 5+ sandbox cycles
- Paystack fallback request shape/error mapping contract-tested (live sandbox pending credentials)

→ **Phase 1 kickoff (Day 7)**

---

## Key Decisions

| Decision | Rationale |
|---|---|
| DPO Pay primary | Lower fees than PayTabs; better Botswana/SADC support; Paystack backup |
| Pay-at-property in MVP | Domestic supplier demand; commission debt tracking keeps the financial model simple |
| Manual escalation only | Automatic card pull contradicts the merchant-of-record model |
| Debt cap −BWP 10,000 | Hard limit with a clear Finance Ops escalation path |
| Sandbox validation gate | Mitigates the 85% confidence risk before Phase 1 |

---

## References

- Requirements: `docs/requirements/` (v2.7)
- DPO spike: `packages/integrations/src/dpo-pay/SPIKE.md`
- Decision register: `docs/requirements/06-delivery.md` §20 (D23)
- Risk register: `docs/requirements/06-delivery.md` §19
- Production client: `packages/integrations/src/dpopay.ts`

---

## Approval

Requirements v2.7 are approved for build. DPO Pay sandbox validation remains an explicit Phase 0 → 1 gate; it is not yet complete.
