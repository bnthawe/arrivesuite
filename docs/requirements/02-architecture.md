# §4 System Architecture, §15 NFRs, §16 Environments, ADRs

> ArriveSuite Requirements v3.0. Sections §4, §15, §16 and the ADR register.

---

# §4 System Architecture

## 4.1 Architectural Principles

ArriveSuite's architecture is built on seven principles:

1. **Hybrid schema.** Domain-specific inventory tables (owned) + canonical envelope for bookings. No polymorphic JSON for business-critical storage (§6.0.2).
2. **Two inventory engines, one booking layer.** Owned inventory is relational and authoritative. Sourced inventory is cached and thin. Bookings unify both.
3. **Server-side authority.** Pricing, quotes, availability and booking state are computed server-side. The client displays; it never determines.
4. **Idempotency everywhere.** Every write accepts and honours an idempotency key.
5. **Adapter pattern.** Every external supplier, payment provider, messaging channel and notification service is behind an interface.
6. **Event-driven workflows.** Every state transition emits an event. Every event is audited.
7. **RLS at the database layer.** Suppliers, agents and guests see only their own data.

## 4.2 High-Level Architecture

**Demand side:** B2C web, B2B portal (post-MVP), supplier extranet — all accessed directly or via WhatsApp, which is the primary operator interface from Phase 2 (§2.5.1).

**Platform engine:** Search (PostGIS + FTS), Pricing Engine (signed quotes), Booking Workflows (explicit state machines, §9.1), Payments (PayTabs), CRM, Support (threads, WhatsApp, email), Job Runner (BullMQ), Ledger (double-entry), Audit (immutable).

**Supply side:**

- Owned inventory: stays, tours, activities (via extranet)
- Sourced inventory: Flights (Duffel), Hotels (Amadeus — coverage gated, §19.1)
- Consolidated inventory: post-MVP

**Exchange layer: post-MVP.** Outbound REST API, webhooks. Consumers: OTAs, GDS, agents. See §17.3 — this is a Phase 5+ commitment with no committed partner.

## 4.3 Request Flow — B2C Booking (Sourced)

```
Guest searches on web
  → Search API (multi-inventory)
  → Results merged, deduped, ranked
  → Guest selects product
  → Pricing Engine resolves net + markup + tax + FX (server-side)
  → Signed quote issued with 15-min expiry
  → Guest enters details
  → Booking created (draft → pending_payment)
  → Workflow instance started (§9.1)
  → Payment intent created (PayTabs)
  → Guest redirected to PayTabs
  → PayTabs webhook → Payment captured
  → Workflow → ticketing (flights) / instant confirm (hotels)
  → Duffel order created (§5.19)
  → Workflow → ticketed
  → Voucher PDF generated → stored in R2
  → WhatsApp notification sent (template)
  → Ledger entries posted
  → Reconciliation scheduled
```

## 4.4 Request Flow — Supplier Onboarding

```
Supplier applies via web or WhatsApp
  → Onboarding workflow started
  → KYC collected (legal name, BTO licence, tax ID, bank details)
  → Documents uploaded (R2)
  → Supplier Ops review
  → BTO licence + grading verified MANUALLY (§19.2)
  → Approve → contract sent
  → Contract signed (e-sign)
  → Extranet account activated
  → Supplier onboards properties/tours
  → Content production (with ArriveSuite support)
  → Listing published
  → Appears in search (owned inventory)
  → Trust score begins accumulating
```

## 4.5 Request Flow — WhatsApp Supplier Ops

```
Supplier sends WhatsApp message
  → Meta webhook signature verified (raw body, before JSON parse)
  → Phone looked up → supplier or guest identified
  → Deterministic command match (§2.5.4)
  → Intent confirmed with impact statement
  → Supplier confirms (YES / CONFIRM)
  → Change applied under row lock (§5.23.4)
  → Audit events written
  → Downstream systems notified
```

**LLM parsing is not in this path.** It is Phase 3 and only reached after deterministic matching fails (§5.3).

## 4.6 Component Architecture

