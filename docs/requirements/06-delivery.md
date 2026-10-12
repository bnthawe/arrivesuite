# §17 Roadmap, §18 Scope, §19 Risks, §20 Decisions, §21 Governance, §22 Traceability

> ArriveSuite Requirements v3.0. §17 is rebaselined from 13 to 10 weeks. §19 risks are new — v2.4 had none. §20 decisions register is new. §21 governance carried. §22 traceability is the consolidated change log.

---

# §17 Roadmap

## 17.1 Phase Overview (Rebaselined — 10 weeks)

| Phase | Weeks | Focus | Primary Output |
|---|---|---|---|
| Phase 0 | 1 | Foundations | Monorepo, cloud stack, worker host, DB, auth, CI |
| Phase 1 | 2 | Sourced flights + B2C | Guest can search, book, pay, receive voucher — flights |
| Phase 2 | 2 | Extranet + owned inventory | First 10–20 Botswana suppliers live, WhatsApp supplier ops |
| Phase 3 | 2 | WhatsApp booking + owned tours | WhatsApp guided guest booking, live-booking inventory |
| Phase 4 | 1 | Hardening + launch | Load test, reconciliation stable, runbooks, production cutover |
| **Total** | **8 weeks build** | | **+2 weeks elapsed** |

**v3.0 rebaseline.** v2.4 summed to 12 weeks of phases but declared 13, with milestones at weeks 5/8/10 that conflicted with phase gates at 3/5/7/8/9/10. v3.0: **8 weeks of phased work + 2 weeks elapsed buffer = 10 calendar weeks.** The scope cut is the difference: B2B portal, corporate clients, Exchange API, Viator tours, CMS, two materialized views, and three FR groups (bulk rotation/export, contract diff viewer, pricing scenario tester/dry-run UI) are out.

## 17.2 Phase 0 — Foundations (Week 1)

**Deliverables:** Turborepo monorepo (`apps/web`, `packages/db`, `pricing`, `integrations`, `ui`, `types`, `config`); Neon Postgres + PostGIS; Upstash Redis via native TCP for BullMQ; Better-Auth with `customer` realm; Drizzle schema v0 (identity, audit, hello-world booking); seed script with admin/supplier/customer; GitHub Actions CI (lint, typecheck, test, build); Sentry + Axiom; a hello-world booking `POST /api/v1/bookings` with idempotency; **BullMQ worker on a single always-on container** (ADR-0016); `infra/docker-compose.yml` retained for local Postgres/Redis; Meta Business Manager verification and display-name application **submitted now** (lead time); all 20 L1 message templates submitted for approval (§2.8.4).

**Acceptance:** fresh clone runs cleanly; `/api/v1/health` returns OK; a booking can be created and retrieved; the worker processes a reconciliation job end-to-end.

## 17.3 What Is NOT in the 10-Week MVP

**Cut, not deferred-forever:**

- B2B Agent Portal (P4) — post-MVP, §5.6
- Corporate Clients (P5) — post-MVP, §5.16.9 deferred
- Exchange API / XML-out + OTA contracts — Phase 4+
- Viator / GetYourGuide tours — Phase 4+
- CMS domain (`cms_pages`, blog, newsletter) — cut permanently (§6.9 note)
- Two of five materialized views — cut (§6.15)
- Bulk rotation, bulk export, contract diff viewer — cut, replaced by audit log (§5.13)
- Pricing scenario tester + version-comparison UI — cut, replaced by dry-run gate (§5.14)
- Reviews from guests — Phase 8 (§5.10)
- Housekeeping status over WhatsApp — post-MVP (§2.5.3)
- Generic workflow engine tables — replaced by §9.1/§9.2 explicit state machines
- Self-hosted Postgres migration — removed from roadmap; exit option only

## 17.4 Phase 1 — Sourced Flights + B2C (Weeks 2–3)

**Deliverables:** Duffel adapter (search, offer, order, cancel); pricing engine v1 (server-side signed quotes); B2C search → detail → checkout → confirmation; PayTabs payment (intent, capture, refund); WhatsApp template set live (confirmations, voucher, payment states); FX rates from Bank of Botswana hourly; R2 media/voucher storage; basic admin console (bookings list, booking detail, kill switch); ticketing workflow (§5.19); cancellation engine baseline (§5.20).

**Not included:** owned inventory onboarding, tours, cars, B2B, corporate, hotels (Amadeus moves to the same phase-slot as Duffel **only if** §19.1 coverage validates; otherwise it is a Phase 1–2 dependency and owned hotels carry Phase 2 instead).

