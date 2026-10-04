\# §6 Data Architecture



\## 6.1 Overview



The data model is organized into \*\*8 domains\*\*, each with its own set of tables. Total: \*\*\~85 tables\*\*.



| Domain | Tables | Purpose |

|---|---|---|

| Identity \& CRM | 14 | Accounts, realms, agencies, suppliers, contacts, tasks |

| Supplier Inventory (Owned) | 20 | Properties, rooms, rates, availability, tours, departures |

| Unified Booking | 13 | Bookings, items, guests, snapshots, workflows |

| Pricing \& Tax | 11 | Rules, versions, tax rules, FX, rounding, discounts |

| Payments \& Finance | 13 | Intents, payments, refunds, ledger, payouts, reconciliations |

| Integrations | 6 | Providers, contracts, credentials, health, payloads |

| Geo \& Reference | 6 | Countries, cities, airports, airlines, locales |

| CMS, Settings \& Support | 12 | CMS, blog, settings, messaging, WhatsApp |



\## 6.2 Domain 1 — Identity \& CRM



\*\*Tables:\*\*



\- `accounts` — every user (customer, agent, corporate, supplier, admin)

\- `sessions` — active sessions

\- `verification\_tokens` — email/phone verification, magic links

\- `two\_factor` — 2FA secrets

\- `agencies` — B2B travel agencies

\- `agency\_users` — sub-users under an agency

\- `roles`, `permissions`, `role\_permissions`, `account\_roles` — RBAC

\- `audit\_events` — immutable audit log

\- `contacts` — CRM contacts

\- `contact\_interactions` — calls, emails, WhatsApp, meetings

\- `contact\_notes` — internal notes

\- `crm\_tasks` — follow-ups



\*\*Key relationships:\*\*



\- `accounts.realm` discriminates persona (customer, agent, corporate, supplier, admin)

\- `agency\_users` and `suppliers` extend `accounts` for scoped realms

\- `audit\_events` written on every mutating action with redacted diff

\- `contacts` supports any persona

\- `contact\_interactions` captures the relationship timeline



\## 6.3 Domain 2 — Supplier Inventory (Owned)



\*\*Tables:\*\*



\- `suppliers` — BTO-licensed tourism operators

\- `contracts`, `contract\_periods` — commercial agreements

\- `properties` — hotels, lodges, guesthouses, inns, BnBs, camps

\- `room\_types`, `rate\_plans`, `rate\_plan\_prices`

\- `availability\_calendar`, `allotments`

\- `amenities`, `property\_amenities`

\- `tours`, `tour\_departures`, `tour\_pax\_tiers`, `tour\_itineraries`

\- `tour\_inclusions`, `tour\_exclusions`, `tour\_categories`

\- `media\_assets` — polymorphic media



\*\*Key relationships:\*\*



\- Everything owned belongs to a `supplier` scoped to an `account`

\- `properties.geog` (PostGIS) enables geo search

\- `rate\_plans` + `rate\_plan\_prices` is the hotel inventory model

\- `availability\_calendar` is denormalized for fast lookup

\- `allotments` models contracted inventory blocks

\- `tours` + departures + pax tiers is the tour model



\## 6.4 Domain 3 — Unified Booking



\*\*Tables:\*\*



\- `bookings` — unified header for all verticals

\- `booking\_items` — polymorphic line items (owned/sourced/consolidated)

\- `booking\_guests` — per-item guest details

\- `pricing\_snapshots` — immutable pricing at booking time

\- `booking\_documents` — vouchers, invoices, tickets

\- `workflow\_definitions`, `workflow\_instances`, `workflow\_events`, `workflow\_tasks`

\- `message\_threads`, `messages`, `message\_participants`



\*\*Key relationships:\*\*



\- `bookings.channel` supports b2c, b2b, corporate, admin, whatsapp

\- `booking\_items.item\_supplier\_type` supports owned, sourced, consolidated

\- `pricing\_snapshots` is immutable — never re-priced

\- `workflow\_instances` powers the state machine engine

\- `message\_threads` unifies email, WhatsApp, SMS



\## 6.5 Domain 4 — Pricing \& Tax



\*\*Tables:\*\*



\- `pricing\_rules`, `pricing\_rule\_scopes`, `pricing\_versions`

\- `tax\_rules`, `tax\_filings`