| Component | Technology | Purpose |
|---|---|---|
| Web app | Next.js (App Router) | B2C, extranet, admin |
| API layer | Next.js route handlers + tRPC | API contracts |
| Pricing service | TypeScript (Node) | Pricing engine, quote signing |
| Workflow engine | Explicit state machines + thin transition lib (§9.1) | Booking lifecycle |
| **Job runner** | **BullMQ on a dedicated always-on worker** | Reconciliation, notifications, ticketing retries |
| Search | Postgres FTS + PostGIS | Owned inventory search |
| Cache | Redis | Sourced inventory cache, pricing rule cache |
| Object storage | Cloudflare R2 | Media, vouchers, invoices, contracts |
| WhatsApp | Meta Cloud API (direct) | Primary messaging channel |
| Email | Resend | Transactional email |
| SMS | Local BW provider | Fallback notifications, P1 alerts |
| Payments | PayTabs | Cards + mobile money |
| FX | Bank of Botswana | BWP exchange rates |
| Ledger | Postgres (double-entry) | Financial records |
| Audit | Postgres (immutable, partitioned) | Compliance, debugging |
| Observability | Sentry + Axiom | Errors, logs |
| Analytics | PostHog | Product analytics |
| CI/CD | GitHub Actions | Lint, typecheck, test, deploy |
| Web hosting | Vercel | Web + API tier |
| **Worker hosting** | **Single always-on container (Fly.io / small VPS)** | BullMQ workers |

### 4.6.1 Worker hosting — mandatory architectural change from v2.4

v2.4 specified BullMQ on Vercel with Upstash Redis and promised a VPS migration at Phase 3+. **This does not work and could not have worked at Phase 1.**

- Upstash's REST interface does not support blocking commands (`BLPOP`, `BRPOP`). BullMQ's `Worker` holds a blocking Redis connection to run its processing loop.
- Upstash's own documentation states that the BullMQ worker model "does not survive on Vercel, Lambda, or Cloudflare Workers."
- Upstash does support BullMQ over its **native TCP endpoint**, not the `@upstash/redis` HTTPS client the plan implied.

**v3.0 decision:** one always-on container runs all BullMQ workers from Week 1. Vercel hosts only the web and API tier. This is cheaper than the alternatives, removes the "no rewrites" migration risk v2.4 carried, and is the smallest possible change to the existing deployment posture. Recorded as **ADR-0016**.

The first Phase 1 job that requires the worker is payment-webhook processing. There is no phase in which the worker host is optional.

## 4.7 Data Flow — Multi-Inventory Merge

When a guest searches for stays in Maun:

1. **Search request** hits the API with `q=Maun`, dates, pax
2. **Parallel lookups:**
   - Owned inventory (Postgres + PostGIS)
   - Sourced inventory (Amadeus + Redis cache)
3. **Merge and dedupe engine:**
   - Same property detected across sources, via the `external_property_map` table (§6.3)
   - Owned inventory wins when both describe the same property
   - Sourced result suppressed, not merely deprioritised, when mapped to an owned property **and** priced within 10% (§5.15.3)
   - Sourced result shown only when materially cheaper, and always labelled as sourced
4. **Ranking engine:** price, trust score, owned boost, rating
5. **Results returned:** "Botswana Verified" for owned, "Partner availability" for sourced

**v3.0 addition.** v2.4 said "same property detected across sources" with no algorithm. Detection is now an explicit, auditable mapping table populated by Content Ops, with a fallback to name+geo matching for unmapped properties. This matters commercially, not just technically: showing a guest two prices for the same lodge is either a margin leak or a trust failure depending on which way it resolves.

## 4.8 Security Architecture

- **Edge (Vercel/Cloudflare):** TLS, DDoS protection, WAF, rate limiting
- **App layer:** Auth (Better-Auth), RBAC, CSRF, Zod validation, CORS allowlist, idempotency keys
- **Data layer:** RLS, AES-256-GCM for PII and credentials, encrypted at rest and in transit, immutable `audit_events`
- **Integration layer:** webhook signature verification against the raw request body, encrypted credentials, circuit breakers, payload redaction