**Acceptance:** a real guest searches, books, pays via PayTabs, and receives a WhatsApp confirmation + PDF voucher. Revenue from this phase funds the moat.

## 17.5 Phase 2 — Extranet + Owned Inventory + WhatsApp Supplier Ops (Weeks 4–5)

**Deliverables:** supplier onboarding funnel (web + WhatsApp, §5.5.2); extranet property CRUD, room types, rate plans, availability calendar, media; First 10–20 Botswana suppliers in Maun/Kasane/Gaborone; owned inventory flows through the same pricing engine and booking envelope; trust signals in B2C (Botswana Verified vs Partner); admin Supplier Ops (onboarding queue, health, contracts); content production tools; WhatsApp supplier commands L2 (§5.4): CONFIRM/DECLINE, AVAIL/RATE with confirmation gates, PAYOUTS/RECEIVED; extranet trust score computed nightly.

**Acceptance:** a guest can book a Botswana lodge alongside a sourced hotel in one search. Owned share of GMV > 0% and the §1.8 metric is live on `mv_owned_share_of_gmv`.

## 17.6 Phase 3 — WhatsApp Guest Booking + Owned Tours (Weeks 6–7)

**Deliverables:** WhatsApp guest guided flow L3, domestic-first (§5.3.5); supplier WhatsApp ops extended to departures and availability (§5.4.4); owned tours with departures and pax tiers; WhatsApp booking analytics; admin shows WhatsApp threads in booking detail; PayTabs payment links for WhatsApp checkout (Phase 3 gate per §5.3.8); natural-language parsing **not** in this phase — LLM parsing is Phase 3+ only after the evaluation harness (§5.3.6) exists.

**Acceptance:** a guest completes a booking via WhatsApp menu flow end-to-end for owned inventory; supplier confirms via WhatsApp; guided flow is resumable in WhatsApp and on the web.

## 17.7 Phase 4 — Hardening + Launch (Week 8)

**Deliverables:** load test (500 concurrent users, 100 bookings/hour); reconciliation jobs stable; alerting (Sentry/Axiom/SMS) tuned; runbooks published (rotation, incident, compromise); internal security review; metrics dashboard (owned share of GMV, bookings, suppliers, margins); demo environment with seeded data; documentation complete; production cutover.

## 17.8 Phase Gates

| Gate | Criterion |
|---|---|
| Phase 0 → 1 | CI green; hello-world booking works; worker processing jobs |
| Phase 1 → 2 | Real guest books a flight end-to-end; PayTabs capture + refund verified |
| Phase 2 → 3 | 10–20 suppliers live; WhatsApp supplier confirmation loop works; owned share metric live |
| Phase 3 → 4 | WhatsApp booking flow works end-to-end for owned inventory |
| Phase 4 complete | Load test passes; runbooks published; ops team can run the business |

**If a gate fails, the phase extends. No exceptions.** In particular, the Amadeus coverage check (§19.1) gates the sourced-hotels path.

## 17.9 Weekly Cadence

Monday sprint planning; Tuesday–Thursday build; Friday demo + retro + documentation. Weekend buffer optional. No sprint > 1 week. Ship something every Friday.

## 17.10 Team Assumption

Solo developer with contractor support for design, content production in Botswana, and field operations. If engineers join, the roadmap compresses by 4–6 weeks; if contractors are unavailable, it extends 2–4 weeks. **If the solo developer is unavailable for >1 week, the project pauses, not degrades.**

## 17.11 Budget Assumptions

| Item | Cost (BWP) |
|---|---|
| Design contractor (~40h) | 20,000 |
| Content production (20 suppliers) | 30,000 |
| Field operations | 40,000 |
| Infrastructure (Vercel, Neon, R2, Upstash, worker host) | 6,000 |
| API access (Duffel, Amadeus, PayTabs) | 15,000 |
| WhatsApp Business API + BSP evaluation buffer | 4,000 |
| Legal (BTO, contracts) | 25,000 |
| Accounting / BURS | 10,000 |
| **Total** | **~150,000 BWP (~$11,000)** |

## 17.12 Acceptance for the 10-Week Plan

Working product with sourced flights + owned hotels/tours; PayTabs live; WhatsApp guest booking and supplier ops live; 10–20 Botswana suppliers onboarded; real revenue; admin console operational; load test passing; runbooks published; production cutover. B2B portal, Exchange API, corporate, Viator: **not** in the 10-week plan.

---

# §18 Scope

