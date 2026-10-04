\# §17 Roadmap



\## 17.1 Phase Overview



| Phase | Weeks | Focus | Primary Output |

|---|---|---|---|

| Phase 0 | 1 | Foundations | Monorepo, cloud stack, DB, auth, CI |

| Phase 1 | 2 | Sourced inventory + B2C | Working B2C platform with flights + hotels |

| Phase 2 | 2 | Extranet + Owned inventory | 20 Botswana suppliers onboarded |

| Phase 3 | 2 | WhatsApp booking + Tours | WhatsApp-native booking live |

| Phase 4 | 1 | Admin Back Office | Reservations, Supplier Ops, Finance Ops |

| Phase 5 | 1 | B2B Agent Portal | Wholesale distribution |

| Phase 6 | 1 | WhatsApp supplier ops + Exchange API | Suppliers operate via WhatsApp; XML-out live |

| Phase 7 | 2 | Hardening + Fundraising prep | Production-ready, pitch-ready |



\*\*Total: 13 weeks.\*\*



\## 17.2 Phase 0 — Foundations (Week 1)



\*\*Goal:\*\* A working monorepo with all dependencies provisioned.



\*\*Deliverables:\*\*



\- Turborepo monorepo with `apps/web`, `packages/db`, `packages/auth`, `packages/pricing`, `packages/integrations`, `packages/ui`, `packages/types`, `packages/workflows`, `packages/config`

\- Cloud-first stack: Postgres on Neon with PostGIS, Redis on Upstash

\- Drizzle schema for identity, audit, and hello-world booking

\- Better-Auth working for customer realm

\- Seed script with 4 accounts

\- GitHub Actions CI (lint, typecheck, test, build)

\- Sentry + Axiom wired

\- Hello-world booking: POST /api/v1/bookings with idempotency key



\*\*Acceptance:\*\* Fresh clone runs cleanly. `/api/v1/health` returns OK. A booking can be created and retrieved.



\## 17.3 Phase 1 — Sourced Inventory + B2C (Weeks 2–3)



\*\*Goal:\*\* A working B2C platform that books flights and hotels from sourced inventory.



\*\*Deliverables:\*\*



\- Duffel adapter (search, offer, order, cancel)

\- Amadeus adapter (search, offer, book, cancel)

\- Pricing engine v1 (server-side, signed quotes)

\- B2C search, detail, checkout, confirmation

\- PayTabs integration (intent, capture, refund)

\- WhatsApp notifications (booking confirmation, voucher)

\- Basic admin console (bookings list, booking detail)

\- FX rates from Bank of Botswana

\- Media storage on R2



\*\*Not included:\*\* owned inventory, tours, cars, B2B, corporate.



\*\*Acceptance:\*\* A real guest can search flights and hotels, book, pay via PayTabs, and receive a WhatsApp confirmation and PDF voucher. Revenue from Week 5.



\## 17.4 Phase 2 — Extranet + Owned Inventory (Weeks 4–5)



\*\*Goal:\*\* First 20 Botswana suppliers onboarded and their inventory live.



\*\*Deliverables:\*\*



\- Supplier onboarding funnel (web + WhatsApp)

\- Extranet: property CRUD, room types, rate plans, availability calendar, media upload

\- First 20 Botswana suppliers (lodges, guesthouses, camps in Maun, Kasane, Gaborone)

\- Owned inventory flows through the same pricing engine and booking layer

\- Trust signals in B2C (Botswana Verified vs. Partner)

\- Admin console: supplier hub, onboarding queue

\- Content production tools (photo upload, description editor)



\*\*Not included:\*\* tours, activities, cars, MICE.



\*\*Acceptance:\*\* A guest can book a Botswana lodge alongside a sourced hotel in the same search results. Owned share of GMV > 0%.



\## 17.5 Phase 3 — WhatsApp Booking + Tours (Weeks 6–7)



\*\*Goal:\*\* WhatsApp-native booking flow live. Tours and activities available.



