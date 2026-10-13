# ArriveSuite Requirements — v3.0 Index

**Version:** 3.0 · **Status:** Authoritative · **Owner:** ArriveSuite founding team · **Supersedes:** v2.4 (archived at `archive/v2.4/`)

v3.0 consolidates the v2.4 requirements corpus into one coherent document, resolves its contradictions, cuts scope that was not fundable, and adds the sections v2.4 referenced but never wrote. It does **not** change the section numbering scheme — every `§` from v2.4 survives — it changes what the sections say.

---

## What This Document Is

v3.0 is the single source of truth for what ArriveSuite builds in the 10-week MVP and what it explicitly does not build. Engineering, product, and operations read it as the authoritative answer to "is this requirement real, what does it say, and where has it caught a v2.4 bug."

v3.0 is not a strategy memo; strategy is §1–§3. It is not a design document; designs are in Figma. It is the contract between the requirements and the code.

## How It's Organized

| File | Contents |
|---|---|
| `00-index.md` | This file — metadata, governance, FR index, glossary, reading order |
| `01-strategy.md` | §1 Executive Summary, §2 Vision & Positioning (incl. §2.5 WhatsApp strategy, reconstructed §2.6 hybrid inventory), §3 Target Market & Personas |
| `02-architecture.md` | §4 System Architecture, §15 NFRs, §16 Development Environments, ADRs |
| `03-requirements.md` | §5 Functional requirements (§5.5–§5.25), §9 Booking Lifecycle (§9.1, §9.2) |
| `04-data-model.md` | §6 Data Architecture (column-level DDL, RLS, retention, MVs, migration register), §12 Integrations |
| `05-whatsapp.md` | §2.8 WhatsApp as a Transactional Interface, §5.3 Guest Booking, §5.4 Supplier Operations |
| `06-delivery.md` | §17 Roadmap (rebaselinelined), §18 Scope, §19 Risks, §20 Decisions Register, §21 Governance, §22 Traceability |

**Rule:** a section may not span two files. If you are looking for §5.5, it is in `03-requirements.md`. If you are looking for §6.4, it is in `04-data-model.md`. Section numbers are globally unique.

## Where to Find Things

| You want… | Go to |
|---|---|
| A specific FR | `03-requirements.md` (§5.x) or `05-whatsapp.md` (§5.3/§5.4); FR numbers are unique across all files |
| A table definition | `04-data-model.md` §6.x |
| An ADR | `02-architecture.md` §4.13 |
| A risk / open launch dependency | `06-delivery.md` §19 |
| What changed from v2.4 and why | `06-delivery.md` §20 (decisions) and §22 (traceability table) |
| The governance rules (always/ask-first/never) | `00-index.md` → §21 Governance in `06-delivery.md` |
| The schedule | `06-delivery.md` §17 |
| Out of scope | `06-delivery.md` §18 |

## Version History

| Version | Changes |
|---|---|
| 1.0–2.4 | See `archive/v2.4/00-index.md` — archived intact |
| 3.0 | Consolidated; §2.6 reconstructed; §9.1/§9.2 authored; §5.3/§5.4/§5.6/§5.7–5.11/§5.17–5.24/§15/§19/§20/§21/§22 authored; §6 rebuilt with column-level DDL + migration register; §17 rebaselined to 10 weeks; scope cuts recorded in §17.3/§18; three logic bugs fixed (FR-5.5.40 payout formula, FR-5.5.45 trust score re-normalisation, FR-5.13.24 auto-disable threshold); Upstash/BullMQ architecture fix (ADR-0016); agent-vs-merchant model stated (ADR-0017); WhatsApp guest-principal/RLS conflict resolved (§5.3.2, §6.17); one phase taxonomy; FR-15.85 gap closed; §5.14.3 authored; §5.16.14 RBAC matrix authored |

## Governance — Always / Ask First / Never

> Carried from v2.4; enforced via CI and code review. Full text in `06-delivery.md` §21.

**Always:** audit every write; idempotency key on every write; Zod at boundaries; encrypt PII and secrets at rest; enforce RLS; snapshot pricing at booking; emit workflow events on transitions; log to Axiom with trace IDs; ADRs for significant decisions; update requirements when scope changes.

**Ask first:** new vertical to MVP; new integration provider; change to a shipped table's model; change to a workflow's states or transitions; new realm; new payment provider; change to the pricing engine's output shape; new background job; new external dependency.