### 4.8.1 Cardholder data

v2.4 never mentioned PCI DSS or the cardholder data environment. v3.0's position:

- **ArriveSuite never stores, processes or transmits raw PAN, CVV or track data.** All card entry and tokenisation happens inside the PayTabs-hosted page.
- Cardholder data therefore never enters ArriveSuite systems, and ArveSuite's PCI DSS scope is SAQ-A.
- No card numbers, CVVs, or track data in `booking_guests`, `payments`, `integration_payloads` or logs. Redaction is enforced at the adapter boundary (§12.7).
- **Unresolved:** whether PayTabs provides a compliant 3-D Secure path for EU-issued cards, and what foreign-card acceptance rates look like in practice. Persona P3 pays in USD and EUR, which makes this a launch risk, not a Phase 4 concern. See §19.3.

## 4.9 Reliability Architecture

| Concern | Mechanism |
|---|---|
| Availability | Graceful degradation; sourced inventory degrades before owned |
| Circuit breakers | Per-provider, 5 failures in 60s opens for 30s |
| Retries | Exponential backoff, max 5 attempts; 4xx never retried except 429 with `Retry-After` |
| Idempotency | Client-generated keys, server dedupe, 24h retention |
| Reconciliation | 15 min inventory, 5 min payments, hourly FX |
| Backups | Daily snapshots + WAL for point-in-time recovery (RPO/RTO in §15.3) |
| Failover | P1 contracts auto-failover to declared target |
| Webhooks | Signature-verified, retried, dead-letter queue |
| Timeouts | Every external call, default 10s |

## 4.10 Observability Architecture

| Layer | Tool | Purpose |
|---|---|---|
| Errors | Sentry | Exceptions, performance |
| Logs | Axiom | Structured logs, search |
| Metrics | Axiom | Counters, histograms, gauges |
| Traces | Trace IDs across systems | Correlation |
| Session replay | Sentry (5% sample, PII redacted) | User session debugging |
| Uptime | External monitoring | 99.9% target (§15.2) |
| Alerts | Slack + SMS + email, severity-routed | P1/P2/P3 |

## 4.11 Deployment Architecture

**All phases — hybrid:**

```
GitHub → Vercel
  apps/web (Next.js)
  packages/pricing (route handlers)
  packages/integrations (route handlers)

GitHub → container host
  workers (BullMQ)  ← always-on, required from Phase 1

Managed: Neon (Postgres + PostGIS), Upstash (native TCP), Cloudflare R2
```

Self-hosting Postgres remains an exit option, not a scheduled phase. The interfaces permit moving piecemeal if managed-service cost or limits become a problem — but nothing in v3.0 depends on that migration, and no phase is budgeted for it.

## 4.12 Integration Architecture

Every external integration follows the same pattern:

```
Business Logic
  → Adapter Interface (TypeScript)
  → Provider Implementation
       ├─► Idempotency check
       ├─► Rate limit check
       ├─► Circuit breaker check
       ├─► Sign request
       ├─► HTTP call (with timeout)
       ├─► Verify response signature
       ├─► Normalize response
       ├─► Redact + log to integration_payloads
       └─► Return normalized result
```

## 4.13 Architecture Decision Records

### 4.13.1 Confirmed ADRs

| ADR | Decision |
|---|---|
| ADR-0001 | Next.js + TypeScript end-to-end |
| ADR-0002 | Postgres + PostGIS |
| ADR-0003 | Drizzle ORM |
| ADR-0004 | Better-Auth multi-realm |
| ADR-0005 | Hybrid schema (canonical envelope + domain tables) |
| ADR-0006 | PayTabs first payment provider |
| ADR-0007 | Duffel first flight provider |
| ADR-0008 | BWP base currency + display-currency toggle |
| ADR-0009 | Cloud-first development (Neon + Upstash) |
| ADR-0010 | WhatsApp as primary operator interface |
| ADR-0011 | Hybrid inventory strategy (§2.6) |
| ADR-0012 | Signed quotes (server-side pricing) |
| ADR-0013 | Per-API contract isolation (§5.13) |
| ADR-0014 | Idempotency on every write |
| ADR-0015 | Audit everything, immutably |

