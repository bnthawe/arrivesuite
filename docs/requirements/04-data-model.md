# §6 Data Architecture, §12 Integrations

> ArriveSuite Requirements v3.0. v2.4's §6 listed ~85 tables with ERD intent but no column definitions, and the shipped schema (`packages/db`) diverged from it in five places. §6.17 is the authoritative register of required changes to the shipped schema.

---

# §6.0 Schema Principles & the Migration Register

## 6.0.1 Principles

1. **Hybrid schema.** Domain tables for owned inventory; a canonical booking envelope for the unified layer. No polymorphic JSON columns for business-critical storage — `booking_items.snapshot` is the one sanctioned JSONB, and only because it is an immutable *history* record, never queried for live stock.
2. **Money in minor units.** All amounts are integer cents (`*_cents`). No floats near money.
3. **Every row has `created_at`; most have `updated_at`.** `deleted_at` for soft-delete where history must survive (accounts, properties, suppliers).
4. **`audit_events` is immutable** — no UPDATE, no DELETE, enforced by trigger plus revoked grants.
5. **RLS on every realm-scoped table** (§6.12). Application code never bypasses it.
6. **Migrations are additive where possible**; destructive changes ship in a maintenance window with a backup (§6.13).

## 6.0.2 Hybrid schema, explicitly

Owned inventory lives in typed tables (`properties`, `room_types`, `rate_plans`, `rate_plan_prices`, `availability_calendar`, `tours`, `tour_departures`). Sourced inventory lives behind contracts and is cached thin (`integration_payloads`, Redis) — it is never mirrored into full relational tables. The booking envelope (`bookings`, `booking_items`, `booking_guests`, `pricing_snapshots`) is identical for both classes, joined by `booking_items.item_supplier_type ∈ {owned, sourced, consolidated}`.

---

# §6.1 Overview