**Never:** hardcode secrets; plaintext/MD5 passwords; trust `user_id` from request bodies; re-price a confirmed booking; mutate a pricing snapshot; raw provider JSON in business tables; wildcard CORS; a `/reset` endpoint; skip RLS on scoped tables; ship a booking path without idempotency; deploy without audit logging; merge without green CI.

## Functional Requirements Index

FRs are `FR-5.x.y` (prefix `FR-5`). v2.4 used `FR-13.x`/`FR-14.x`/`FR-15.x`/`FR-16.x`; v3.0 renumbering is a pure prefix alignment — the trailing numbers are preserved. WITHDRAWN FRs retain their number and explain the replacement.

| Prefix | Domain | New/Carried |
|---|---|---|
| FR-5.3.x | WhatsApp guest booking | New (`05-whatsapp.md`) |
| FR-5.4.x | WhatsApp supplier operations | New (`05-whatsapp.md`) |
| FR-5.5.x | Supplier extranet | Carried (FR-5.5.70 parity **withdrawn**, FR-5.5.72 new) |
| FR-5.6.x | B2B agent portal | New, post-MVP |
| FR-5.7.x | Communications & notifications | New |
| FR-5.8.x | CRM & contacts | New |
| FR-5.9.x | Support & disputes | New |
| FR-5.10.x | Reviews & reputation | New |
| FR-5.11.x | Search, index & geo | New |
| FR-5.13.x | API & contract management | Carried; extranet-contract FRs withdrawn; health checks 60s; bulk/diff cut |
| FR-5.14.x | Pricing & tax engine | Carried; §5.14.3 authored; scenario tester/dry-run UI withdrawn |
| FR-5.15.x | B2C booking flow | Carried; FR-5.15.85 closed (availability endpoint) |
| FR-5.16.x | Admin & ops console | Carried; §5.16.14 RBAC matrix authored; corporate deferred |
| FR-5.17.x | Payments & settlement | New |
| FR-5.18.x | Payouts & supplier finance | New |
| FR-5.19.x | Ticketing & fulfilment | New |
| FR-5.20.x | Cancellation & refund policy engine | New |
| FR-5.21.x | Deposits & part-payment | New |
| FR-5.22.x | Chargebacks, disputes & float | New |
| FR-5.23.x | Availability & inventory integrity | New |
| FR-5.24.x | Owned ↔ sourced dedupe | New |
| FR-9.1.x | Booking state machine | New |
| FR-9.2.x | Fulfilment state machine | New |

## Glossary

| Term | Meaning |
|---|---|
| Owned inventory | Botswana supplier product onboarded and controlled via the extranet. ArriveSuite is merchant of record. |
| Sourced inventory | Third-party product (Duffel flights, Amadeus hotels) behind an `integration_contract`. ArriveSuite is agent. |
| Booking envelope | The canonical `bookings` / `booking_items` / `booking_guests` / `pricing_snapshots` structure all inventory classes funnel through. |
| Principal | The verified identity bound to a booking — a web `account`, an agent user, or a WhatsApp-verified guest number (§5.3.2). |
| Contract | An `integration_contract` — a first-class API relationship with its own credentials, health, and commercial terms. |
| Realm | The access partition for an account: `admin`, `supplier`, `agent`, `customer`. `corporate` deferred. |
| Tenant | ArriveSuite is single-tenant at launch. Multi-tenant is post-MVP. |
| BSP | Business Solution Provider — a Meta WhatsApp intermediary. Not used at launch (ADR-0019). |
| Extranet | The supplier-facing PMS (§5.5). |
| Admin console | The internal ops console (§5.16). |
| Trust score | Supplier score 0–100 from responsiveness, cancellation rate, guest rating, freshness, compliance (FR-5.5.45). |
| BTO | Botswana Tourism Organisation. Licence registry. |
| BURS | Botswana Unified Revenue Service. Tax authority. |
| ADR | Architecture Decision Record. |
| MV | Materialized view. |
| FR | Functional requirement. |
| SLO/SLA | Service-level objective / agreement. |
| RLS | Row-level security. |
| PWA | Progressive web app. |
| MV* | See Materialized view. |

## Reading Order

1. `00-index.md` — this file, governance, glossary.
2. `01-strategy.md` — what ArriveSuite is, why hybrid inventory, who it serves.
3. `02-architecture.md` — how the pieces fit, NFRs, ADRs.
4. `03-requirements.md` — the FRs for the build.
5. `04-data-model.md` — the tables you will be writing migrations against.
6. `05-whatsapp.md` — WhatsApp commerce and the two WhatsApp FRs sections.
7. `06-delivery.md` — when things ship, what is out, the risks.

Start with the section you are building; the tables above tell you where it lives.