\- `currencies`, `currency\_rates`

\- `fx\_buffer\_overrides`

\- `rounding\_rules`

\- `fee\_rules`

\- `discount\_rules`, `discount\_redemptions`

\- `pricing\_quotes`



\*\*Key relationships:\*\*



\- `pricing\_rules` + scopes is the rule resolution model

\- `pricing\_versions` versions the ruleset; every quote references a version

\- `pricing\_quotes` logs every quote for audit and replay

\- `fx\_buffer\_overrides` allows per-contract buffer overrides



\## 6.6 Domain 5 — Payments \& Finance



\*\*Tables:\*\*



\- `payment\_providers` — PayTabs, Flutterwave, DPO

\- `payment\_intents`, `payments`, `refunds`

\- `ledger\_accounts`, `ledger\_entries`

\- `payout\_runs`, `payout\_run\_items`

\- `reconciliations`

\- `tax\_filings`



\*\*Key relationships:\*\*



\- `payment\_intents` tracks attempts; `payments` tracks captures

\- `refunds` requires approval (two-person rule above threshold)

\- `ledger\_accounts` + `ledger\_entries` is double-entry

\- `payout\_runs` + `payout\_run\_items` is supplier payout batching

\- `reconciliations` compares internal to provider state



\## 6.7 Domain 6 — Integrations



\*\*Tables:\*\*



\- `integration\_providers` — top-level registry

\- `integration\_contracts` — per-API contract (per-API isolation)

\- `integration\_credentials` — encrypted vault with rotation support

\- `integration\_health\_checks` — time series

\- `integration\_webhooks` — webhook health log

\- `integration\_costs` — spend tracking

\- `integration\_payloads` — request/response log (redacted)

\- `integration\_rotation\_requests` — two-person rotation ceremony



\*\*Key relationships:\*\*



\- Every contract has its own credentials, health, failover, commercial terms

\- Credentials are environment-scoped (sandbox vs. production)

\- Payloads logged for debugging, purged after 30 days



\## 6.8 Domain 7 — Geo \& Reference



\*\*Tables:\*\*



\- `countries`, `cities`, `airports`, `airlines`, `locales`, `timezones`



\*\*Key relationships:\*\*



\- `cities.geog` (PostGIS) enables distance queries

\- Airports seed from PHPTravels dump (\~14,000)

\- Airlines seed from PHPTravels dump (\~6,000)

\- Botswana cities seeded manually



\## 6.9 Domain 8 — CMS, Settings \& Support



\*\*Tables:\*\*



\- `cms\_pages`

\- `blog\_posts`, `blog\_categories`, `blog\_translations`

\- `newsletter\_subscribers`

\- `notifications`

\- `email\_log`

\- `platform\_settings`, `branding`, `feature\_flags`

\- `contact\_info`, `social\_links`, `analytics\_settings`



\*\*Key relationships:\*\*



\- Settings split across 6 focused tables (not one singleton)

\- `feature\_flags` is key-value for flexibility



\## 6.10 Cross-Domain Relationships



ACCOUNTS ─────┬─── BOOKINGS (customer, agent, corporate)

├─── SUPPLIERS (supplier realm) ─── PROPERTIES · TOURS · CONTRACTS

│ └─── BOOKING\_ITEMS (owned)

├─── AGENCIES (agent realm)

└─── MESSAGE\_THREADS · CONTACT\_INTERACTIONS



INTEGRATION\_CONTRACTS ─── BOOKING\_ITEMS (sourced)

└─── INTEGRATION\_HEALTH\_CHECKS · INTEGRATION\_PAYLOADS



BOOKINGS ─────┬─── BOOKING\_ITEMS ─── BOOKING\_GUESTS

├─── PRICING\_SNAPSHOTS · PRICING\_QUOTES

├─── WORKFLOW\_INSTANCES ─── WORKFLOW\_EVENTS

├─── PAYMENT\_INTENTS ─── PAYMENTS ─── REFUNDS

├─── LEDGER\_ENTRIES

├─── MESSAGE\_THREADS ─── MESSAGES

└─── BOOKING\_DOCUMENTS



LEDGER\_ACCOUNTS ─── LEDGER\_ENTRIES ─── PAYOUT\_RUNS ─── PAYOUT\_RUN\_ITEMS ─── SUPPLIERS