The model is organized into 8 domains. v3.0 target: ~45 tables (v2.4's ~85 included tables that were never used — CMS/blog, half of the integration domain, most CRM extras). Every table below is in the MVP DDL.

| Domain | Tables | Purpose |
|---|---|---|
| Identity & CRM | 12 | Accounts, sessions, agencies, RBAC, audit, contacts |
| Supplier inventory (owned) | 17 | Suppliers, properties, rooms, rates, availability, tours |
| Unified booking | 11 | Bookings, items, guests, snapshots, documents |
| Pricing & tax | 12 | Rules, versions, tax, FX, rounding, discounts, quotes |
| Payments & finance | 12 | Intents, payments, refunds, ledger, payouts, reconciliation |
| Integrations | 8 | Providers, contracts, credentials, health, payloads, rotation |
| Geo & reference | 6 | Countries, cities, airports, airlines, locales, timezones |
| Support & settings | 7 | Threads, messages, tickets, notifications, settings, flags |

# §6.2 Domain 1 — Identity & CRM

### `accounts` — every user row

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | `defaultRandom()` |
| email | text | **nullable under v3.0** (partial unique on `WHERE email IS NOT NULL`) — required fix, §6.17 |
| password_hash | text | **nullable under v3.0** — WhatsApp-OTP accounts have no password |
| realm | realm | `admin`, `supplier`, `agent`, `customer` |
| name | varchar(255) | |
| phone | varchar(50) | |
| whatsapp | varchar(50) | legacy display field; principal identity is `phone_e164` |
| phone_e164 | varchar(20) | **new** — canonical number, unique where present |
| auth_method | text | `password`, `whatsapp_otp`, `magic_link`, `sso` |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| deleted_at | timestamptz | soft-delete |

**Realm enum (v3.0):** `admin`, `supplier`, `agent`, `customer`. A `corporate` realm is **deferred**; do not add it until P5 (§5.6.5). When added, it must extend the enum, never fork the accounts table.

### `sessions`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| account_id | uuid FK→accounts | cascade |
| token_hash | text | |
| ip | varchar(45) | |
| user_agent | text | |
| expires_at | timestamptz | |
| created_at | timestamptz | |

### `verification_tokens`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| account_id | uuid FK→accounts | cascade |
| token_hash | text | |
| purpose | token_purpose | `email_verification`, `password_reset`, `mfa`, `whatsapp_otp` |
| expires_at | timestamptz | |
| used_at | timestamptz | |
| created_at | timestamptz | |

**FR note:** WhatsApp OTP tokens must be delivered by the number registered to the account; the code is verified before the principal is trusted (§5.3.3).

### `audit_events` — immutable

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| actor_id | uuid | nullable (system actors) |
| actor_realm | realm | |
| action | varchar(100) | |
| entity_type | varchar(100) | |
| entity_id | varchar(100) | |
| diff | jsonb | redacted |
| ip | varchar(45) | |
| user_agent | text | |
| trace_id | varchar(100) | |
| created_at | timestamptz | partitioned monthly (§15.4) |

No `updated_at`. A database trigger rejects UPDATE/DELETE; the application role holds no UPDATE/DELETE grant.

### RBAC

`roles`, `permissions`, `role_permissions`, `account_roles` — standard join table; seeded with the FR-5.16.14 matrix roles. Admin console actions go through `account_roles` → `roles` → `role_permissions` → `permissions`.

### `agencies`, `agency_users`

| Column | Type |
|---|---|
| id | uuid PK |
| name | varchar(255) |
| credit_limit_cents | integer |
| payment_terms | text |
| status | text (`active`, `suspended`) |
| created_at / updated_at | timestamptz |

`agency_users`: `agency_id`, `account_id`, `role`, `created_at`. Post-MVP enforcement (§5.6).

### CRM

`contacts` (id, account_id, name, email, phone, realm, notes, created_at), `contact_interactions` (id, contact_id, channel, direction, occurred_at, actor_id, outcome), `contact_notes` (id, contact_id, body, author_id, created_at), `crm_tasks` (id, contact_id, owner_id, due_at, status, created_at).

# §6.3 Domain 2 — Supplier Inventory (Owned)

### `suppliers`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| account_id | uuid FK→accounts | the owner principal |
| legal_name | text | |
| trading_name | text | |
| bto_licence_number | varchar(50) | verified manually (§19.2) |
| bto_licence_expiry | date | |
| burs_tin | varchar(50) | |
| bto_grading_certificate_url | text | trust signal (§19.2) |
| status | text | `prospect`, `pending`, `active`, `suspended`, `archived` |
| trust_score | integer | 0–100, recomputed nightly (FR-5.5.45) |
| country_code | char(2) | default `BW` |
| created_at / updated_at | timestamptz | |
| deleted_at | timestamptz | |

### `contracts`, `contract_periods`

`contracts`: id, supplier_id, version, commission_bps, payment_terms, channel_scope (jsonb list), signed_at, status. `contract_periods`: id, contract_id, valid_from, valid_to, gross_cents, commission_cents.

### `properties`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| supplier_id | uuid FK→suppliers | |
| name | text | |
| type | text | `hotel`, `lodge`, `guesthouse`, `inn`, `bnb`, `camp` |
| description | text | |
| geog | geography(Point) | PostGIS, GiST-indexed |
| country_code | char(2) | |
| city_id | uuid FK→cities | |
| check_in_time / check_out_time | time | |
| star_rating | numeric(2,1) | self-declared |
| status | text | `draft`, `pending_review`, `published`, `disabled` |
| trust_score | integer | mirrors supplier where appropriate |
| content_score | integer | 0–100 (FR-5.5.36) |
| created_at / updated_at / deleted_at | timestamptz | |

### `room_types`, `rate_plans`, `rate_plan_prices`, `availability_calendar`

`room_types`: id, property_id, name, max_adults, max_children, bed_config, size_sqm, attributes (jsonb), photos (jsonb).

`rate_plans`: id, room_type_id, name, meal_plan, cancellation_policy, refundable, min_stay, max_stay, inclusions (jsonb).

`rate_plan_prices`: id, rate_plan_id, date, nightly_cents, currency, created_at, updated_at. Unique `(rate_plan_id, date)`.

`availability_calendar`: id, room_type_id, date, available_units, booked_units, blocked_units. Unique `(room_type_id, date)`. **Updated only under row lock (§5.23.4).**

`allotments`: id, rate_plan_id, unit_count, valid_from, valid_to — contracted inventory blocks.

### Amenities, media

`amenities` (id, name), `property_amenities` (property_id, amenity_id). `media_assets` (id, entity_type, entity_id, r2_key, mime, width, height, alt_text, sort_order, created_at).

### Tours

`tours` (id, supplier_id, name, category, duration_minutes, meeting_point, description, status), `tour_departures` (id, tour_id, departure_at, capacity, booked_count, status), `tour_pax_tiers` (id, departure_id, tier, price_cents), `tour_itineraries` (id, tour_id, day_number, title, description), `tour_inclusions` / `tour_exclusions` (id, tour_id, text), `tour_categories` (id, name).

### `external_property_map`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| property_id | uuid FK→properties | owned side |
| source_provider_id | text | `amadeus`, `duffel`, etc. |
| external_hotel_id | text | the sourced-side identifier |
| match_confidence | numeric(3,2) | human-curated, 1.0 for confirmed |
| created_at / updated_at | timestamptz | |

Curated by Content Ops (FR-5.24.1). The merge engine (§4.7) never guesses; it joins on this map.

---

# §6.4 Domain 3 — Unified Booking

### `bookings`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| ref | varchar(16) | `ARS-YYYY-NNNNNN` (15 chars in a 16-wide column), e.g. `ARS-2026-000123`; shipped as char(12), widened via char(16) to varchar(16) — char blank-padding caused a backfill mismatch, so varchar holds the same values unpadded (§6.17) |
| account_id | uuid FK→accounts | the principal (guest or agent or supplier) |
| channel | booking_channel | **new split** — see §6.17: market segment (`b2c`, `b2b`, `corporate`, `admin`) |
| source_interface | text | `web`, `whatsapp`, `api`, `backoffice` — **new** (was folded into the old `channel` enum) |
| status | booking_status | see enum below |
| currency | char(3) | guest-facing currency |
| base_currency | char(3) | always `BWP` |
| fx_rate_bps | integer | snapshot rate |
| subtotal_cents | integer | |
| tax_cents | integer | |
| total_cents | integer | |
| paid_cents | integer | |
| refunded_cents | integer | |
| pricing_snapshot_id | uuid FK→pricing_snapshots | now a real FK |
| idempotency_key | varchar(100) | unique |
| trace_id | varchar(100) | |
| created_at / updated_at | timestamptz | |
| cancelled_at | timestamptz | |

**`booking_status` enum (v3.0):** `pending`, `confirmed`, `on_hold`, `cancelled`, `refunded`, `expired`, `failed`, `no_show`. **Add** `ticketed`, `exchanging`, `fulfilled` when the corresponding verticals ship (§9.2). Do not silently drop existing values — migrations must be additive.

### `booking_items`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| booking_id | uuid FK→bookings | cascade |
| item_type | varchar(50) | `flight`, `hotel`, `tour`, `activity`, `transfer` |
| item_ref | text | external or internal product ref |
| item_supplier_type | varchar(20) | `owned`, `sourced`, `consolidated` |
| supplier_id | uuid | nullable, owned only |
| source_provider_id | text | sourced only |
| snapshot | jsonb | immutable item snapshot (v2.4 pattern retained) |
| start_date / end_date | timestamptz | |
| quantity | integer | |
| adults / children / infants | integer | |
| net_cents / markup_cents / tax_cents / total_cents | integer | |
| status | booking_item_status | `reserved`, `confirmed`, `cancelled`, `refunded`, `expired` |
| confirmation_ref | text | PNR / voucher ref |
| created_at / updated_at | timestamptz | |

### `booking_guests`

`id`, `booking_id` (or `booking_item_id` for per-item guests), `full_name`, `dob`, `passport_number`, `passport_expiry`, `nationality`, `email`, `phone_e164`, `special_requests`, `created_at`. PII column — encrypted at rest is **not** applied to every column, but access is RLS-scoped and exports are redacted (FR-5.16.42).

### `pricing_snapshots`

Immutable. v2.4's columns retained: `id`, `booking_id`, `base_currency`, `display_currency`, `fx_rate_bps`, `line_items` (jsonb), `subtotal_cents`, `tax_cents`, `total_cents`, `pricing_version_id`, `rules_applied` (jsonb), `created_at`. Made FK from `bookings.pricing_snapshot_id`; the reverse pointer (`bookings → snapshot`) is the canonical direction to avoid the v2.4 circular `pricing_snapshots.booking_id` NOT-NULL-without-FK gap.

### `pricing_quotes`

Log of every signed quote (FR-5.15.81): `id`, `quote_ref` unique, `booking_id`, `account_id`, `product_ref`, `contract_id`, `input_params` jsonb, `output_params` jsonb, `rules_applied` jsonb, `pricing_version_id`, `base_cost_cents`, `final_total_cents`, `display_total_cents`, `display_currency`, `signature`, `computed_at`, `expires_at`, `consumed_at`, `created_at`. Retained 90 days (FR-5.15.83).

### `booking_documents`

`id`, `booking_id`, `kind` (`voucher`, `invoice`, `ticket`, `itinerary`, `refund`), `r2_key`, `mime_type`, `created_at`.

### Workflow tables — superseded

`workflow_definitions`, `workflow_instances`, `workflow_events`, `workflow_tasks` are **dropped** in v3.0 (ADR-0020). The explicit state machine in §9.1 replaces them; booking state and events live on `bookings` and `audit_events`.

### Messaging

`message_threads` (`id`, `entity_type`, `entity_id`, `channel`, `account_id`, `supplier_id`, `whatsapp_thread_id`, `created_at`), `messages` (`id`, `thread_id`, `direction`, `body_redacted`, `template_id`, `provider_message_id`, `status`, `created_at`), `message_participants` (`thread_id`, `account_id`, `role`).

# §6.5 Domain 4 — Pricing & Tax

`pricing_rules` (`id`, `version_id`, `type`, `value_json`, `priority`, `is_active`, `created_at`), `pricing_rule_scopes` (`rule_id`, `scope_type`, `scope_value`), `pricing_versions` (`id`, `version_number`, `effective_from`, `effective_to`, `is_active`, `created_at`), `tax_rules` (`id`, `country_code`, `tax_type`, `rate_bps`, `product_types`, `is_inclusive`, `is_active`), `tax_filings` (`id`, `period`, `jurisdiction`, `vat_cents`, `wht_cents`, `submitted_at`), `currency_rates` (`id`, `base_currency`, `quote_currency`, `rate_bps`, `source`, `fetched_at`), `fx_buffer_overrides` (`id`, `contract_id`, `channel`, `market`, `buffer_bps`), `rounding_rules` (`id`, `currency`, `mode`, `step_cents`), `fee_rules` (`id`, `fee_type`, `value_json`, `version_id`), `discount_rules` (`id`, `promo_code`, `type`, `value_json`, `starts_at`, `ends_at`, `active`), `discount_redemptions` (`id`, `discount_rule_id`, `booking_id`, `amount_cents`, `applied_at`).

# §6.6 Domain 5 — Payments & Finance

`payment_providers` (`id`, `name`, `adapter`, `status`), `payment_intents` (`id`, `booking_id`, `amount_cents`, `currency`, `method`, `state`, `provider_ref`, `idempotency_key`, `expires_at`, `created_at`), `payments` (`id`, `intent_id`, `provider_payment_id`, `amount_cents`, `currency`, `status`, `captured_at`, `created_at`), `refunds` (`id`, `payment_id`, `amount_cents`, `reason`, `state`, `approved_by`, `created_at`), `ledger_accounts` (`id`, `name`, `kind`), `ledger_entries` (`id`, `transaction_id`, `account_id`, `direction`, `amount_cents`, `currency`, `reference_type`, `reference_id`, `created_at`), `payout_runs` (`id`, `period_from`, `period_to`, `status`, `approved_by`, `approved_at`, `created_at`), `payout_run_items` (`id`, `run_id`, `supplier_id`, `gross_cents`, `commission_cents`, `net_cents`, `status`), `reconciliations` (`id`, `provider_id`, `period`, `expected_cents`, `actual_cents`, `variance_cents`, `status`, `created_at`).

**Revenue recognition (§6.16 dependency).** Owned-inventory bookings are recognised gross (ArriveSuite is merchant of record, ADR-0017); sourced-inventory commissions are recognised net. The ledger is the single source for both; `ledger_entries` carries a `reference_type='booking'` and the booking's `account_id` scopes RLS.

# §6.7 Domain 6 — Integrations

`integration_providers` (`id`, `name`, `category`, `adapter`, `status`), `integration_contracts` (`id`, `contract_ref` unique, `provider_id`, `vertical`, `region`, `environment`, `status`, `fx_buffer_bps`, `markup_model`, `rate_limit_qps`, `failover_target_id`, `created_at`), `integration_credentials` (`id`, `contract_id`, `environment`, `encrypted_value`, `last_rotated_at`, `expires_at`, `status`), `integration_health_checks` (`id`, `contract_id`, `checked_at`, `status`, `latency_ms`), `integration_webhooks` (`id`, `contract_id`, `event_type`, `received_at`, `signature_ok`, `processed`), `integration_costs` (`id`, `contract_id`, `period`, `transactions`, `spend_cents`, `budget_cents`), `integration_payloads` (`id`, `contract_id`, `direction`, `endpoint`, `payload_redacted`, `status_code`, `duration_ms`, `trace_id`, `idempotency_key`, `occurred_at`), `integration_rotation_requests` (`id`, `contract_id`, `reason`, `requested_by`, `approved_by`, `state`, `created_at`).

# §6.8 Domain 7 — Geo & Reference

`countries`, `cities` (with `geog`), `airports`, `airlines`, `locales`, `timezones`. Seeds: Botswana cities/airports manual; airports/airlines from the PHPTravels dump (~14k/~6k). `country_code` on business rows is the join key — never a schema fork.

# §6.9 Domain 8 — Support & Settings

`tickets` (`id`, `entity_type`, `entity_id`, `status`, `priority`, `assignee_id`, `sla_deadline`, `created_at`), `ticket_events` (`id`, `ticket_id`, `actor_id`, `body`, `created_at`), `notifications` (`id`, `account_id`, `channel`, `template_id`, `status`, `sent_at`), `email_log` (`id`, `to_hash`, `subject`, `status`, `sent_at`), `platform_settings` (`key`, `value`), `branding` (`key`, `value`), `feature_flags` (`key`, `value`, `enabled`).

**CMS/blog (5 tables, 3 blog tables) are cut.** The platform is a marketplace, not a content site. If a marketing blog is ever needed, it is a separate static site, not a database domain.

# §6.10 Cross-Domain Relationships

```
ACCOUNTS ─────┬─── BOOKINGS (customer, agent, supplier)
              ├─── SUPPLIERS ─── PROPERTIES · TOURS · CONTRACTS
              │     └─── BOOKING_ITEMS (owned)
              ├─── AGENCIES ─── AGENCY_USERS
              └─── MESSAGE_THREADS · CONTACT_INTERACTIONS

INTEGRATION_CONTRACTS ─── BOOKING_ITEMS (sourced)
                       └─── INTEGRATION_HEALTH_CHECKS · INTEGRATION_PAYLOADS

BOOKINGS ─────┬─── BOOKING_ITEMS ─── BOOKING_GUESTS
              ├─── PRICING_SNAPSHOTS · PRICING_QUOTES
              ├─── PAYMENT_INTENTS ─── PAYMENTS ─── REFUNDS
              ├─── LEDGER_ENTRIES
              ├─── MESSAGE_THREADS ─── MESSAGES
              └─── BOOKING_DOCUMENTS

LEDGER_ACCOUNTS ─── LEDGER_ENTRIES ─── PAYOUT_RUNS ─── SUPPLIERS
```

# §6.11 Indexes (Critical)

```sql
-- Identity
CREATE INDEX idx_accounts_realm ON accounts(realm);
CREATE INDEX idx_sessions_account_expires ON sessions(account_id, expires_at);
CREATE INDEX idx_audit_actor_created ON audit_events(actor_id, created_at DESC);
CREATE INDEX idx_audit_entity ON audit_events(entity_type, entity_id);

-- Owned inventory
CREATE INDEX idx_properties_supplier_status ON properties(supplier_id, status);
CREATE INDEX idx_properties_geog ON properties USING GIST (geog);
CREATE INDEX idx_rate_plan_prices_date ON rate_plan_prices(rate_plan_id, date);
CREATE INDEX idx_availability_room_date ON availability_calendar(room_type_id, date);
CREATE INDEX idx_tours_supplier_status ON tours(supplier_id, status);
CREATE INDEX idx_tour_departures_date ON tour_departures(tour_id, departure_at);

-- Bookings
CREATE INDEX idx_bookings_ref ON bookings(ref);
CREATE INDEX idx_bookings_account_created ON bookings(account_id, created_at DESC);
CREATE INDEX idx_bookings_status_created ON bookings(status, created_at DESC);
CREATE INDEX idx_bookings_channel ON bookings(channel);
CREATE INDEX idx_booking_items_booking ON booking_items(booking_id);
CREATE INDEX idx_booking_items_supplier_type ON booking_items(item_supplier_type);

-- Pricing
CREATE INDEX idx_pricing_rules_version_active ON pricing_rules(version_id, is_active);
CREATE INDEX idx_pricing_quotes_quote_ref ON pricing_quotes(quote_ref);
CREATE INDEX idx_pricing_quotes_account_created ON pricing_quotes(account_id, created_at DESC);
CREATE INDEX idx_pricing_quotes_expires ON pricing_quotes(expires_at);

-- Payments
CREATE INDEX idx_payments_intent ON payments(intent_id);
CREATE INDEX idx_payment_intents_booking ON payment_intents(booking_id);
CREATE INDEX idx_ledger_entries_transaction ON ledger_entries(transaction_id);
CREATE INDEX idx_ledger_entries_reference ON ledger_entries(reference_type, reference_id);

-- Integrations
CREATE INDEX idx_integration_contracts_ref ON integration_contracts(contract_ref);
CREATE INDEX idx_integration_contracts_provider ON integration_contracts(provider_id);
CREATE INDEX idx_integration_health_contract_checked ON integration_health_checks(contract_id, checked_at DESC);
CREATE INDEX idx_integration_payloads_contract ON integration_payloads(contract_id, occurred_at DESC);

-- Messaging
CREATE INDEX idx_message_threads_entity ON message_threads(entity_type, entity_id);
CREATE INDEX idx_message_threads_whatsapp ON message_threads(whatsapp_thread_id);
CREATE INDEX idx_messages_thread_created ON messages(thread_id, created_at DESC);
```

# §6.12 Row-Level Security

| Realm | Table | Policy |
|---|---|---|
| customer | bookings | Own bookings only |
| customer | booking_guests | Guests of own bookings |
| customer | message_threads | Own threads |
| supplier | properties | Own properties |
| supplier | tours | Own tours |
| supplier | booking_items | Own inventory only |
| supplier | payout_runs | Own payouts |
| agent | bookings | Agency bookings |
| agent | agency_users | Own agency users |
| admin | All | Full access per permission matrix (§5.16.14) |

**v3.0 correction.** The `corporate` row is removed until P5. Guest RLS keys off `bookings.account_id = current_setting('app.account_id')`; the WhatsApp guest principal (§5.3.2) means no anonymous-access policy is ever needed or granted.

# §6.13 Migrations Strategy

- Drizzle Kit generates migrations from schema changes; every migration is reviewed and has a rollback.
- Zero-downtime for additive changes; destructive changes in a maintenance window with a backup (§6.17 item M5).
- The stray root-level `drizzle/` directory containing only an empty `_journal.json` is deleted; the canonical journal is `packages/db/drizzle/meta/_journal.json`.

# §6.14 Data Retention

| Table | Retention | Rationale |
|---|---|---|
| bookings, booking_items, payments, ledger_entries, message tables | 7 years | BURS / business record |
| audit_events | 7 years | Compliance |
| pricing_quotes | 90 days | Debugging |
| integration_payloads | 30 days | Debugging |
| sessions | 30 days after expiry | Cleanup |
| email_log | 1 year | Support |
| notifications | 90 days | Support |

Enforced by a nightly BullMQ job (worker host, ADR-0016).

# §6.15 Materialized Views

- **MV-1 `mv_dashboard_kpis`** (60s refresh): today's GMV, active bookings, commission, FX buffer profit, SLA breaches.
- **MV-2 `mv_supplier_health`** (60s refresh): per supplier success rate, latency, status.
- **MV-3 `mv_owned_share_of_gmv`** (5 min refresh): weekly owned vs sourced GMV and owned share — the strategic metric, always visible.

Refresh is `CONCURRENTLY`. If stale, the Admin Console shows an indicator and triggers a background refresh.

# §6.16 Revenue Recognition & GMV Reporting

> **New in v3.0.**

| Class | What ArriveSuite reports | Where it lands |
|---|---|---|
| Owned | Gross GMV, and commission earned as margin | `ledger_entries`, booking `account_id` = supplier's agent account |
| Sourced flights/hotels | Commission only (net revenue) | Separate ledger account; GMV disclosed as pass-through |
| FX buffer | Separate P&L line, not supplier payout offset | `mv_dashboard_kpis` |

Owned share of GMV is the single strategic metric (§1.8). It must be computable from the ledger without any spreadsheet.

# §6.17 Schema Migration Register — Required Changes to the Shipped Schema

The shipped `packages/db` schema (drizzle 0000_medical_cable.sql) conflicts with v2.4/v3.0 in five places. Each must be resolved before the corresponding v3.0 FRs are buildable.

| # | Shipped state | v3.0 target | Consequence if ignored |
|---|---|---|---|
| M1 | `accounts.email` is `NOT NULL UNIQUE` | Nullable with partial unique index `WHERE email IS NOT NULL` | WhatsApp-first guests cannot be represented at all |
| M2 | `accounts.password_hash` is `NOT NULL` | Nullable | WhatsApp-OTP accounts cannot exist |
| M3 | `bookings.ref` is `char(12)` | 16-wide column to hold `ARS-YYYY-NNNNNN` (FR-15.35); implemented as `varchar(16)` — `char(16)` blank-padding caused a backfill bug, same values unpadded | Booking references must be truncated or the format abandoned |
| M4 | `bookings.channel` enum = web \| whatsapp \| api \| backoffice | Split into `channel` (market segment) and `source_interface` (web \| whatsapp \| api \| backoffice) | Market-segment analytics are impossible; FR-15.59 currency segmentation and §6.6 revenue recognition break |
| M5 | `pricing_snapshots.line_items` jsonb + `bookings.pricing_snapshot_id` without FK | `bookings.pricing_snapshot_id` becomes a real FK; `pricing_snapshots` loses its circular pointer to bookings | Pricing snapshots cannot be reconciled to bookings; auditability of quote→booking fails |

Additional required changes (lower severity): add unique index on `accounts.phone_e164`; add `booking_status` values `ticketed`, `exchanging`, `fulfilled`, `no_show`; replace `channelEnum` with the pair above; add `agent` principal fields for P4; delete the empty root-level `drizzle/` directory.

---

# §6.18 Supplier Extranet Data Deltas (§5.25)

Tables required beyond §6.3, in build order: `venues` (`id`, `supplier_id`, `name`, `standalone` flag, `created_at`), `venue_spaces` (`id`, `venue_id`, `name`, capacities jsonb `{theatre, boardroom, banquet}`, half/full-day rates, catering/AV add-ons jsonb), `venue_holds` (`id`, `space_id`, `held_by`, `expires_at`, `state`), `rfqs` + `rfq_quotes` (corporate three-quote inbox with deadlines), `availability_holds` (TTL holds with `tstzrange`, exclusion constraint per unit), `manual_reservations` (tender enum: `cash`, `eft`, `paystack_link`), `supplier_documents` (media references for licences/contracts), `terms_acceptances` (versioned T&C acceptance), `places` (`id`, `supplier_id`, name, geog, description, media, linked tour ids), `activities` (`id`, `supplier_id`, name, duration, meeting point, group limits, guide/equipment needs, pricing tiers), `activity_instances` (`id`, `activity_id`, starts_at, capacity, booked_count, cut_off_at, status). No visa tables exist anywhere in scope.

---

# §12 Integrations & Adapters

## 12.1 Adapter Pattern

Every external integration sits behind a TypeScript interface. No direct SDK usage in business logic.

```ts
interface FlightProvider {
  search(params): Promise<FlightOffer[]>;
  getOffer(offerId): Promise<FlightOffer>;
  createOrder(params): Promise<FlightOrder>;
  cancelOrder(orderId): Promise<void>;
}
interface HotelProvider { /* search, getOffer, createBooking, cancelBooking */ }
interface TourProvider { /* search, getOffer, createBooking, cancelBooking */ }
interface CarProvider { /* search, getOffer, createBooking, cancelBooking */ }
interface PaymentProvider { /* createIntent, capture, refund, webhookHandler */ }
interface WhatsAppProvider { /* sendMessage, sendInteractive, sendMedia, webhookHandler */ }
```

## 12.2 Integration Categories

| Category | Purpose | Examples |
|---|---|---|
| Sourced inventory | Global inventory for revenue and gap-fill | Duffel, Amadeus |
| Owned inventory | Local Botswana suppliers | Extranet (internal API) |
| Payments | Collect money | PayTabs |
| Notifications | Transactional messaging | WhatsApp Cloud API, Resend, SMS (Phase 3) |
| FX | Currency rates | Bank of Botswana, OpenExchangeRates |
| Storage | Object storage | Cloudflare R2 |

## 12.3 MVP Integrations (Phase 1–2)

Duffel (flights, Phase 1); Amadeus (hotels, Phase 1 — **coverage gated, §19.1**); PayTabs (payments, Phase 1); WhatsApp Cloud API direct (Phase 1, ADR-0019); Bank of Botswana (FX, Phase 1); Cloudflare R2 (Phase 1).

## 12.4 Phase 3 Integrations

Resend (email); local BW SMS provider; mobile money via PayTabs if confirmed; Orange Money / MyZaka (gated).

## 12.5 Phase 4+ Integrations

Viator/GetYourGuide tours (post-MVP, §19.1); Rentalcars (post-MVP); Flutterwave (mobile money fallback); DPO Pay; AXA/VisitorsCoverage insurance; Hotelbeds/Travelport/Sabre (second providers — one of the two-sourced-provider commitments is now Phase 4+, §17.3); OTA contracts.

## 12.6 Decommissioned From v2.4

- **Viator Phase 3** — moved to Phase 4+ (post-MVP).
- **"Twilio or 360dialog — WhatsApp fallback (Phase 4)"** — removed; BSP evaluation is at Phase 3 review (ADR-0018/0019), not a scheduled integration.
- **Stripe** — removed from the launch path; PayTabs remains the single card provider until a Phase 4+ SADC evaluation.

## 12.7 Cross-Cutting Patterns

Every integration implements: **idempotency** on every write; **webhook signature verification** before processing; **circuit breakers** (5 failures in 60s → open for 30s); **retry policy** per provider (network timeout exponential max 3; 5xx max 5; 4xx validation never; 429 respect Retry-After); **reconciliation** jobs (15 min inventory, 5 min payments, hourly FX); **normalise before persist** — raw provider JSON goes only to `integration_payloads`, redacted, 30-day retention; **payload logging** with provider, direction, endpoint, status, duration, trace_id, idempotency_key.

## 12.8 Error Taxonomy

| Category | Retryable | User message | Ops action |
|---|---|---|---|
| network_timeout | Yes | "Searching again…" | None unless persistent |
| provider_5xx | Yes | "Temporarily unavailable" | Alert if >5% |
| provider_4xx_validation | No | "Please check your input" | Log |
| provider_4xx_auth | No | "We're on it" | Escalate |
| rate_limited | Yes | "Please wait…" | Monitor tier |
| business_rule_violation | No | Specific message | None |
| circuit_open | — | "Try again in a moment" | Auto-recover |

## 12.9 Provider Selection Criteria

Coverage (high), reliability (high), pricing (high), API quality (medium), support (medium), contract terms (medium), content quality (medium).

## 12.10 Launch Sequence

1. Duffel sandbox → 2. PayTabs sandbox → 3. WhatsApp test numbers → 4. Bank of Botswana FX → 5. R2 → 6. Duffel production → 7. PayTabs production → 8. Amadeus sandbox (**gate: coverage validation, §19.1**) → 9. Amadeus production → 10. WhatsApp production.

**Rule:** no production launch until the sandbox has validated 100+ successful calls and 10+ end-to-end bookings — **except** Amadeus, which also requires the §19.1 coverage validation against Maun and Kasane.

## 12.11 Integration Registry

Every integration is registered in `integration_providers` + `integration_contracts`: environment, status, credentials (encrypted, per contract), health, commercial terms, failover target. The Admin Console (§5.16) is the management UI.

## 12.12 Acceptance Criteria

Phase 1 complete when: Duffel, Amadeus, PayTabs, WhatsApp, FX, and R2 all implement their adapter interfaces in production; every integration has idempotency, webhook verification, circuit breaker, retry, reconciliation; payloads logged; registered in the contract registry; Admin Console manages them.