\*\*Deliverables:\*\*



\- WhatsApp search flow (LLM parsing for natural language)

\- WhatsApp payment links

\- WhatsApp supplier confirmations (CONFIRM/DECLINE commands)

\- Viator or GetYourGuide adapter for global tours

\- Owned tours from Botswana suppliers

\- Tour detail, departure selection, pax tiers

\- WhatsApp booking analytics

\- Admin console: WhatsApp threads visible in booking detail



\*\*Not included:\*\* cars, insurance, MICE, corporate.



\*\*Acceptance:\*\* A guest can complete an entire booking via WhatsApp (search → book → pay → voucher). Supplier can confirm via WhatsApp.



\## 17.6 Phase 4 — Admin Back Office (Week 8)



\*\*Goal:\*\* Operations console complete for Reservations, Supplier Ops, and Finance Ops.



\*\*Deliverables:\*\*



\- Reservations desk (queue, priorities, SLA tracking)

\- Supplier Ops (onboarding pipeline, contract management, health monitoring)

\- Finance Ops (payout runs, reconciliation, tax filings)

\- Audit log screen

\- Settings screen (platform, integrations, feature flags)

\- Role-based access control enforced at UI and API



\*\*Not included:\*\* corporate portal, dispute workflow, content review.



\*\*Acceptance:\*\* Ops team can run the business end-to-end from the console.



\## 17.7 Phase 5 — B2B Agent Portal (Week 9)



\*\*Goal:\*\* Wholesale distribution to travel agents.



\*\*Deliverables:\*\*



\- Agency onboarding

\- Agency sub-users with roles

\- Net rates visible to agents

\- Agent-specific pricing in the pricing engine

\- Agent booking flow (on behalf of guests)

\- Agency reporting

\- Credit limits and payment terms

\- WhatsApp for agents (booking status, new availability)



\*\*Not included:\*\* corporate portal, corporate policy engine.



\*\*Acceptance:\*\* An agency can onboard, log in, book on behalf of a guest, and receive commission reports.



\## 17.8 Phase 6 — WhatsApp Supplier Ops + Exchange API (Week 10)



\*\*Goal:\*\* Suppliers can operate via WhatsApp. Exchange API is live for OTA connections.



\*\*Deliverables:\*\*



\- WhatsApp supplier commands: availability update, rate update, housekeeping, payout confirmation

\- LLM parsing for supplier messages

\- Exchange API (REST + XML-out)

\- API key management for OTA partners

\- Rate limiting, quotas, monitoring for external API consumers

\- Webhook notifications for OTA partners

\- Documentation portal for API consumers



\*\*Not included:\*\* actual OTA contracts (Phase 7+).



\*\*Acceptance:\*\* A supplier can update availability and rates via WhatsApp. An external developer can connect to the Exchange API and search Botswana inventory.



\## 17.9 Phase 7 — Hardening + Fundraising Prep + Regional Groundwork (Weeks 11–12)



\*\*Goal:\*\* Production-ready. Pitch-ready. Ready for regional expansion.



\*\*Deliverables:\*\*



\- Load testing (500 concurrent users, 100 bookings/hour)

\- Reconciliation jobs stable

\- Alerting configured (Sentry, Axiom, SMS)

\- Runbooks published (rotation, incident, compromise)

\- Security audit (internal + external)

\- Metrics dashboard (GMV, bookings, suppliers, margins, owned share)

\- Demo environment with seeded data

\- Investor deck

\- Regional expansion research (Namibia, Zambia, Zim)

\- Documentation complete (API, onboarding, runbooks)

\- Production cutover



\*\*Acceptance:\*\* The platform can handle 10x current load. The team can demonstrate the business to investors with real numbers.



\## 17.10 Weekly Cadence



Each week has the same rhythm:



\- \*\*Monday:\*\* Sprint planning

\- \*\*Tuesday–Thursday:\*\* Build

\- \*\*Friday:\*\* Demo, retro, documentation