\## 6.11 Indexes (Critical)



```sql

\-- Identity

CREATE INDEX idx\_accounts\_email ON accounts(email);

CREATE INDEX idx\_accounts\_realm ON accounts(realm);

CREATE INDEX idx\_sessions\_account\_expires ON sessions(account\_id, expires\_at);

CREATE INDEX idx\_audit\_actor\_created ON audit\_events(actor\_id, created\_at DESC);

CREATE INDEX idx\_audit\_entity ON audit\_events(entity\_type, entity\_id);



\-- Owned inventory

CREATE INDEX idx\_properties\_supplier\_status ON properties(supplier\_id, status);

CREATE INDEX idx\_properties\_geog ON properties USING GIST (geog);

CREATE INDEX idx\_rate\_plan\_prices\_date ON rate\_plan\_prices(rate\_plan\_id, date);

CREATE INDEX idx\_availability\_room\_date ON availability\_calendar(room\_type\_id, date);

CREATE INDEX idx\_tours\_supplier\_status ON tours(supplier\_id, status);

CREATE INDEX idx\_tour\_departures\_date ON tour\_departures(tour\_id, departure\_date);



\-- Bookings

CREATE INDEX idx\_bookings\_ref ON bookings(ref);

CREATE INDEX idx\_bookings\_account\_created ON bookings(account\_id, created\_at DESC);

CREATE INDEX idx\_bookings\_status\_created ON bookings(status, created\_at DESC);

CREATE INDEX idx\_bookings\_channel ON bookings(channel);

CREATE INDEX idx\_booking\_items\_booking ON booking\_items(booking\_id);

CREATE INDEX idx\_booking\_items\_supplier\_type ON booking\_items(item\_supplier\_type);

CREATE INDEX idx\_workflow\_instances\_entity ON workflow\_instances(entity\_type, entity\_id);

CREATE INDEX idx\_workflow\_instances\_state ON workflow\_instances(current\_state);



\-- Pricing

CREATE INDEX idx\_pricing\_rules\_version\_active ON pricing\_rules(version\_id, is\_active);

CREATE INDEX idx\_pricing\_quotes\_quote\_ref ON pricing\_quotes(quote\_ref);

CREATE INDEX idx\_pricing\_quotes\_account\_created ON pricing\_quotes(account\_id, created\_at DESC);

CREATE INDEX idx\_pricing\_quotes\_expires ON pricing\_quotes(expires\_at);



\-- Payments

CREATE INDEX idx\_payments\_intent ON payments(intent\_id);

CREATE INDEX idx\_payment\_intents\_booking ON payment\_intents(booking\_id);

CREATE INDEX idx\_ledger\_entries\_transaction ON ledger\_entries(transaction\_id);

CREATE INDEX idx\_ledger\_entries\_reference ON ledger\_entries(reference\_type, reference\_id);



\-- Integrations

CREATE INDEX idx\_integration\_contracts\_ref ON integration\_contracts(contract\_ref);

CREATE INDEX idx\_integration\_contracts\_provider ON integration\_contracts(provider\_id);

CREATE INDEX idx\_integration\_health\_contract\_checked ON integration\_health\_checks(contract\_id, checked\_at DESC);

CREATE INDEX idx\_integration\_payloads\_contract ON integration\_payloads(contract\_id, occurred\_at DESC);



\-- Messaging

CREATE INDEX idx\_message\_threads\_entity ON message\_threads(entity\_type, entity\_id);

CREATE INDEX idx\_message\_threads\_whatsapp ON message\_threads(whatsapp\_thread\_id);

CREATE INDEX idx\_messages\_thread\_created ON messages(thread\_id, created\_at DESC);



```



\## 6.12 Row-Level Security (RLS)



RLS is applied to all realm-scoped tables:



| Realm | Table | Policy |

|---|---|---|

| customer | bookings | Own bookings only |

| customer | booking\_guests | Guests of own bookings |

| customer | message\_threads | Own threads |

| supplier | properties | Own properties |

| supplier | tours | Own tours |

| supplier | booking\_items | Own inventory only |

| supplier | payout\_runs | Own payouts |

| agent | bookings | Agency bookings |

| agent | agency\_users | Own agency users |

| corporate | bookings | Corporate bookings |

| admin | All | Full access per permission |