## 18.1 In MVP (10 weeks)

Sourced flights (Duffel); PayTabs; WhatsApp Cloud API direct; owned hotel and tour inventory via the extranet; WhatsApp supplier ops and guest guided booking; content production tools; pricing engine with signed quotes; immutable snapshots; audit log; idempotency; multi-currency; English + Setswana; BTO verification (manual); VAT/WHT; trust signals; owned-share-of-GMV metric; explicit booking state machine.

## 18.2 Permanently Out

- Client-side price computation; unsigned quotes; bookings without idempotency; wildcard CORS; plaintext credentials; shared API keys; trusting `user_id` from request bodies; static flight tables; MD5 password hashing; `/reset`; hardcoded credentials.
- Silent price changes; generic error messages; claiming instant confirmation when ticketing is pending; non-accessible interactive components; deleting contracts (disable only); deleting audit events; revealing credentials without re-auth; rotating credentials without two-person approval.
- Metasearch; Booking.com-on-their-terms; blockchain-native anything; crypto.
- **The generic workflow engine** (`workflow_definitions` etc.) — replaced by §9 explicitly (§17.3, §6.4).

## 18.3 Deferred, Not Out

B2B portal, corporate clients, Exchange API / XML-out, Viator tours, second sourced providers (Amadeus hotels is conditional, §19.1), mobile apps (WhatsApp is the mobile app), reviews, white-label, MICE, cars beyond sourced, regional expansion (research only).

---

# §19 Risks

> **New in v3.0.** v2.4 carried no risk register.

## 19.1 Sourcing Risk — Hotels Coverage

**Risk:** Amadeus Botswana coverage is unvalidated. If Amadeus has no usable Maun/Kasane inventory at Phase 1 quality, the "sourced hotels in search results" value prop fails and Revenue from Week 5 depends on flights alone.

**Mitigation:** §12.10 adds an explicit Amadeus coverage gate — 100+ calls and 10+ end-to-end bookings in sandbox is **not sufficient**; coverage in Maun/Kasane must be validated before production cutover. If Amadeus fails, hotels fall behind owned inventory in the launch sequence; the owned-inventory phase (Phase 2) carries Phase 2.

**Owner:** solo developer + field ops.

## 19.2 Compliance — BTO Licensing Is Manual

**Risk:** v2.4's acceptance criterion "[ ] BTO license verification works" is unachievable — there is no BTO verification API. BTO licensing is a form/post/courier process with BTO grading.

**Mitigation:** v3.0 uses **BTO grading certificate + manual licence-expiry tracking** as the trust signal (§5.5.2, FR-5.5.45). The extranet stores licence number and expiry; Supplier Ops re-verifies annually. BURS TIN has no public verification API either; supplier TINs are recorded and cross-checked at filing time (§6.6 `tax_filings`).

**Owner:** Supplier Ops.

## 19.3 Payments — EU Cards and 3-D Secure

**Risk:** Persona P3 (international traveller) pays in USD/EUR. PayTabs' handling of EU-issued cards and its 3-D Secure step-up path (PSD2 SCA) is unvalidated. A failed 3-D Secure on the WhatsApp in-app browser is the highest-friction failure in the funnel.

**Mitigation:** web is the only launch surface for 3-D Secure flows (§5.3.8); WhatsApp payment links are Phase 3 and gated on the device-matrix check §19.3.1; a card-auth failure above 5% on EU cards triggers a provider review.

### 19.3.1 Device matrix (Phase 3 gate)

Verify return-URL handling and 3-D Secure step-up in the WhatsApp in-app browser on current Android Chrome, iOS Safari WebView, and on the two WhatsApp Business numbers, before L4 payments ship.

## 19.4 Supplier Onboarding Capacity

**Risk:** Year-1 target of 300 suppliers (v2.4) implied a field organisation that ~BWP 40,000 of field-ops budget cannot fund. Trust-score and payout cadence depend on physical onboarding.

**Mitigation:** Year-1 active-supplier target cut to **100**; onboarding throughput is gated by field-ops budget, not by code. The metric is "10–20 live by Phase 2 gate, 100 by Month 12" only if field ops funds the pace.

## 19.5 Financial Model (To Be Populated)

> **v3.0 correction.** v2.4's P&L lines for Year-1 GMV (BWP 20M), 2,500 bookings/month, and 300 suppliers × 8 bookings/month do not reconcile — the implied average booking value differs by ~34× from the document's own worked example (BWP 14,375). The GMV/revenue targets are withdrawn until a bottom-up model exists.