\- \*\*Weekend (optional):\*\* Buffer for overruns



\*\*No sprints longer than 1 week.\*\* No multi-week features. Ship something every Friday.



\## 17.11 Phase Gates



Each phase has a hard gate. The next phase does not start until the gate passes:



| Phase | Gate |

|---|---|

| Phase 0 | Local stack runs, CI passes, hello-world booking works |

| Phase 1 | A real guest can book a flight and hotel end-to-end |

| Phase 2 | 20 Botswana suppliers onboarded, owned inventory bookable |

| Phase 3 | WhatsApp booking flow works end-to-end |

| Phase 4 | Ops can run the business from the console |

| Phase 5 | An agency can onboard and book |

| Phase 6 | A supplier can operate via WhatsApp; Exchange API responds |

| Phase 7 | Load test passes; investor deck ready |



\*\*If a gate fails, the phase is extended. No exceptions.\*\*



\## 17.12 What Does Not Ship in 13 Weeks



To be explicit, the following will \*\*not\*\* be in the 13-week launch, even if they feel like they should be:



\- Mobile app (WhatsApp is the mobile app)

\- Second sourced provider for flights or hotels

\- Corporate portal

\- Full dispute resolution workflow

\- Automated payout reconciliation

\- Regional expansion (research only, not build)

\- OTA contracts (Exchange API is built, contracts are Phase 8+)

\- Advanced WhatsApp NLP (basic parsing only)

\- Reviews from guests (Phase 8)

\- Wishlists, favorites, loyalty

\- Insurance and visa modules

\- MICE booking flow

\- Car rental (beyond sourced via Rentalcars in Phase 3)

\- Multi-tenant white-label



\*\*Every one of these is real work. Every one of them can wait.\*\*



\## 17.13 Team Assumption



The roadmap assumes a \*\*solo developer\*\* with occasional contractor support for:



\- Design (mockups, brand)

\- Content production (photos, descriptions)

\- Field operations (supplier onboarding in Botswana)



\*\*If additional engineers join\*\*, the roadmap can compress by 4–6 weeks. \*\*If contractors are unavailable\*\*, the roadmap extends by 2–4 weeks.



\*\*If the solo developer is unavailable for >1 week, the project is paused, not degraded.\*\* Continuity matters more than velocity.



\## 17.14 Budget Assumptions



Rough budget for the 13 weeks:



| Item | Cost (BWP) |

|---|---|

| Developer time (solo, \~500 hours) | Variable (founder) |

| Design contractor (\~40 hours) | 20,000 |

| Content production (first 20 suppliers) | 30,000 |

| Field operations (onboarding trips) | 40,000 |

| Infrastructure (Vercel, Neon, R2, Upstash) | 5,000 |

| API access (Duffel, Amadeus, PayTabs sandbox/prod) | 15,000 |

| WhatsApp Business API | 3,000 |

| Legal (BTO licensing, contracts) | 25,000 |

| Accounting, BURS registration | 10,000 |

| \*\*Total\*\* | \*\*\~148,000 BWP (\~$11,000 USD)\*\* |



This is a \*\*lean launch budget\*\*. Most of it is content, field ops, and legal — not technology.



\## 17.15 Acceptance Criteria for the 13-Week Plan



The full 13-week plan is complete when:



\- \[ ] Working product with sourced + owned inventory

\- \[ ] WhatsApp booking flow end-to-end

\- \[ ] 20 Botswana suppliers onboarded

\- \[ ] Real revenue from bookings

\- \[ ] Admin console operational

\- \[ ] B2B agent portal live

\- \[ ] Exchange API live

\- \[ ] Fundraising materials ready

\- \[ ] Investor deck ready

\- \[ ] Owned share of GMV > 0% and growing

\- \[ ] Load test passing

\- \[ ] Security audit passed

\- \[ ] Runbooks published

\- \[ ] Production cutover complete



\---



\# §18 Out of Scope