### 4.13.2 New ADRs in v3.0

**ADR-0016 — Dedicated always-on worker host for BullMQ**

- **Context:** v2.4 specified BullMQ on Vercel with Upstash. BullMQ requires blocking Redis commands; Upstash REST does not support them, and worker processes do not survive serverless function lifecycles.
- **Decision:** one always-on container runs all BullMQ workers from Week 1, using Upstash's native TCP endpoint. Vercel hosts web and API only.
- **Consequences:** ~$5–10/month. Removes the v2.4 "VPS migration at Phase 3+" commitment and its rewrite risk. The worker host becomes a single point of failure and needs a restart policy and alerting.
- **Status:** accepted.

**ADR-0017 — Agent on sourced, merchant of record on owned**

- **Context:** v2.4 claimed "both merchant-of-record and channel-aggregator" without specifying which model applied to which inventory class. This determines revenue recognition (gross vs net), refund liability, capital requirements and whether the §3.5 voucher guarantee is honest.
- **Decision:** agent on sourced (Duffel, Amadeus) — commission revenue, no principal risk, no inventory liability. Merchant of record on owned inventory — ArriveSuite is principal, guarantees the voucher, absorbs supplier non-performance and cancellation exposure.
- **Consequences:** owned inventory requires working capital, refund provisioning and supplier-failure handling. Sourced inventory is low-risk but low-margin. Revenue and GMV must be reported separately by class (§6.16). Reversible per vertical at Phase 3 review.
- **Status:** accepted.

**ADR-0018 — WhatsApp number strategy: single B2C number, separate supplier operations number**

- **Context:** v2.4 never specified how many numbers, or which. Supplier operations and guest marketing on one number invite template-category violations and reputation damage, because the same endpoint's template history is scored.
- **Decision:** two Cloud API numbers from Phase 2. One B2C guest number. One supplier operations number with its own template set. Both registered to the business.
- **Consequences:** two template approval pipelines and two quality ratings. Guest marketing templates can never be sent from the supplier number. Number ownership must be held by the business, not an individual, and recorded in the operations runbook.
- **Status:** accepted.

**ADR-0019 — Meta Cloud API direct, no BSP at launch**

- **Context:** v2.4 named Twilio, 360dialog and Wati in three different sections without choosing. BSP choice changes conversation-level pricing, template workflow and who owns the number.
- **Decision:** direct Meta Cloud API for Phase 1–2. Evaluate a BSP at Phase 3 review, triggered by either: >5,000 conversations/month, or >3 template rejections in any 30-day window.
- **Consequences:** direct API requires Meta business verification and a display-name review before sending to anyone outside the test list. This is a Phase 0 gate item (§17.2) with multi-day lead time. BSP migration later is additive — the adapter interface (§12.1) absorbs it.
- **Status:** accepted.

**ADR-0020 — Explicit booking state machines, not a generic workflow engine**

- **Context:** v2.4 specified `workflow_definitions`, `workflow_instances`, `workflow_events` and `workflow_tasks` — a general-purpose workflow engine — with no state definitions anywhere, and referenced §9.1/§9.2 for booking states in a section that was never written.
- **Decision:** explicit transition tables per vertical (§9.1), enforced by a thin typed transition library. Workflow tables record *what happened* for audit and replay; they are not a runtime engine.
- **Consequences:** adding a state requires a code change, not a config change. In exchange there is no framework to build, debug or operate, and every transition is reviewable. New verticals get a new state machine, not a new configuration.
- **Status:** accepted.

**ADR-0021 — Rate parity enforcement withdrawn**

- **Context:** v2.4 FR-5.5.70 required ArriveSuite to detect and penalise suppliers selling cheaper elsewhere.
- **Decision:** withdrawn. Replaced by commercial-terms disclosure and a preferred-supplier rate mechanism (§2.6.4).
- **Consequences:** ArriveSuite loses a theoretical pricing lever and gains supplier trust. Competitive pressure on rates comes from owning preferred-supply terms, not surveillance.
- **Status:** accepted.