**Required to unblock:** a bottom-up model with (a) bookings/month by source, (b) average booking value by product, (c) commission rate by class, (d) PayTabs fees, (e) messaging and refund costs, (f) owned-share trajectory from §1.8. Until §19.5 is populated, **no GMV or revenue target is published**.

## 19.6 Human-in-the-Loop Dependencies

**Risk:** LLM parsing (Phase 3+), support escalation, reconciliation failures, and ticketing review all require a human. "Escalation routes to the Admin Console Support view" assumes someone is watching it.

**Mitigation:** Phase 2–3 requires a named on-call for payments and ticketing alerts; the P6 metrics (§3.12) include a support-conversation target. The 10-week budget funds one support hire or a BPO contract — not five.

## 19.7 WhatsApp Account Health

**Risk:** Marketing-template misuse on the guest number degrades the sender ID for both numbers. Meta can cap messaging or reject templates.

**Mitigation:** two numbers (ADR-0018); STOP honoured immediately (FR-5.3.3); template category honesty (§2.8.4); sender-quality alerts (§2.8.7); BSP evaluation trigger at Phase 3 review.

## 19.8 Sourcing Risk — Duffel Order Volume

**Risk:** flight-only Phase 1 means revenue depends entirely on Duffel order fill. Duffel's Botswana/SADC fare coverage is thinner than its EU/US coverage.

**Mitigation:** Duffel is the only flight provider at launch; if SADC fill is thin, owned inventory (Phase 2) and domestic B2C (Phase 3) carry the revenue line. Monitor `booking.failed` on the ticketing path and alert at >2% (§5.15.95).

---

# §20 Decisions Register

> **New in v3.0.** Every material judgement call made during the v2.4 → v3.0 consolidation, so future readers can see what changed and why without a git archaeology exercise.

| # | Decision | Rationale |
|---|---|---|
| D1 | Agent on sourced / merchant-of-record on owned (ADR-0017) | v2.4 claimed both without specifying; P&L and liability differ per class |
| D2 | Domestic-first WhatsApp guest booking (L3 in Phase 2 for P2; P3 stays web-first) | WhatsApp booking for an EU traveller fails at 3-D Secure in the in-app browser |
| D3 | Direct Meta Cloud API Phase 1–2; BSP evaluation at Phase 3 (ADR-0019) | BSP adds per-conversation cost without a Year-1 management need |
| D4 | Roadmap rebaselinelined to 10 weeks | v2.4's weeks summed to 12 and milestones contradicted its own gates |
| D5 | "500 suppliers by Year 1" / "300 active" / "50 agencies" / 13-week total / 5-MV / bulk-rotation / contract-diff / scenario-tester scope cuts | Not fundable or not needed for a solo developer to Year 1 |
| D6 | Extranet suppliers as `suppliers` rows, not `integration_contract` rows | An API-credential vault in front of lodge owners is the wrong model; trust and auto-disable live on the supplier |
| D7 | WhatsApp phone number becomes the guest principal (§5.3.2), `accounts.email`/`password_hash` nullable (§6.17 M1/M2) | Resolves the FR-15.20 "guest checkout" vs §6.12 customer RLS contradiction |
| D8 | `accounts.channel` enum split into market-segment `channel` + `source_interface` (§6.17 M4) | One enum cannot serve both segment analytics and revenue recognition |
| D9 | Booking state machine becomes explicit §9.1/§9.2; generic workflow engine tables dropped (ADR-0020) | No workflow definition was ever written; explicit state is reviewable |
| D10 | Trust score: guest-rating weight re-normalised when reviews unavailable, <80 triggers review not auto-disable (FR-5.5.45/46) | v2.4's trust score maxed at 80 while FR-13.24 auto-disabled below 80 |
| D11 | FR-5.5.40 payout formula drops Σ(FX buffer) | Subtracting a platform P&L line from supplier payouts contradicted "BWP-native, no FX exposure" |
| D12 | FR-5.5.70 rate parity withdrawn (ADR-0021), replaced by commercial-terms disclosure (FR-5.5.72) | Unenforceable, corrosive to P1's trust requirements |
| D13 | FR-13.39–41 extranet-as-contract withdrawn; bulk rotation/export/diff viewer withdrawn | Two sources of truth; bulk operations multiply the two-person ceremony without reducing risk |
| D14 | Health checks 30s → 60s (FR-5.13.15); 2 of 5 materialized views cut | At 200 contracts the 30s cadence doubled check volume for no signal gain |
| D15 | Corporate realm removed from the v3.0 MVP schema; `corporate` row dropped from RLS table (§6.12) | Corporate clients are a Phase 4+ workstream with a separate credit engine |
| D16 | Template register is a static artefact (§2.8.4), not a database table at Phase 1 | Template approval state lives in Meta; a local mirror is a second source of truth |
| D17 | §5.1, §5.2, §5.12 reserved | Not authored; reserved to avoid inventing section numbers |
| D18 | §5.14.3 authored as the ordered calculation pipeline | v2.4 listed it as present but absent |
| D19 | FR-15.85 closed as the Availability endpoint | Numbering gap in v2.4 |
| D20 | §5.16.14 RBAC matrix authored | FR-16.53 referenced a matrix that was never written |