\## 18.1 Out of MVP



The following are deliberately not in the 13-week MVP:



\*\*Sourced inventory:\*\*



\- Rentalcars (Phase 3)

\- Second flight provider (Travelport, Sabre) — Phase 4

\- Second hotel provider (Hotelbeds, Expedia Rapid) — Phase 4

\- Car rental APIs beyond Local inventory — Phase 3



\*\*Owned inventory:\*\*



\- Activities beyond basic tours — Phase 3

\- MICE facilities — Phase 3

\- Full national coverage (target: 500 suppliers by Year 1) — ongoing

\- Regional consolidation (Namibia, Zambia, Zim) — Phase 4



\*\*Channels:\*\*



\- Corporate portal — Phase 2/3

\- OTA connections (XML-out, REST for Viator, Booking.com) — Phase 4

\- White-label for agencies — Phase 4



\*\*Features:\*\*



\- User accounts (B2C) — guest checkout only at launch

\- Saved payment methods — Phase 2

\- Wishlists and favorites — Phase 2

\- Loyalty points — Phase 3

\- Review submission — Phase 2

\- Referral program — Phase 3

\- Group booking tools — Phase 3

\- Subscription pricing — Phase 3

\- Mobile app (native) — never; WhatsApp is the mobile app

\- Advanced WhatsApp flows (NLP beyond basics) — Phase 3

\- AI-assisted ticket routing — Phase 3

\- Automated dispute resolution — Phase 3



\*\*Admin:\*\*



\- Mobile admin console — Phase 3

\- Custom dashboard layouts — Phase 2

\- Advanced BI / analytics — Phase 3

\- Multi-tenant admin — Phase 3



\## 18.2 Permanently Out



The following will never be part of ArriveSuite:



\*\*Architecture:\*\*



\- Client-side price computation (client displays, server determines)

\- Unsigned quotes

\- Bookings without idempotency keys

\- Client-side auth logic

\- Wildcard CORS

\- Plaintext credential storage

\- Shared API keys across contracts

\- Trusting `user\_id` from request bodies

\- Static flight tables (as in PHPTravels)

\- 5 separate booking tables (as in PHPTravels)

\- MD5 password hashing

\- `/reset` endpoint

\- Hardcoded credentials in code



\*\*Product:\*\*



\- Silent price changes

\- Generic error messages

\- Claims of instant confirmation when ticketing is pending

\- Non-accessible interactive components

\- Deleting contracts (disable only)

\- Deleting audit events (retain 7 years)

\- Revealing credentials without re-authentication

\- Rotating credentials without two-person approval

\- Any feature that compromises guest or supplier trust



\*\*Strategic:\*\*



\- Competing with Booking.com on their terms (breadth, brand)

\- Being a metasearch engine

\- Being a booking site only

\- Extracting value without reinvesting in Botswana

\- Owning inventory in countries other than through partners (in the first 3 years)



\## 18.3 Explicitly In MVP



For absolute clarity, the following are in MVP even though they might seem out:



| Feature | Why it's in |

|---|---|

| Sourced inventory (Duffel, Amadeus) | Revenue from Week 5; fundability |

| WhatsApp booking flow | Primary interface for Botswana |

| WhatsApp supplier confirmations | How suppliers will actually respond |

| Content production tools | Moat building starts Day 1 |

| Extranet (basic) | Suppliers must be able to onboard |

| Pricing engine | Everything depends on it |

| Signed quotes | Security non-negotiable |

| Audit log | Compliance non-negotiable |

| Idempotency | Reliability non-negotiable |

| Multi-currency (BWP, USD, ZAR, EUR) | Tourists pay in USD |

| English + Setswana | Local language requirement |

| BTO license verification | Botswana compliance |

| VAT (14%) + WHT (10%) | Botswana tax compliance |

| Trust signals (owned vs. sourced) | Guest clarity, honest positioning |

| Owned share of GMV metric | Strategic tracking from Day 1 |