---

# §15 Non-Functional Requirements

> **New in v3.0.** v2.4 listed §15 as pending while specifying more than forty P95 latency targets across five sections with no SLO framework, no capacity model, and no RPO/RTO. Targets without a capacity model are aspirations. This section supplies the framework.

## 15.1 Definitions

- **SLI** — a measured indicator (latency, availability, error rate, freshness).
- **SLO** — an objective target for an SLI over a window.
- **Error budget** — the permitted fraction of requests that may fail within the SLO window.
- **Freshness** — age of the newest data in a derived store or dashboard.

## 15.2 Service Level Objectives

| Service | SLI | SLO | Window |
|---|---|---|---|
| B2C web (cached) | availability | 99.9% | rolling 30d |
| B2C search (owned inventory) | p95 latency | < 1.5s | rolling 7d |
| B2C search (sourced, live provider) | p95 latency | < 4s | rolling 7d |
| Pricing quote | p95 latency | < 50ms | rolling 7d |
| Booking create | p95 latency | < 800ms | rolling 7d |
| Payment webhook processing | p95 latency | < 30s from provider event | rolling 7d |
| WhatsApp webhook processing | p95 latency | < 5s from provider event | rolling 7d |
| WhatsApp message delivery | success rate | > 98% | rolling 7d |
| Admin console | availability | 99.5% | rolling 30d |
| FX rate freshness | age | < 2h | continuous |
| Owned inventory freshness | age | < 24h | rolling 1d |

**Error budget policy.** When the 30-day error budget for B2C web is exhausted, feature releases pause and reliability work takes priority. This is the only release-gating rule in the system.

## 15.3 Recovery Objectives

| Objective | Target | Basis |
|---|---|---|
| **RPO** | 5 minutes | Neon PITR with WAL |
| **RTO** | 60 minutes | Documented restore runbook (§17.5) |
| Backup frequency | Daily snapshot + continuous WAL | Neon |
| Backup retention | 30 days | Cost |
| Restore test cadence | Quarterly | Untested backups are not backups |

## 15.4 Capacity Model at Launch

Year-1 planning volumes, derived from §1.8 and §3.12 rather than assumed:

| Dimension | Year 1 | Year 3 |
|---|---|---|
| Active suppliers | 100 | 1,200 |
| Owned properties | 150 | 2,000 |
| Bookings/month | 150–200 | 6,000 |
| Bookings/hour (peak) | 20 | 500 |
| Concurrent web users (peak) | 50 | 2,000 |
| WhatsApp conversations/month | 2,000 | 60,000 |
| `bookings` rows/year | 2,400 | 72,000 |
| `audit_events` rows/year | ~150,000 | ~4,000,000 |
| `integration_payloads` rows/year | ~200,000 | ~5,000,000 |

**Implications that changed the design:**

- Postgres comfortably holds all of this on a single Neon instance. **Read replicas are not required until Year 2** and are not in v3.0 scope.
- `audit_events` at 4M rows/year with a 7-year retention requirement needs **monthly range partitioning** from Day 1 (§6.2). Retrofitting partitioning onto a large table later is a maintenance-window operation.
- `integration_payloads` at 5M rows/year needs quarterly partitioning and the 30-day purge job (§6.14).
- The 30-second health-check interval in v2.4 is unnecessary at 200 contracts. **60 seconds** is the v3.0 value, which reduces check volume 2×.

## 15.5 Security Requirements

- TLS 1.2+ in transit; AES-256-GCM at rest for PII and credentials; envelope encryption via KMS-managed keys.
- RLS enforced at the database layer, not only in application code (§6.12).
- Secrets never in code, never in the repository, never in logs.
- Secrets rotation with two-person approval (§5.13.4).
- Immutable audit log; no update, no delete, enforced by database trigger and revoked UPDATE/DELETE grants (§6.2).
- PCI DSS SAQ-A scope (§4.8.1).
- Dependency scanning and secret scanning in CI; CI fails on findings.