---

# §21 Governance

> Carried from v2.4 `00-index.md`.

**Always:** audit every write; idempotency key on every write; validate input with Zod at boundaries; encrypt PII and secrets at rest; enforce RLS; snapshot pricing at booking; emit workflow events on transitions; log to Axiom with trace IDs; write ADRs for significant decisions; update requirements when scope changes.

**Ask First:** adding a new vertical to MVP; adding a new integration provider; changing the data model for a shipped table; changing a workflow's states or transitions; adding a new realm; adding a new payment provider; changing the pricing engine's output shape; introducing a new background job; adding a new external dependency.

**Never:** hardcode secrets; store passwords in plaintext/MD5; trust `user_id` from request bodies; re-price a confirmed booking; mutate a pricing snapshot; store raw provider JSON in business tables; use wildcard CORS; expose `/reset`; skip RLS on supplier/agent/customer-scoped tables; ship a booking path without idempotency; deploy without audit logging; merge without CI passing.

---

# §22 Traceability — v2.4 → v3.0 Changes

| v2.4 artefact | v3.0 disposition |
|---|---|
| `00-index.md` | Replaced by `00-index.md` (new); archived at `archive/v2.4/00-index.md` |
| `01-executive-summary.md` §1 | Rewritten as `01-strategy.md` §1; GMV withdrawn (§19.5); weeks relabeled (§17) |
| `02-vision-and-whatsapp.md` §2, §2.5 | Rewritten; §2.6 reconstructed; §2.5 scoped to supplier-first + phased guest |
| `03-market-and-architecture.md` §3, §4 | Rewritten; §16 updated for cloud-first + worker host (ADR-0016) |
| `04a-supplier-extranet.md` | Carried into `03-requirements.md` §5.5 with FR-5.5.40/45/46/70/72 corrections |
| `04b-api-pricing-booking-admin.md` §5.13 | Carried with FR-13 → FR-5.13; extranet-contract FRs withdrawn; health checks 60s; bulk/diff cut |
| `04b-api-pricing-booking-admin.md` §5.14 | Carried with FR-14 → FR-5.14; §5.14.3 authored; scenario tester/dry-run UI withdrawn |
| `04b-api-pricing-booking-admin.md` §5.15 | Carried with FR-15 → FR-5.15; FR-15.85 closed; dedupe/approval rules tightened |
| `04b-api-pricing-booking-admin.md` §5.16 | Carried with FR-16 → FR-5.16; §5.16.14 matrix authored; corporate deferred |
| `05-data-and-integrations.md` §6 | Rewritten as `04-data-model.md`; column-level DDL for every retained table; §6.17 migration register added; CMS cut; MVs trimmed to 3 |
| `05-data-and-integrations.md` §12 | Carried into `04-data-model.md` with launch-sequence gate added |
| `06-roadmap-and-scope.md` §17, §18 | Rebaselined to 10 weeks (§17); §18 expanded with new cuts (generic workflow engine, CMS, diff viewer, scenario tester, bulk rotation/export) |
| §5.6 B2B Agent Portal | Authored as post-MVP intent in §5.6 |
| §5.3 / §5.4 WhatsApp | Authored in `05-whatsapp.md` |
| §2.8 WhatsApp commerce | Authored in `05-whatsapp.md` |
| §5.17–§5.24, §9.1, §9.2, §15, §19, §20, §21, §22, §13 | New sections authored |
| §14 Observability | Folded into §4.10, §15.2 and §5.x per-section observability FRs |

**Reading order for a new engineer:** `00-index.md` → `01-strategy.md` → `02-architecture.md` → `03-requirements.md` → `04-data-model.md` → `05-whatsapp.md` → `06-delivery.md`. Start with the section you are building; the cross-reference table in `00-index.md` tells you where the FRs for that area live.