RLS enforced at the Postgres level, not just application level.



\## 6.13 Migrations Strategy



\- Drizzle Kit generates migrations from schema changes

\- Migrations versioned and reviewable

\- Every migration has a rollback

\- Zero-downtime migrations for additive changes

\- Maintenance window for destructive changes

\- Backups before every production migration



\## 6.14 Data Retention



| Table | Retention | Rationale |

|---|---|---|

| bookings | 7 years | BURS |

| booking\_items | 7 years | BURS |

| payments | 7 years | BURS |

| ledger\_entries | 7 years | BURS |

| audit\_events | 7 years | Compliance |

| pricing\_quotes | 90 days | Debugging |

| integration\_payloads | 30 days | Debugging |

| sessions | 30 days after expiry | Cleanup |

| message\_threads | 7 years | Business record |

| messages | 7 years | Business record |

| email\_log | 1 year | Support |

| notifications | 90 days | Support |



Retention enforced by nightly cleanup job (BullMQ).



\## 6.15 Materialized Views



\*\*MV-1 — `mv\_dashboard\_kpis`\*\* (60s refresh)



today\_gmv\_cents, active\_bookings, commission\_cents, fx\_buffer\_profit\_cents, sla\_breaches\_today, refreshed\_at.



\*\*MV-2 — `mv\_supplier\_health`\*\* (30s refresh)



supplier\_id, supplier\_name, supplier\_type, avg\_latency\_ms, success\_rate\_bps, status, last\_checked\_at, refreshed\_at.



\*\*MV-3 — `mv\_corporate\_credit`\*\* (5 min refresh)



corporate\_id, corporate\_name, credit\_limit\_cents, credit\_used\_cents, overdue\_cents, overdue\_days, refreshed\_at.



\*\*MV-4 — `mv\_owned\_share\_of\_gmv`\*\* (5 min refresh)



week, owned\_gmv\_cents, sourced\_gmv\_cents, consolidated\_gmv\_cents, total\_gmv\_cents, owned\_share\_bps, refreshed\_at.



\*\*MV-5 — `mv\_channel\_performance`\*\* (5 min refresh)



day, channel, booking\_count, gmv\_cents, margin\_cents, margin\_bps, refreshed\_at.



Refresh is `CONCURRENTLY`. If stale, Admin Console shows indicator + triggers background refresh.



\---



\# §12 Integrations \& Adapters



\## 12.1 Adapter Pattern



Every external integration is behind a TypeScript interface. No direct SDK usage in business logic.



```ts

interface FlightProvider {

&#x20; search(params): Promise<FlightOffer\[]>;

&#x20; getOffer(offerId): Promise<FlightOffer>;

&#x20; createOrder(params): Promise<FlightOrder>;

&#x20; cancelOrder(orderId): Promise<void>;

}



interface HotelProvider { /\* search, getOffer, createBooking, cancelBooking \*/ }

interface TourProvider { /\* search, getOffer, createBooking, cancelBooking \*/ }

interface CarProvider { /\* search, getOffer, createBooking, cancelBooking \*/ }

interface PaymentProvider { /\* createIntent, capture, refund, webhookHandler \*/ }

interface WhatsAppProvider { /\* sendMessage, sendInteractive, sendMedia, webhookHandler \*/ }

```



Every integration implements one of these interfaces.



\## 12.2 Integration Categories



| Category | Purpose | Examples |

|---|---|---|

| Sourced inventory | Global inventory for revenue and gap-fill | Duffel, Amadeus, Viator, Rentalcars |

| Owned inventory | Local Botswana suppliers | Extranet (via internal API) |

| Payments | Collect money | PayTabs, Flutterwave, DPO |

| Notifications | Transactional messaging | WhatsApp API, Resend, SMS |

| FX | Currency rate sources | Bank of Botswana, OpenExchangeRates |

| Storage | Object storage | MinIO (dev), Cloudflare R2 (prod) |



\## 12.3 MVP Integrations (Phase 1–2)



| Integration | Category | Phase |

|---|---|---|

| Duffel | Sourced — flights | Phase 1 |

| Amadeus | Sourced — hotels | Phase 1 |

| PayTabs | Payments | Phase 1 |

| WhatsApp Business API | Notifications | Phase 1 |

| Bank of Botswana | FX | Phase 1 |