## 15.6 Accessibility

WCAG 2.1 AA for all guest-facing and operator-facing surfaces. Contrast ≥ 4.5:1, full keyboard operability, visible focus, semantic HTML, `prefers-reduced-motion` respected, 200% zoom without horizontal scroll. **WhatsApp-rendered content is exempt** — it is not a document the platform controls (§5.3.6).

## 15.7 Privacy

- Botswana Data Protection Act compliance for all guests and suppliers (§5.5.14).
- **GDPR applies to EU source-market guests** from launch, not from a European entity. The v2.4 gap here was material: persona P3 is explicitly EU, and PostHog, Sentry session replay and Meta all process guest data.
- Lawful basis, cookie/consent banner, and data-subject rights (access, portability, erasure) apply to all guests regardless of residency.
- Session replay sampled at 5% with PII redacted before capture.
- Conversation content retained under §6.14 retention rules; LLM prompts containing guest PII are not retained by default (§5.3.5).

## 15.8 Internationalisation

English and Setswana ship in MVP (§18.3). Requirements in §13. All user-facing strings externalised; no concatenation of translatable fragments; date, number and currency formatting locale-aware.

## 15.9 Browser and Device Support

| Surface | Minimum |
|---|---|
| B2C web | Last 2 versions Chrome, Safari, Firefox, Edge; Android WebView |
| Extranet | Android 8+ (primary), iOS 15+, WhatsApp on feature phones via §5.3 |
| Admin console | Last 2 versions desktop Chrome, Safari, Edge |
| Critical-path JS | < 100KB gzipped |
| 3G | Search page interactive < 3s |

---

# §16 Development Environments

## 16.1 Environments

| Environment | Purpose | Data | Integrations |
|---|---|---|---|
| **local** | Developer machine | Seeded | Sandbox |
| **preview** | Per-PR | Seeded, ephemeral | Sandbox |
| **staging** | Pre-production verification | Anonymised production-shaped | Sandbox |
| **production** | Live | Real | Production |

**v3.0 correction.** v2.4 §16 was listed as pending with the note "needs update for cloud-first," while §1.7 Phase 0 still promised Docker. v3.0 has no Docker dependency for local development, consistent with ADR-0009. Docker Compose remains available for the worker host and for local Postgres/Redis if a developer wants it (`infra/docker-compose.yml`), but it is not required to run the stack.

## 16.2 Local Development

Prerequisites: Node ≥ 20, pnpm 9. Cloud services are reached directly with sandbox credentials from `.env.local`; there is no local database requirement.

**Definition of done for a fresh clone:** `pnpm install && pnpm dev` serves the web app, `pnpm test` passes, `/api/v1/health` returns OK, and a booking can be created and retrieved against sandbox providers.

## 16.3 Seed Data

- 1 admin (Super Admin), 1 Finance Ops, 1 Reservations operator
- 1 supplier with 1 property, 2 room types, rates and availability for 90 days
- 1 guest account bound to a test phone number
- Reference data: Botswana cities, airports, currencies, tax rules

## 16.4 Promotion Path

```
local → preview (per PR, CI green)
      → staging (on merge to main, smoke suite green)
      → production (on release tag, manual approval)
```

No direct local-to-production path exists. Production deploys are gated on a green smoke suite covering: search, quote, booking, payment intent, webhook processing, WhatsApp send.

---

## §16 Reference — Document Map

| Section | File |
|---|---|
| §1–§3 Strategy, vision, market, personas | `01-strategy.md` |
| §2.5, §2.6, §2.8 WhatsApp | `01-strategy.md`, `05-whatsapp.md` |
| §4 Architecture, §15 NFRs, §16 Environments, ADRs | `02-architecture.md` |
| §5 Functional requirements, §9 Booking state machine | `03-requirements.md` |
| §6 Data architecture, §12 Integrations | `04-data-model.md` |
| §17 Roadmap, §18 Scope, §19 Risks, §21–§22 | `06-delivery.md` |
