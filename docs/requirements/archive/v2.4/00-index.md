\# ArriveSuite Requirements Document



\*\*Version:\*\* 2.4

\*\*Status:\*\* Locked for build

\*\*Last updated:\*\* 2026

\*\*Owner:\*\* ArriveSuite founding team



\---



\## What This Document Is



This is the single source of truth for ArriveSuite — a national digital inventory layer for Botswana tourism. It supersedes all prior brainstorm documents, chat logs, and partial drafts.



\## How It's Organized



The document is split into 7 files for maintainability:



| File | Contents |

|---|---|

| `00-index.md` | This file — metadata and index |

| `01-executive-summary.md` | §1 — What ArriveSuite is, why now, business model, roadmap, metrics |

| `02-vision-and-whatsapp.md` | §2, §2.5, §2.6 — Vision, WhatsApp-first strategy, hybrid inventory strategy |

| `03-market-and-architecture.md` | §3, §4 — Target market, personas, system architecture |

| `04-functional-requirements.md` | §5.5, §5.13–§5.16 — Supplier Extranet, API Management, Pricing Engine, B2C Booking, Admin Console |

| `05-data-and-integrations.md` | §6, §12 — Data architecture (ERD per domain), integrations \& adapters |

| `06-roadmap-and-scope.md` | §17, §18 — Roadmap, out of scope |



\## Version History



| Version | Date | Changes |

|---|---|---|

| 1.0 | 2026 | Initial requirements: architecture, stack, functional requirements |

| 1.1 | 2026 | §5.13 API \& Contract Management added |

| 1.2 | 2026 | §5.14 Pricing \& Tax Engine added |

| 1.3 | 2026 | §5.15 B2C Booking Flow added |

| 1.4 | 2026 | §5.16 Admin \& Ops Console added |

| 2.0 | 2026 | Strategic reframe: national inventory layer, WhatsApp-first (§2.5) |

| 2.1 | 2026 | Hybrid inventory strategy (§2.6); §1, §2 rewritten |

| 2.2 | 2026 | §12, §17, §18 rewritten for phased rollout |

| 2.3 | 2026 | §4 System Architecture, §6 Data Architecture rewritten |

| 2.4 | 2026 | §3 Target Market, §5.5 Supplier Extranet deep-dive, §6.15 Materialized Views |



\## Where Each Requirement Lives



Each requirement has a unique FR number (`FR-X.Y`). To find a specific requirement:



\- \*\*Business model, metrics, roadmap\*\* → §1

\- \*\*Strategy, vision, WhatsApp, hybrid inventory\*\* → §2

\- \*\*Personas, market\*\* → §3

\- \*\*Architecture\*\* → §4

\- \*\*Extranet, API management, pricing, booking, admin\*\* → §5

\- \*\*Data model, ERDs, indexes, RLS\*\* → §6

\- \*\*Integrations\*\* → §12

\- \*\*Roadmap, phase gates\*\* → §17

\- \*\*Out of scope\*\* → §18



\## Traceability



Every material decision traces to a source:



\- Original brainstorm

\- PHPTravels v9 analysis

\- Mockup reviews (B2C, extranet, admin, API)

\- Strategic reframe conversations

\- Hybrid inventory strategy session



See §22 in the full document (to be authored) for the complete traceability matrix.



\## Governance



Three lists govern every decision:



\### Always



\- Audit every write

\- Idempotency key on every write

\- Validate input with Zod at boundaries

\- Encrypt PII and secrets at rest

\- Enforce RLS

\- Snapshot pricing at booking

\- Emit workflow events on transitions

\- Log to Axiom with trace IDs

\- Write ADRs for significant decisions

\- Update requirements when scope changes



\### Ask First



\- Adding a new vertical to MVP

\- Adding a new integration provider

\- Changing the data model for a shipped table

\- Changing a workflow's states or transitions

\- Adding a new realm

\- Adding a new payment provider

\- Changing the pricing engine's output shape

\- Introducing a new background job

\- Adding a new external dependency



\### Never



\- Hardcode secrets

\- Store passwords in plaintext or MD5

\- Trust `user\_id` from request bodies

\- Re-price a confirmed booking

\- Mutate a pricing snapshot

\- Store raw provider JSON in business tables

\- Use wildcard CORS

\- Expose a `/reset` endpoint

\- Skip RLS on supplier/agent/customer-scoped tables

\- Ship a booking path without idempotency

\- Deploy without audit logging

\- Merge without CI passing



\## Status



\*\*Complete:\*\*

\- §1 Executive Summary

\- §2 Vision \& Positioning

\- §2.5 WhatsApp-First Strategy

\- §2.6 Hybrid Inventory Strategy

\- §3 Target Market \& Personas

\- §4 System Architecture

\- §5.5 Supplier Extranet

\- §5.13 API \& Contract Management

\- §5.14 Pricing \& Tax Engine

\- §5.15 B2C Booking Flow

\- §5.16 Admin \& Ops Console

\- §6 Data Architecture

\- §6.15 Materialized Views

\- §12 Integrations \& Adapters

\- §17 Roadmap

\- §18 Out of Scope



\*\*Pending (documentation, not design):\*\*

\- §5.6 B2B Agent Portal deep-dive

\- §13 Localization

\- §14 Observability

\- §15 NFRs

\- §16 Dev Environment (needs update for cloud-first)

\- §19 Risks

\- §21 Governance (this file covers the essentials)

\- §22 Traceability



\*\*The pending sections do not block the build.\*\*