| Cloudflare R2 | Storage | Phase 1 |



\## 12.4 Phase 2 Integrations



\- Viator or GetYourGuide — Sourced tours (Phase 3)

\- Resend — Email (Phase 3)

\- SMS provider (local BW) — Fallback (Phase 3)



\## 12.5 Phase 3 Integrations



\- Rentalcars or Discover Cars — Sourced cars

\- Flutterwave — Mobile money

\- DPO Pay — Cards in SADC

\- AXA or VisitorsCoverage — Insurance

\- Bank of Botswana (secondary) — FX fallback



\## 12.6 Phase 4 Integrations



\- Hotelbeds — Bedbank fallback

\- Travelport or Sabre — GDS fallback

\- Partner DMC APIs — Consolidated inventory

\- Stripe — International cards

\- Twilio or 360dialog — WhatsApp fallback



\## 12.7 Cross-Cutting Patterns



Every integration implements:



\*\*Idempotency\*\* — every write accepts and honors an idempotency key.



\*\*Webhook signature verification\*\* — every inbound webhook must verify signature before processing.



\*\*Circuit breakers\*\* — every external call wrapped. 5 failures in 60s opens breaker for 30s.



\*\*Retry policies\*\* — per provider: network timeout (exponential, max 3), provider 5xx (exponential, max 5), provider 4xx validation (no retry), provider 4xx auth (no retry), rate limited 429 (respect Retry-After).



\*\*Reconciliation jobs\*\* — every 15 min for inventory and bookings, 5 min for payments, hourly for FX.



\*\*Normalized before persist\*\* — never store raw provider JSON in business tables. Raw stored in `integration\_payloads` for debugging only.



\*\*Payload logging\*\* — every request/response logged with provider, direction, endpoint, payload (redacted), status, duration, trace\_id, idempotency\_key. Retained 30 days.



\## 12.8 Error Taxonomy



| Category | Retryable | User Message | Ops Action |

|---|---|---|---|

| network\_timeout | Yes | "Searching again…" | None unless persistent |

| provider\_5xx | Yes | "Temporarily unavailable" | Alert if >5% |

| provider\_4xx\_validation | No | "Please check your input" | Log |

| provider\_4xx\_auth | No | "We're on it" | Escalate |

| rate\_limited | Yes | "Please wait…" | Monitor tier |

| business\_rule\_violation | No | Specific message | None |

| circuit\_open | — | "Try again in a moment" | Auto-recover |



\## 12.9 Provider Selection Criteria



| Criterion | Weight |

|---|---|

| Coverage | High |

| Reliability | High |

| Pricing | High |

| API quality | Medium |

| Support | Medium |

| Contract terms | Medium |

| Content quality | Medium |



\## 12.10 Phase 1 Launch Sequence



1\. Duffel sandbox

2\. PayTabs sandbox

3\. WhatsApp Business API

4\. Bank of Botswana FX

5\. Cloudflare R2

6\. Duffel production

7\. PayTabs production

8\. Amadeus sandbox

9\. Amadeus production

10\. WhatsApp production



\*\*Rule:\*\* no production launch until sandbox validated with 100+ successful calls and 10+ end-to-end bookings.



\## 12.11 Integration Registry



Every integration registered in `integration\_providers` and `integration\_contracts`:



\- Environment (sandbox, production)

\- Status (active, disabled, retired)

\- Credentials (encrypted, per contract)

\- Health (last check, success rate, latency)

\- Commercial terms (commission, FX buffer, rate limits)

\- Failover target



Admin Console (§5.16) provides the management UI.



\## 12.12 Acceptance Criteria



Phase 1 complete when:



\- \[ ] Duffel adapter implements `FlightProvider` in production

\- \[ ] Amadeus adapter implements `HotelProvider` in production

\- \[ ] PayTabs adapter implements `PaymentProvider` in production

\- \[ ] WhatsApp adapter implements `WhatsAppProvider` in production

\- \[ ] FX adapter fetches Bank of Botswana rates hourly

\- \[ ] R2 adapter stores media and vouchers

\- \[ ] Every integration has idempotency, webhook verification, circuit breaker, retry, reconciliation

\- \[ ] Every integration logs payloads to `integration\_payloads`

\- \[ ] Every integration registered in `integration\_contracts`

\- \[ ] Admin Console manages integrations





