# §5 Functional Requirements, §9 Booking Lifecycle

> ArriveSuite Requirements v3.0. FR numbering is a pure prefix alignment of v2.4 — no FR was deleted, renumbered internally, or split. Where v2.4 specified a requirement that v3.0 withdraws, the FR is retained and marked **WITHDRAWN** with the reason. Where v3.0 adds a requirement, it is marked **new**.

**Audience:** engineering, product, design. **Status:** authoritative. v2.4 functional content for §5.5 is carried in full; §5.13–§5.16 are carried with the v3.0 corrections noted inline.

---

# §5.5 Supplier Extranet

> Source: v2.4 `04a-supplier-extranet.md`, carried with corrections where noted. FR numbers unchanged.

## 5.5.1 Purpose

The Supplier Extranet is a **light property management system (PMS)** for Botswana tourism operators. It is the primary way suppliers interact with ArriveSuite, and it is designed mobile-first and WhatsApp-first.

**Design principles:**

1. **WhatsApp-first.** Every core supplier action is available over WhatsApp (§5.4).
2. **Zero-training friendly.** A lodge owner with no software experience should be able to use it within 10 minutes.
3. **Mobile-primary.** Works on a phone first, then a tablet, then a desktop.
4. **Offline-tolerant.** Critical actions queue locally and sync when online.
5. **BWP-native.** No FX exposure for the supplier.
6. **Content-producing.** The extranet is where first-party content is created.
7. **Free at the base tier.** No supplier should be blocked by cost.

## 5.5.2 Onboarding Journey

The supplier onboarding funnel has 6 stages:

**Stage 1 — Discovery.** Supplier learns about ArriveSuite via field operations, BTO partnership, industry referrals, or word of mouth. First contact is via WhatsApp.

**Stage 2 — Interest.** ArriveSuite sends a WhatsApp introduction with a 60-second explainer. A web landing page introduces the platform. A field agent schedules a call or visit.

**Stage 3 — Application.** Via WhatsApp flow, web form, or field agent on-site. Required: legal name, trading name, BTO licence number and expiry, tax ID (BURS), contact details, property type and location, room/tour count, bank details (encrypted).

**Stage 4 — Verification.** BTO licence verified **manually** (§19.2 — there is no BTO API); tax ID verified via BURS where possible; bank details verified (small test transfer, Phase 2); documents reviewed by Supplier Ops; approval communicated via WhatsApp.

**Stage 5 — Contracting.** Digital contract sent via WhatsApp, e-signed, countersigned, stored in R2, audit trail written.

**Stage 6 — Activation.** Account created, property/tours set up, photos and descriptions uploaded, rates and availability entered, test booking, listing published, welcome message via WhatsApp, first channel sync live.

**Target:** 5 business days from application to first booking. Year-1 capacity for this funnel is 100 active suppliers, not 300 (§19.4).

## 5.5.3 Authentication & Identity

**FR-5.5.1 — Login methods.** Phone number + WhatsApp OTP (primary); email + password (fallback); magic link via WhatsApp (convenience). No supplier is forced to remember a password.

**FR-5.5.2 — Session.** 8-hour sessions, refresh on activity, 2FA via WhatsApp on new devices, logged to `audit_events`.

**FR-5.5.3 — Multi-user support.** Owner (full access), Manager (booking + availability + rates), Staff (booking view). Each user tied to a WhatsApp number. Housekeeping status commands are post-MVP (§2.5.3).

**FR-5.5.4 — Delegation.** Users can be scoped to specific properties or functions.

## 5.5.4 Property Management

**FR-5.5.5 — Property CRUD.** Name, type (hotel | lodge | guesthouse | inn | motel | bnb | camp | villa | self-catering), description, location (address, coordinates), contact details, check-in/out times, policies, star rating (self-declared).

**FR-5.5.6 — Media management.** Photos uploaded via WhatsApp, web, or field agent; auto-resized and EXIF-stripped; virus-scanned; cover image required for publishing; ≥5 photos recommended; alt text auto-generated (LLM) and editable.

**FR-5.5.7 — Amenities.** ArriveSuite taxonomy; supplier selects; custom amenities moderated.

**FR-5.5.8 — Publishing workflow.** Required fields → submit for review → Content Ops review (Phase 2, auto-approved once trust is established) → publish.

## 5.5.5 Room Types & Rate Plans

**FR-5.5.9 — Room types.** Name, capacity, bed configuration, size, attributes, photos.

**FR-5.5.10 — Rate plans.** Name, meal plan, cancellation policy, min/max stay, refundable, inclusions.

**FR-5.5.11 — Rate setting.** Bulk edit, calendar, WhatsApp ("Xigera Water Suite 12,500 for 20-25 June"), CSV import.

**FR-5.5.12 — Seasonal rates.** Low (default), High, Peak. Per season or per date.

**FR-5.5.13 — Extra beds.** Extra adult, extra child (age band), free for infants.

**FR-5.5.14 — Rate inheritance.** Rate plans inherit from room type defaults, override per date.

## 5.5.6 Availability Management

**FR-5.5.15 — Availability model.** Per room type per date: `available_units`, `booked_units`, `blocked_units`.

**FR-5.5.16 — Booking flow interaction.** On confirm: `booked_units` +1, `available_units` −1. Sell-out at 0.

**FR-5.5.17 — Stop-sell.** Suppliers can block specific dates.

**FR-5.5.18 — Minimum stay.** Rate plans enforce min stay; shorter bookings rejected.

**FR-5.5.19 — Bulk availability update.** Set range to N rooms, block range, adjust capacity.

**FR-5.5.20 — WhatsApp availability.** Availability updates via WhatsApp are confirmation-gated with an impact statement (§5.4.4, FR-5.4.9).

**FR-5.5.21 — Offline queue.** Actions queue locally; sync on reconnect; **conflict resolution is server-mediated — latest confirmed write wins, never silently** (supersedes v2.4's "last-write-wins"; see §5.23.2).

## 5.5.7 Tour & Activity Management

**FR-5.5.22 — Tour CRUD.** Name, type (private | join-in | self-guided | group), category, duration, meeting point, highlights, photos.

**FR-5.5.23 — Departures.** Date, time, capacity, booked count, status (scheduled | sold out | cancelled).

**FR-5.5.24 — Pax tiers.** Adult, child, infant, senior, student — each with its own price.

**FR-5.5.25 — Itineraries.** Day number, title, description, activities.

**FR-5.5.26 — Inclusions & exclusions.**

**FR-5.5.27 — Departure availability.** Published | held | cancelled (cancelled notifies booked guests).

**FR-5.5.28 — WhatsApp tour updates.** Add, cancel and capacity-update departures via WhatsApp (§5.4).

## 5.5.8 Booking Management

**FR-5.5.29 — Incoming bookings.** Real-time WhatsApp + web; reference, guest details, dates, total, payment status.

**FR-5.5.30 — Confirmation actions.** Instant-book: auto-confirm. On-request: confirm or decline within SLA (default 24h) via `CONFIRM` / `DECLINE <reason>`.

**FR-5.5.31 — No-show handling.** Supplier marks no-show within 24h of arrival; booking → `no_show`; guest notified; charge per policy.

**FR-5.5.32 — Modification requests.** Supplier approves/declines; approved changes adjust price and notify guest.

**FR-5.5.33 — Cancellations.** Guest-initiated follow rate plan policy; supplier-initiated require reason, escalate to ops, rebooking attempt first, refund if rebooking fails.

**FR-5.5.34 — WhatsApp booking confirmation flow.** See §2.5.7 Scenario 1.

## 5.5.9 Media & Content

**FR-5.5.35 — Content production tools.** Photo upload (web + WhatsApp), auto-resize, EXIF strip, virus scan, LLM alt text, rich-text description editor, itinerary builder, translation (EN → Setswana).

**FR-5.5.36 — Content quality score.** 0–100 across photos/description/amenities/policies/rates/availability. Below 60 flagged for Content Ops.

**FR-5.5.37 — Assisted content production.** ArriveSuite Content Ops visits, photographs, writes, publishes. Supplier retains ownership; ArriveSuite holds a distribution licence.

**FR-5.5.38 — Content updates.** Audit-logged; re-reviewed if significant; published immediately for minor changes.

## 5.5.9A Pay-at-Property Settlement (NEW in v2.7)

> **v2.7 addition.** Walk-in and cash bookings introduce a second payment flow separate from online card payments.

**FR-5.5.9A.1 — Pay-at-property model.** Walk-in/cash bookings are recorded in the same booking envelope as online bookings but with `payment_method = 'cash'` or `'eft'`. No charge is captured at booking time.

**FR-5.5.9A.2 — Auto-completion on checkout.** 24 hours after checkout (`check_out_date + 1 day`), the booking auto-completes to `fulfilled` and commission is recorded as earned. The supplier can dispute or report no-show within 48 hours post-check-in; if so, commission posting pauses pending review.

**FR-5.5.9A.3 — Commission debt tracking.** A monthly `commission_debt` table tracks per supplier: `period_month`, `online_collected_cents`, `walk_in_commission_debt_cents`, `balance_cents` (online collected − walk-in debt). A persistent negative balance is manually escalated, not auto-enforced. Finance Ops receives an alert when balance falls below −BWP 10,000 (a hard cap).

**FR-5.5.9A.4 — Monthly settlement anchor.** At month-end, the platform offsets online collections against walk-in debt: if the supplier collected BWP 50,000 online and owes BWP 15,000 in walk-in commission, the net payout is BWP 35,000. Both sides are audit-logged.

**FR-5.5.9A.5 — No-show and dispute handling.** Suppliers report no-show or guest dispute within 48h post-check-in; a ticket is created; Finance Ops decides whether to waive commission. The decision is recorded on the `commission_debt` row with the timestamp and actor.

**FR-5.5.9A.6 — Debt cap.** A supplier's negative balance cannot exceed −BWP 10,000. Once the cap is breached, Finance Ops is manually notified (P2 alert); no further walk-in bookings are accepted until the balance is brought above the cap by online collections or manual adjustment.

**FR-5.5.9A.7 — MoR stays ArriveSuite.** Walk-in bookings are still considered owned inventory under ArriveSuite's merchant-of-record model. Guests see the booking in their confirmation and WhatsApp thread. No supplier-branded receipt is issued (only the booking reference).

## 5.5.10 Payouts & Finance

**FR-5.5.39 — Payout schedule.** Default weekly, Monday for the prior week's completed bookings. Options: weekly, bi-weekly, monthly, on-demand (fee applies).

**FR-5.5.40 — Payout calculation.** Payout = Σ(booking total) − Σ(commission) + Σ(adjustments). **v3.0 correction:** v2.4 deducted Σ(FX buffer) from supplier payouts. Suppliers transact in BWP; the FX buffer is a platform P&L line, not a deduction (§19.5).

**FR-5.5.41 — Payout methods.** Bank transfer (BWP, default); mobile money (Phase 2); cash on collection for remote suppliers (Phase 3).

**FR-5.5.42 — Payout notifications.** WhatsApp message with amount, period, reference, destination hint; reply `RECEIVED`.

**FR-5.5.43 — Statements.** Monthly: bookings received, gross revenue, commission, net payout, adjustments. Web + WhatsApp PDF.

**FR-5.5.44 — Disputes.** Supplier can dispute a payout within 7 days; reason mandatory; escalated to Finance Ops.

## 5.5.11 Trust Score & Reputation

**FR-5.5.45 — Trust score composition.** Responsiveness 25%; cancellation rate 20%; guest rating 20%; inventory freshness 20%; compliance 15%. **v3.0 correction:** while guest reviews are unavailable (post-MVP dependency — Phase 8), guest rating's 20% is re-normalised pro-rata across the other four components. New weights: responsiveness 31%, cancellation 25%, inventory freshness 25%, compliance 19%. The score must not quietly max out at 80.

**FR-5.5.46 — Trust score impact.** Search ranking; featured placement eligibility; priority in failover chains. **v3.0 correction:** a score below 80 triggers a review by Supplier Ops, it never auto-disables a supplier. Auto-disable thresholds are §5.5.11's stale-inventory rule (FR-5.5.49) and FR-5.13.24's conditions.

**FR-5.5.47 — Trust score transparency.** Suppliers see score and components in the extranet.

**FR-5.5.48 — Review management.** Guests leave reviews after checkout; suppliers see, respond publicly, flag inappropriate (escalated).

**FR-5.5.49 — Stale inventory auto-disable.** No update for 30 days → auto-disable; notifications at 25 and 29 days; reactivation automatic on update.

## 5.5.12 Analytics & Reporting

**FR-5.5.50 — Supplier dashboard.** Bookings this month, occupancy, ADR, top channels, guest origin, trust score, recent reviews, upcoming check-ins.

**FR-5.5.51 — Booking history.** Searchable, filterable by date range, status, guest name, channel.

**FR-5.5.52 — Revenue reports.** Daily/weekly/monthly; by room type, channel, market; CSV export.

**FR-5.5.53 — Forecasting.** Simple occupancy forecast from bookings, history, seasonality.

## 5.5.13 Support & Communication

**FR-5.5.54 — WhatsApp support.** Dedicated supplier number; human response within 2 hours in business hours; Botswana-based; Setswana and English.

**FR-5.5.55 — Support categories.** Technical, financial, booking, content, onboarding.

**FR-5.5.56 — Knowledge base.** English and Setswana.

**FR-5.5.57 — Training.** Video tutorials, monthly live sessions in Gaborone/Maun/Kasane, field support.

## 5.5.14 Security

**FR-5.5.58 — Account security.** Phone OTP (primary), 2FA on new devices, session IP logging, suspicious-activity alerts.

**FR-5.5.59 — Data protection.** Bank details encrypted at rest (AES-256-GCM); guest PII protected under the Botswana Data Protection Act; full audit trail; data export/deletion on request.

**FR-5.5.60 — Compliance.** Annual BTO licence verification, tax ID verification, bank verification, annual KYC refresh.

## 5.5.15 Mobile Experience

**FR-5.5.61 — Mobile-first design.** Android (primary), iOS, feature phones via WhatsApp flows.

**FR-5.5.62 — Progressive web app.** Installable, offline (queued actions), push notifications (Phase 2).

**FR-5.5.63 — Offline tolerance.** Confirm booking, update availability, update rates, housekeeping status (post-MVP command) queue locally and sync on reconnect.

**FR-5.5.64 — Low data mode.** Optimised for 3G, lazy loading, compressed images, <100KB initial payload.

## 5.5.16 Rate Plans & Seasonality (Advanced)

**FR-5.5.65 — Rate plan types.** Standard, seasonal, dynamic (Phase 3), package (Phase 2).

**FR-5.5.66 — Length-of-stay discounts.** 7+/14+/30+ night tiers.

**FR-5.5.67 — Advance purchase discounts.** 30+/60+ days.

**FR-5.5.68 — Last-minute pricing.** Within 7 days, configurable.

## 5.5.17 Distribution Control

**FR-5.5.69 — Channel selection.** Suppliers choose channels: B2C direct, B2B agents, corporate (post-MVP), WhatsApp, OTA partners (Phase 4), Exchange API (Phase 5+). Default: all.

**FR-5.5.70 — Rate parity.** **WITHDRAWN in v3.0.** Replaced by commercial-terms disclosure and preferred-supplier rates (§2.6.4, FR-5.5.72).

**FR-5.5.71 — Exclusive inventory.** Exclusive-to-ArriveSuite inventory earns higher commission, higher search ranking, featured placement.

**FR-5.5.72 — Commercial terms disclosure (new).** Owned inventory may be distributed on any channel the supplier selects. ArriveSuite publishes its commission rate in the contract and extranet. No hidden fees; the FX buffer is never deducted from supplier payouts (FR-5.5.40). Preferred-supplier rate — a lower net rate in exchange for higher commission, priority placement, featured status — is the only exclusivity mechanism. ArriveSuite does not monitor rates the supplier sells elsewhere.

## 5.5.18 Acceptance Criteria

Phase 2 (Extranet MVP) is complete when:

- [ ] Supplier can apply via web or WhatsApp
- [ ] BTO licence verified manually against the registry given to ArriveSuite, grading certificate held (§19.2)
- [ ] Contract e-signing works
- [ ] Login via WhatsApp OTP works
- [ ] Property with rooms, rates, availability creatable
- [ ] Media upload works
- [ ] Bookings confirmable and declinable via WhatsApp
- [ ] Availability updatable via WhatsApp with confirmation gate (§5.4.4)
- [ ] Payouts receivable and confirmable via WhatsApp
- [ ] Bookings, revenue, trust score visible
- [ ] Trust score computed nightly
- [ ] Stale inventory auto-disabled after 30 days
- [ ] Offline queue works
- [ ] PWA installable
- [ ] Knowledge base in English + Setswana
- [ ] Field onboarding playbook documented
- [ ] First 20 suppliers onboarded end-to-end

---

# §5.6 B2B Agent Portal

> **New in v3.0, post-MVP.** v2.4 tagged §5.6 "pending". The persona (P4, §3.6) and roadmap promise (Phase 5, §17.7) are retained for the post-MVP wave. This section defines intent only; nothing here is in the 10-week MVP budget.

**FR-5.6.1 — Agency model.** An agency is an `accounts` row with `realm = 'agent'`, one or more `agency_users`, and credit terms (net-15/net-30). Sub-users are attributable to every booking they make.

**FR-5.6.2 — Net rates.** Agents see net purchase prices; ArriveSuite markup is hidden from them the way guest retail hides cost (FR-5.14.57). Markup configuration is per agency and per channel.

**FR-5.6.3 — Booking on behalf.** Agents book for a named client; the client is recorded on `booking_guests`, the agency on the booking, and commission is tracked against the agency.

**FR-5.6.4 — WhatsApp status.** Agents receive booking status over WhatsApp using the same template register (§2.8.4) as guests, scoped to their own bookings.

**FR-5.6.5 — Credit engine.** Agent credit limits and terms are enforced at quote-commit time. A suspended agency cannot confirm bookings. Corporate credit (P5) is a separate post-MVP workstream and is not modelled with the agent credit engine.

**FR-5.6.6 — Reporting.** Commission and volume reports per period, exportable.

---

# §5.7 Communications & Notifications

> **New in v3.0.** v2.4 had the tables (`message_threads`, `messages`, `message_participants`, `notifications`, `email_log`) and WhatsApp strategy, but no functional requirements joining them to booking events.

**FR-5.7.1 — Unified thread model.** All guest, supplier and agent messaging lives in `message_threads` / `messages` / `message_participants`. A thread is anchored to exactly one entity (booking, supplier, agency, or a bare conversation), so a guest's history survives a new booking against the same principal.

**FR-5.7.2 — Channel fan-out.** A single outbound event (booking confirmed) is rendered through every configured channel for that principal: WhatsApp primary, email, and web notification. Each send is logged with provider status.

**FR-5.7.3 — Notification categories.** Transactional (booking, payment, payout), operational (supplier action required, action required from guest), marketing (opt-in only). Marketing never fires when a transactional event is in flight for the same principal.

**FR-5.7.4 — Delivery tracking.** Per-message status from the provider (queued, sent, delivered, read, failed) is stored and surfaced in the Admin Console. Failed transactional sends page ops if they fail twice.

**FR-5.7.5 — Notification preferences.** A principal can opt out of marketing and of non-essential channels while keeping transactional delivery. WhatsApp `STOP` is honoured immediately (FR-5.3.3).

---

# §5.8 CRM & Contacts

> **New in v3.0.** v2.4 modelled the tables but never specified why they existed.

**FR-5.8.1 — Contact record.** A `contacts` row anchors one relationship: a guest's forwarding email, a supplier's owner, or an agency's principal. Contacts are linked to an `account` and optionally to a booking or contract.

**FR-5.8.2 — Interaction timeline.** Every call, email, WhatsApp thread, and meeting is a `contact_interactions` row with direction, channel, outcome, and the acting staff member.

**FR-5.8.3 — Notes.** Internal `contact_notes` are staff-only, never exposed to the counterparty, and never shown inside a guest-visible message thread.

**FR-5.8.4 — Tasks.** `crm_tasks` are follow-ups with owner, due date, and status. Overdue tasks surface in the Staff dashboard.

---

# §5.9 Support & Disputes

> **New in v3.0.** v2.4 scattered support into §5.5.13 (supplier support), §5.16.10 (admin support), and WhatsApp escalation without a guest-facing definition.

**FR-5.9.1 — Ticket model.** Every inbound support request becomes a ticket: ID, booking ref (nullable), principal, channel, category, priority, assignee, SLA, status. Creation over WhatsApp (§5.3.9), email, or a web form all land in the same queue.

**FR-5.9.2 — Categories.** Booking (state, change, cancel), payment (failed, refund, chargeback), supplier (fulfilment, quality), account (access), content, general.

**FR-5.9.3 — SLA.** Critical (payment failed, booking pending >1h) 2h; High 4h; Normal 24h; Low 72h. Breaches page the on-call.

**FR-5.9.4 — WhatsApp integration.** Tickets created from WhatsApp carry the full thread; an agent replying from the console sends back into the same WhatsApp thread (§5.3.9).

**FR-5.9.5 — Dispute record.** Guest-vs-supplier disputes are a ticket subtype with evidence links, resolution path, communication log, and final outcome. Resolution can mint a refund (§5.20) only through the refund policy engine.

**FR-5.9.6 — Playbooks.** Numbered resolution steps per category, visible inline in the ticket. Ai-assisted routing is post-MVP.

---

# §5.10 Reviews & Reputation

> **New in v3.0.** v2.4 referenced "guest reviews" and a review flag in the trust score without defining them.

**FR-5.10.1 — Review collection.** A review is invited after checkout (T+7 days) via WhatsApp + email. Rating 1–5, optional free text, optional per-aspect ratings (accuracy, location, cleanliness, value, communication).

**FR-5.10.2 — Moderation.** Reviews can be flagged by suppliers or by guests; flagged reviews are held for moderation before publication. Fraud rules: one review per booking, review only after checkout, no reviews from the same IP cluster as the supplier within 24h of publication.

**FR-5.10.3 — Response.** Suppliers can respond publicly once per review.

**FR-5.10.4 — Feed into trust score.** Guest rating contributes 20% of the supplier trust score (FR-5.5.45) once it has at least 10 reviews; below 10 reviews its weight is re-distributed.

**FR-5.10.5 — Display.** Review scores appear on product pages and in supplier comparisons (FR-15.12).

---

# §5.11 Search, Index & Geo

> **New in v3.0.** v2.4 implied Postgres FTS + PostGIS in §6.8 but never required it.

**FR-5.11.1 — Owned inventory search.** Full-text search over property and tour names, descriptions, and amenity tags plus PostGIS radius/bounding-box filtering. `properties.geog` and `cities.geog` are PostGIS geographies indexed with GiST.

**FR-5.11.2 — Destination autocomplete.** `pg_trgm` similarity over property names, cities, and airports, ranked by exact → prefix → trigram → popularity.

**FR-5.11.3 — Multi-source merge.** Owned and sourced results are merged and deduplicated per §4.7 and §5.24.

**FR-5.11.4 — Freshness.** Owned inventory freshness target <24h; sourced cache TTLs are per-contract (FR-5.13.30).

> **Numbering note.** §5.1, §5.2 and §5.12 are unassigned in v3.0 and are reserved for future verticals or channels. Only §5.5, §5.6, §5.13–§5.16 (carried from v2.4), §5.3–§5.4 (in `05-whatsapp.md`), and §5.17–§5.24 (new in v3.0) are authoritative.

---

# §5.13 API & Contract Management

> Source: v2.4 `04b`, §5.13. FR numbers renumbered `FR-13.x → FR-5.13.x` (pure prefix). Corrections inline.

## 5.13.1 Purpose

ArriveSuite connects to external suppliers, payment providers, notification channels, and other services through APIs. Each integration is a first-class `integration_contract` with its own credentials, health, failover, commercial terms, and lifecycle — **per-API contract isolation**.

## 5.13.2 Domain Model

**FR-5.13.1 — Per-API contract isolation.** Every API integration is an `integration_contract`. One provider (Amadeus) may have multiple contracts (Flights, Hotels), each with independent credentials, environment scope, health, failover, commercial terms, Contract ID and audit history.

**FR-5.13.2 — Contract identity.** Globally unique Contract ID (`{PROVIDER}-{VERTICAL}-{REGION}-{NNN}`), editable API Name, locked Parent Supplier, vertical, environment (sandbox|production), status (live|throttled|pending_owner|enquiry|disabled).

**FR-5.13.3 — Locked parent supplier.** Once created, a contract's parent supplier cannot change; changing it requires a new contract and manual booking migration.

## 5.13.3 Credentials & Environment

**FR-5.13.4 — Environment-aware credential storage.** Sandbox and production credentials are separate records.

**FR-5.13.5 — Encrypted at rest.** AES-256-GCM, envelope encryption via KMS-managed key.

**FR-5.13.6 — Masked by default.** Last 4 characters shown only.

**FR-5.13.7 — Reveal ceremony.** Super Admin only; password + 2FA re-auth; reason; max 30 seconds on screen; every reveal (incl. copy) writes an `audit_events` row.

**FR-5.13.8 — Every reveal is audited.** (Merged detail of v2.4 FR-13.8.)

**FR-5.13.9 — Copy is a reveal.**

## 5.13.4 Rotation Workflow

**FR-5.13.10 — Rotation is a ceremony.** Request (reason) → second Super Admin approves (two-person rule) → provision in provider dashboard → validate → activate with 7-day grace → auto-revoke old.

**FR-5.13.11 — Rotation reasons.** `scheduled`, `suspected_compromise`, `provider_request`, `compliance`, `other`.

**FR-5.13.12 — Rotation reminders.** 14, 7, 1, 0 days before expiry.

**FR-5.13.13 — Validation failure handling.** Abort; old credential remains active.

**FR-5.13.14 — Rotation audit trail.** Every step audited.

## 5.13.5 Health Monitoring

**FR-5.13.15 — Continuous health checks.** Every contract is health-checked **every 60 seconds** (v3.0:was 30s; at ~200 contracts 60s halves check volume with no loss of signal — §15.4).

**FR-5.13.16 — Health status levels.** `healthy`, `degraded`, `down`, `disabled`.

**FR-5.13.17 — Health timeline.** 24h and 7d sparkline.

**FR-5.13.18 — Test Connection action.** Manual test with detailed result.

**FR-5.13.19 — Last-tested badge.**

**FR-5.13.20 — Webhook health.** Last received, signature status, recent failures, retry queue.

## 5.13.6 Kill Switch

**FR-5.13.21 — Granular disable scopes.** `outbound_calls`, `inbound_webhooks`, `search_visibility`, `new_bookings`, `refunds`.

**FR-5.13.22 — Disable confirmation.** Scopes, reason (min 20 chars), impact summary, confirmation.

**FR-5.13.23 — Disabled banner.**

**FR-5.13.24 — Auto-disable conditions.** Health below threshold for 15 minutes; no owner update for 30 days (extranet); failed webhook signature verification ×10 in 24h. **v3.0 correction:** "trust score below 80%" is *removed* as an auto-disable trigger; it routes to a Supplier Ops review (FR-5.5.46).

**FR-5.13.25 — Kill switch urgency.** Reachable in ≤2 clicks, executes < 5 seconds.

## 5.13.7 Failover & Routing

**FR-5.13.26 — Failover priority.** P1 critical auto-failover; P2 important manual-ok; P3 best-effort.

**FR-5.13.27 — Failover target.** P1 and P2 must declare one.

**FR-5.13.28 — Failover execution.** Automatic when a P1 is unavailable for 60 seconds.

**FR-5.13.29 — Failover test mode.** Manual sample-traffic test.

## 5.13.8 Caching & Rate Limits

**FR-5.13.30 — Tiered cache configuration.** Static CDN (7d), Redis rate (15 min), prefetch (configurable).

**FR-5.13.31 — Rate limit tracking.** Configured limit, peak, utilization, 429s.

**FR-5.13.32 — Rate limit alerts.** 80% for 5 min → P2; 95% → P1.

**FR-5.13.33 — Prefetch rules.** Route patterns, frequency, time windows.

## 5.13.9 Commercial Terms

**FR-5.13.34 — FX buffer.** Per-contract override of platform default (1.5%).

**FR-5.13.35 — Markup model.** Base cost model (published|net|BAR) + per-channel overrides.

**FR-5.13.36 — Base cost model.** Declared per contract.

**FR-5.13.37 — Cost tracking.** Paid APIs: transactions, spend, cost/txn, budget cap.

**FR-5.13.38 — Cost alerts.** 80% → P2, 100% → P1.

## 5.13.10 Extranet Contract Variant — WITHDRAWN

**FR-5.13.39 — Extranet-specific fields. WITHDRAWN.** v2.4 modelled lodge suppliers as `integration_contract` rows with owner fields. That put an API-credential vault in front of lodge owners and created two sources of truth for the same supplier. Extranet suppliers remain `suppliers` rows; trust and auto-disable live in FR-5.5.45–FR-5.5.49.

**FR-5.13.40 — Extranet trust score. WITHDRAWN.** Superseded by FR-5.5.45.

**FR-5.13.41 — Extranet auto-disable. WITHDRAWN.** Superseded by FR-5.5.49.

## 5.13.11 Bulk Operations

**FR-5.13.42 — Bulk test connection.** Select multiple, test, view results.

**FR-5.13.43 — Bulk rotation request. WITHDRAWN.** Rotation stays per-contract (FR-5.13.10); rotating whole contracts at once multiplies the two-person ceremony without reducing risk.

**FR-5.13.44 — Bulk export. WITHDRAWN.** Replaced by audit-log export (FR-5.16.42).

**FR-5.13.45 — Bulk disable.** Multiple contracts disabled in one action with aggregate impact.

## 5.13.12 Permissions

**FR-5.13.46 — Role-based access.** View: Finance Ops (payments only), Super Admin. Reveal/copy: Super Admin. Request rotation: Finance Ops (payments only), Super Admin. Approve rotation: Super Admin. Test: Finance Ops, Super Admin. Disable: Finance Ops (payments only), Super Admin. Re-enable: Super Admin. Add: Super Admin. Delete: nobody.

**FR-5.13.47 — Two-person rule.** Requester ≠ approver.

**FR-5.13.48 — No deletion.** Contracts are disabled, never deleted.

## 5.13.13 Audit & Compliance

**FR-5.13.49 — Every action is audited.**

**FR-5.13.50 — Retained indefinitely.** 7-year retention per §6.14.

**FR-5.13.51 — Exportable for audits.** CSV or PDF with signed hash.

## 5.13.14 Contract Diff Viewer — WITHDRAWN

**FR-5.13.52 — Change history. WITHDRAWN.** The immutable audit log (§5.16.11) already records every contract mutation; a second diff UI duplicated it. Contract changes appear in the audit log filtered by entity.

**FR-5.13.53 — Diff format. WITHDRAWN.** Replaced by audit-log diff rendering.

## 5.13.15 Data Model

**FR-5.13.54 — New tables.** `integration_contracts`, `integration_credentials`, `integration_rotation_requests`, `integration_health_checks`, `integration_webhooks`, `integration_costs`.

**FR-5.13.55 — Migrations.** `integration_providers` retained as registry; credentials scoped per contract.

**FR-5.13.56 — Indexes.** `integration_contracts(contract_ref)` unique, `(provider_id)`, `(status)`; `integration_credentials(contract_id, environment, status)`; `integration_health_checks(contract_id, checked_at DESC)`.

## 5.13.16 UI Requirements

**FR-5.13.57 — Index screen.** Search, filters, supplier grouping, columns, row actions, bulk actions, footer.

**FR-5.13.58 — Detail screen layout.** Header, environment toggle, Test Connection, Save, Core Identity, Key Vault, Markup & Tax, Policies, Availability & Sync, Mid-Back Office, Audit & Safety.

**FR-5.13.59 — Rotation workflow screens.** Request, Approve, Paste key, Validate & activate, Grace period dashboard.

**FR-5.13.60 — Disable dialog.** Scopes, reason, impact, confirmation.

**FR-5.13.61 — Webhook health panel.**

**FR-5.13.62 — Cost dashboard.**

**FR-5.13.63 — Change history tab. WITHDRAWN.** Replaced by the audit-log view (FR-5.16.41).

## 5.13.17 Operational Runbooks

**FR-5.13.64 — Rotation runbook.** `/docs/runbooks/rotation.md`.

**FR-5.13.65 — Incident runbook.** `/docs/runbooks/incident.md`.

**FR-5.13.66 — Compromise runbook.** `/docs/runbooks/compromise.md`.

## 5.13.18 Alerts

**FR-5.13.67 — Alert destinations.** P1: Slack + SMS + email. P2: Slack + email. P3: Slack.

**FR-5.13.68 — Alert triggers.** Health down 60s → P1; degraded 15 min → P2; rate limit >95% 5 min → P1; >80% 15 min → P2; cost >100% → P1; >80% → P2; rotation overdue 7d → P2; failed validation → P2; webhook signature failure ×10/24h → P1; auto-disable → P1; failover executed → P1. **v3.0 correction:** "trust score < 80%" trigger removed (routes to review, FR-5.5.46).

**FR-5.13.69 — Alert suppression.** During planned maintenance windows.

## 5.13.19 Performance Requirements

**FR-5.13.70 — Index screen load.** < 800ms (P95) with 200 contracts.

**FR-5.13.71 — Detail screen load.** < 1s (P95).

**FR-5.13.72 — Test Connection latency.** < 10s (P95).

**FR-5.13.73 — Disable latency.** < 5s (P99).

**FR-5.13.74 — Health check frequency.** 60s continuous, up to 200 contracts. (v3.0: was 30s.)

## 5.13.20 Acceptance Criteria

Contracts creatable/editable/searchable; credentials encrypted, masked, audited; rotation two-person; reminders fire; health checks continuous; Test Connection detailed; webhook health tracked; scope-reason disable; failover configurable; bulk test/disable work; RBAC enforced; audit immutable/exportable; alerts route; runbooks published; performance targets met.

---

# §5.14 Pricing & Tax Engine

> Source: v2.4 `04b`, §5.14. FR numbers renumbered `FR-14.x → FR-5.14.x`. Corrections inline. `§5.14.3` was missing in v2.4 and is authored below.

## 5.14.1 Purpose

The Pricing Engine is the single source of truth for how much anything costs. Every price shown to any user is computed from a base cost plus a deterministic set of rules, FX, tax, fees, and discounts. Principles: one engine many channels; deterministic; immutable snapshots; versioned; explainable.

## 5.14.2 Inputs and Outputs

**FR-5.14.1 — Pricing inputs.** `contract_id`, `product_ref`, `inventory_source` (owned|sourced|consolidated), `check_in`, `check_out`, `nights`, `pax`, `channel` (b2c|b2b|corporate|admin), `market`, `agency_id` (nullable), `corporate_id` (nullable), `display_currency`, `user_id`, `is_new_booking`, `is_modification`, `is_group`.

**FR-5.14.2 — Pricing outputs.** Base cost, FX rate + buffer, markup lines, subtotal, tax lines, total tax, fee lines, total fees, discount lines, total discount, final total, display currency info, pricing version, rules applied, computed_at.

## 5.14.3 Calculation Pipeline

> **New in v3.0** — v2.4 referenced an ordered calculation but never defined it.

The pipeline runs in this fixed order for every quote:

1. Resolve base cost from `inventory_source` (owned rate | sourced net).
2. Convert to base currency (BWP) using the snapshot FX rate + buffer.
3. Apply `percentage` / `fixed` / `tiered` / `rule_based` markups by scope priority (FR-5.14.5–FR-5.14.9).
4. Apply fees (FR-5.14.39–FR-5.14.43).
5. Apply taxes (FR-5.14.14–FR-5.14.22).
6. Apply discounts (FR-5.14.44–FR-5.14.52).
7. Round per rule (FR-5.14.34–FR-5.14.38).
8. Freeze result into a signed quote + immutable `pricing_snapshots`.

**FR-5.14.3 — Immutability of output.** Output is frozen into `pricing_snapshots` at booking time.

**FR-5.14.4 — Snapshot integrity.** Snapshots cannot be edited or deleted.

## 5.14.4 Rule Model

**FR-5.14.5 — Rule types.** `percentage`, `fixed`, `tiered`, `rule_based`, `caps_floor`, `pass_through`.

**FR-5.14.6 — Rule scope.** `global`, `channel`, `market`, `agency`, `corporate`, `contract`, `product_type`, `date_range`, `currency`, `inventory_class`.

**FR-5.14.7 — Rule priority.** Lower numbers first; later rules override earlier.

**FR-5.14.8 — Rule resolution order.** Collect matches → filter active → sort by priority → apply → track effective value → detect conflicts.

**FR-5.14.9 — Conflict detection.** Same-priority, same-field conflicts error out.

**FR-5.14.10 — Rule versioning.** Versions immutable once active.

**FR-5.14.11 — Version activation.** Dry-run comparison required; two-person approval if >10% of products affected; effective date; audit.

**FR-5.14.12 — Version immutability.** Active versions cannot be edited.

**FR-5.14.13 — Version rollback.** Reason + two-person approval + audit.

## 5.14.5 Tax Model

**FR-5.14.14 — Tax rules are country-scoped.**

**FR-5.14.15 — Botswana tax rules (initial).** VAT 14% accommodation/tours (exclusive); VAT 0% international flights; Tourism Levy TBD (confirm at launch, §14.18); WHT 10% corporate B2B cross-border; Airport Tax fixed; Fuel Surcharge variable.

**FR-5.14.16 — Tax applicability.** Country, tax type, rate in bps, product types, channels, inclusive/exclusive, pass-through.

**FR-5.14.17 — Tax calculation.** Taxes on subtotal after markup, before discounts.

**FR-5.14.18 — Tax display.** Include/exclude indicator, total, expandable, BURS VAT number.

**FR-5.14.19 — Tax exemptions.** Country-based, corporate-based, product-based.

**FR-5.14.20 — Tax registration number.** Stored in `platform_settings`, displayed on invoices.

**FR-5.14.21 — Tax filing data.** Written to `tax_filings`.

**FR-5.14.22 — Tax rule changes.** New version, dry-run, two-person approval, audit.

## 5.14.6 FX Model

**FR-5.14.23 — Base currency.** BWP; internal pricing in BWP minor units.

**FR-5.14.24 — Supported display currencies.** BWP, USD, ZAR, EUR.

**FR-5.14.25 — Display currency conversion.** Display only; settlement in BWP.

**FR-5.14.26 — FX rate sources.** Bank of Botswana primary, OpenExchangeRates fallback, refreshed hourly.

**FR-5.14.27 — FX rate storage.** Base, quote, rate in bps, source, fetched_at.

**FR-5.14.28 — FX buffer.** Default 1.5% (150 bps); per-contract override.

**FR-5.14.29 — FX buffer resolution.** Contract → channel → market → global default.

**FR-5.14.30 — FX snapshot.** Stored with booking; never re-fetched.

**FR-5.14.31 — Rate staleness.** Warning at 24h, forced refresh.

**FR-5.14.32 — Manual FX override.** Super Admin only, max 48h, audited.

**FR-5.14.33 — Multi-currency B2B contracts.** Supported.

## 5.14.7 Rounding Model

**FR-5.14.34 — Currency-specific rounding.** BWP nearest 5; USD/ZAR/EUR nearest 1.

**FR-5.14.35 — Rounding point.** Applied at final total, not per line.

**FR-5.14.36 — Rounding direction.** nearest / up / down.

**FR-5.14.37 — Rounding overrides.** Per channel, market, contract.

**FR-5.14.38 — Rounding in pricing snapshots.** Rule stored in snapshot.

## 5.14.8 Fees

**FR-5.14.39 — Supported fee types.** `platform_service_fee`, `payment_processing_fee`, `booking_fee`, `cancellation_fee`, `amendment_fee`, `no_show_fee`.

**FR-5.14.40 — Fee absorption.** absorbed / passed_through / split.

**FR-5.14.41 — Fee calculation.** After markup and tax, before discounts.

**FR-5.14.42 — Fee display.** Separate line items.

**FR-5.14.43 — Fee versioning.** Versioned with markup and tax rules.

## 5.14.9 Discounts

**FR-5.14.44 — Supported discount types.** `promo_code`, `loyalty`, `volume`, `seasonal`, `referral`, `manual`.

**FR-5.14.45 — Discount ordering.** After markup and fees, before tax.

**FR-5.14.46 — Discount caps.** cap_cents, cap_percentage_bps, combined cap.

**FR-5.14.47 — Discount stacking rules.** stackable / exclusive / best_of.

**FR-5.14.48 — Promo code handling.** Case-insensitive, redemption limits, date ranges, restrictions.

**FR-5.14.49 — Loyalty points.** Points-to-currency rate, min/max redemption.

**FR-5.14.50 — Volume discounts.** By pax, nights, booking value, group flag.

**FR-5.14.51 — Manual discounts.** Reason (min 20), approval, audit.

**FR-5.14.52 — Discount audit.** Rule ID, amount, reason, applied_by, timestamp.

## 5.14.10 Channel-Specific Pricing

**FR-5.14.53 — B2C pricing.** Full retail, tax included, markup hidden.

**FR-5.14.54 — B2B pricing.** Net rate, markup, commission, tax breakdown, total.

**FR-5.14.55 — Corporate pricing.** Negotiated rate; out-of-policy flagged. (Post-MVP — §5.6.5.)

**FR-5.14.56 — Admin pricing.** All layers visible.

**FR-5.14.57 — Markup disclosure.** Hidden from guests; disclosed to agency (own bookings), corporate managers.

**FR-5.14.58 — Multi-currency B2B.** Quotes in requested currency.

**FR-5.14.59 — Commission vs markup.** Distinguished in B2B pricing.

## 5.14.11 Data Model

**FR-5.14.60 — New tables.** `pricing_rules`, `pricing_rule_scopes`, `pricing_versions`, `tax_rules`, `tax_filings`, `currency_rates`, `fx_buffer_overrides`, `rounding_rules`, `fee_rules`, `discount_rules`, `discount_redemptions`, `pricing_snapshots`.

**FR-5.14.61 — Required indexes.** `pricing_rules(version_id, is_active)`; `pricing_rule_scopes(rule_id, scope_type, scope_value)`; `pricing_versions(effective_from, is_active)`; `tax_rules(country_code, tax_type, is_active)`; `currency_rates(base_currency, quote_currency, fetched_at DESC)`; `discount_rules(promo_code, is_active)`; `pricing_snapshots(booking_id)`.

**FR-5.14.62 — Migration from previous draft.** `pricing_snapshots` replaced by expanded version.

## 5.14.12 UI Requirements

**FR-5.14.63 — Rule list.** Priority, name, scope chips, value, toggle.

**FR-5.14.64 — Scope matrix.** Rules × channels × markets.

**FR-5.14.65 — Live preview table.** Final price per channel/market.

**FR-5.14.66 — Tax rules panel.**

**FR-5.14.67 — FX panel.** Current rate, source, buffer, last-updated.

**FR-5.14.68 — Rounding panel.** Per currency with overrides.

**FR-5.14.69 — Version indicator.** Active version + effective date.

**FR-5.14.70 — Scenario tester. WITHDRAWN.** Superseded by the dry-run gate in FR-5.14.11, whose output is a diff table.

**FR-5.14.71 — Version comparison. WITHDRAWN.** Replaced by audit-log entity history.

**FR-5.14.72 — Conflict warnings.** Conflicting rules highlighted.

**FR-5.14.73 — Dry-run visualization. WITHDRAWN.** Activation requires the FR-5.14.11 dry-run report; a separate visualization screen is not built.

## 5.14.13 Performance

**FR-5.14.74 — Single pricing latency.** < 50ms (P95) with 100 rules.

**FR-5.14.75 — Bulk pricing latency.** 100 products under 500ms (P95).

**FR-5.14.76 — Rule caching.** Redis with invalidation on change.

**FR-5.14.77 — Snapshot write latency.** < 100ms (P95).

## 5.14.14 Testing

**FR-5.14.78 — Unit tests.** Every rule type.

**FR-5.14.79 — Integration tests.** Every pricing scenario.

**FR-5.14.80 — Regression tests.** Every version activation.

**FR-5.14.81 — Property-based tests.** final = subtotal + tax + fees − discounts; tax = sum of lines.

**FR-5.14.82 — Snapshot integrity tests.** Cannot update or delete.

## 5.14.15 Observability

**FR-5.14.83 — Metrics.** `pricing.calculations.total`, `latency_ms`, `rules.resolved`, `version.active`, `conflicts.detected`, `fx.rate.age_seconds`, `fx.rate.staleness_alert`.

**FR-5.14.84 — Alerts.** FX > 24h → P2; pricing latency >100ms/5min → P1; rule conflict → P1; activation without dry-run → P0 block; snapshot write failure → P1; tax change without approval → P0 block.

**FR-5.14.85 — Audit events.** Every pricing action audited.

## 5.14.16 Permissions

**FR-5.14.86 — Role-based access.** View: Finance Ops, Super Admin, Reservations. Create/edit rules, activate, rollback, manage tax, override FX: Super Admin. Manual discount above P1,000: Super Admin.

**FR-5.14.87 — Manual discount thresholds.** Above P1,000 requires Super Admin.

**FR-5.14.88 — Two-person rule.** Version activation, tax rule changes, FX overrides.

## 5.14.17 Acceptance Criteria

Rule types, scope resolution, priority ordering, conflict detection, version control, tax, FX, rounding, fees, discounts, channel pricing, immutable snapshots, performance targets, tests, observability.

## 5.14.18 Botswana-Specific Considerations

**FR-5.14.89 — VAT registration.** BURS VAT number required.

**FR-5.14.90 — Tourism Levy.** Confirm rate with BTO (§19.2).

**FR-5.14.91 — WHT rules.** 10% per BURS.

**FR-5.14.92 — BWP rounding.** Nearest 5.

**FR-5.14.93 — Multi-currency B2B.** Supported for international agencies.

---

# §5.15 B2C Booking Flow

> Source: v2.4 `04b`, §5.15. FR numbers renumbered `FR-15.x → FR-5.15.x`. FR-15.85 gap closed (new). Corrections inline.

## 5.15.1 Purpose

This section defines the B2C guest-facing booking experience — search to confirmation. Core principle: transparency without fragility. Guests see how prices are composed, but pricing decisions are made server-side and signed. The client displays; it never determines.

## 5.15.2 Search Interface

**FR-5.15.1 — Search bar.** Destination autocomplete, date range, pax, multi-city, vertical selector.

**FR-5.15.2 — Destination autocomplete.** `pg_trgm` fuzzy match, ranked exact → prefix → popularity.

**FR-5.15.3 — Multi-city input.** Chip-based, keyboard-navigable.

**FR-5.15.4 — Date range picker.** Single date or range, prices per day where available, min stay enforced, past dates prevented, timezone-aware.

**FR-5.15.5 — Passenger composition.** Adults, children (with individual age), infants, seniors.

**FR-5.15.6 — Vertical selector.** All enabled verticals; disabled hidden.

**FR-5.15.7 — Search submission.** Server-side; no client filtering or ranking.

**FR-5.15.8 — Search URL persistence.** Reflected in URL for bookmarks, sharing, back button, refresh.

## 5.15.3 Search Results

**FR-5.15.9 — Result loading.** Skeleton placeholders, progressive rendering, "searching" indicator.

**FR-5.15.10 — Result cards.** Image, name, type, location, rating, trust indicators, amenities, child policy badge, price (total + per-night), CTA.

**FR-5.15.11 — Multi-supplier deduplication.** One card per product per owned property; owned wins when both describe the same property; sourced is suppressed or labelled when it maps to the same property (§4.7, §5.24).

**FR-5.15.12 — Supplier comparison.** Source, base rate, retail, cancellation, confirmation time, guest rating, trust score.

**FR-5.15.13 — Filters.** Price, stops, airlines, property type, amenities, child policy, trust threshold, rating, cancellation.

**FR-5.15.14 — Filter state persistence.** In URL.

**FR-5.15.15 — Mobile filters.** Full-screen sheet, header, scrollable content, sticky footer.

**FR-5.15.16 — Cache indicator chips.** CDN TTL, Redis TTL, prefetch status, payload size.

**FR-5.15.17 — Result sorting.** Recommended, price low/high, rating, trust score.

**FR-5.15.18 — Result pagination.** 20/page default, page numbers + Load more.

**FR-5.15.19 — Result empty state.** Clear message, filter suggestions, clear all.

**FR-5.15.20 — Result error state.** Specific message, retry, alternatives, Sentry report.

## 5.15.4 Product Detail

**FR-5.15.21 — Product detail page.** Hero gallery, name/type/rating, location with map, description, amenities, room types or departures, availability calendar, reviews, policies, booking sidebar.

**FR-5.15.22 — Room/departure selection.** Name, description, capacity, rate plan, availability, price.

**FR-5.15.23 — Availability display.** For exact dates; unavailable show alternatives or waitlist.

**FR-5.15.24 — Price display on detail.** Base, total, taxes/fees indicator, currency.

**FR-5.15.25 — Price breakdown panel.** Base, FX, market markup, channel markup, discounts, taxes, fees, final, rounding.

**FR-5.15.26 — Price audit trail.** Engine version, quote timestamp, expiry, every rule applied, signature.

**FR-5.15.27 — Price freshness.** TTL 15 min; re-fetch on expiry; explicit acceptance if changed.

## 5.15.5 Booking Flow

**FR-5.15.28 — Multi-step checkout.** Search → Results → Details → Guest info → Payment → Confirmation; each step distinct URL.

**FR-5.15.29 — State persistence.** sessionStorage; refresh preserves.

**FR-5.15.30 — Guest information.** Lead guest, additional guests, passport/ID, DOB, special requests, emergency contact.

**FR-5.15.31 — Guest count validation.** Against capacity, rate plan rules, airline/hotel rules; specific error messages.

**FR-5.15.32 — Payment method selection.** Card (DPO Pay primary, Paystack secondary fallback), mobile money (Phase 2), bank transfer, wallet, pay later. **v2.7 update:** DPO Pay replaces PayTabs as primary provider; 85% confidence, subject to sandbox validation.

**FR-5.15.33 — Payment confirmation.** Explicit total acceptance, terms acceptance, OTP/2FA where required.

**FR-5.15.34 — Idempotency.** Client-generated UUID v4 persisted in sessionStorage; server deduplicates.

**FR-5.15.35 — Booking reference.** Format `ARS-YYYY-NNNNNN`; displayed, copyable, QR code; in emails and vouchers.

**FR-5.15.36 — Confirmation screen.** Reference, product summary, total paid, supplier contact, voucher PDF, itinerary, add to calendar, share.

**FR-5.15.37 — Honest state messaging.** Instant confirm: "Booking confirmed"; ticketing pending: "ticket being issued"; on-request: "awaiting supplier confirmation". Never claim instant when it isn't.

## 5.15.6 Mobile Behavior

**FR-5.15.38 — Mobile-first responsive design.** 320–639 / 640–1023 / 1024+.

**FR-5.15.39 — Mobile navigation.** Sticky header, bottom nav (Phase 2), full-screen sheets, swipe galleries.

**FR-5.15.40 — Mobile checkout.** Native input types, autofill, orientation change, soft keyboard.

**FR-5.15.41 — Mobile performance.** <3s on 3G, <100KB critical-path JS, offline-tolerant.

## 5.15.7 Loading, Error, and Empty States

**FR-5.15.42 — Loading states.** Skeletons matching final layout, inline spinners, progress indicators.

**FR-5.15.43 — Error states.** Specific message, error code, suggested action, retry, Sentry.

**FR-5.15.44 — Error taxonomy.** network, server, validation, business, provider, auth.

**FR-5.15.45 — Empty states.** Clear explanation, suggested action, quick action.

**FR-5.15.46 — Offline state.** Offline indicator, queued non-critical actions, blocked critical with message.

## 5.15.8 Signed Quotes

**FR-5.15.47 — Server-side pricing.** Client never computes.

**FR-5.15.48 — Quote endpoint.** `POST /api/v1/pricing/quote` → `{ quote_id, base_cost_cents, fx_rate_bps, ..., signature, expires_at }`.

**FR-5.15.49 — Batch quote endpoint.** `POST /api/v1/pricing/batch`, under 500ms (P95) for 100 products.

**FR-5.15.50 — Quote signature.** HMAC over quote_id, total, version, expires_at.

**FR-5.15.51 — Quote expiry.** 15 minutes, server-enforced.

**FR-5.15.52 — Quote re-verification.** Server re-runs pricing on booking; mismatch rejects.

**FR-5.15.53 — Quote audit.** Stored in `pricing_quotes`, retained 90 days.

## 5.15.9 Accessibility

**FR-5.15.54 — WCAG 2.1 AA.** Contrast ≥ 4.5:1, keyboard, focus visible, ARIA labels, semantic HTML, skip links.

**FR-5.15.55 — Keyboard navigation.** Tab/Shift+Tab/Enter/Escape/arrows, focus trapped in modals.

**FR-5.15.56 — Screen reader support.** Alt text, aria-live, form errors.

**FR-5.15.57 — Reduced motion.** `prefers-reduced-motion`.

**FR-5.15.58 — Text scaling.** 200% zoom without horizontal scroll.

## 5.15.10 Multi-Currency

**FR-5.15.59 — Currency toggle.** BWP default, USD, ZAR, EUR.

**FR-5.15.60 — Preference persistence.** Cookie + account.

**FR-5.15.61 — Currency display.** Code, decimal places, locale separators.

**FR-5.15.62 — Conversion disclosure.** Rate used, refreshed hourly, base amount on hover.

## 5.15.11 Multi-Language

**FR-5.15.63 — Language support.** English default, Setswana infrastructure (§13).

**FR-5.15.64 — Language toggle.** Header or footer.

**FR-5.15.65 — Language persistence.** Cookie; applied to emails.

**FR-5.15.66 — Date and number formatting.** Per locale.

## 5.15.12 Performance

**FR-5.15.67 — Page load targets.** Search <1.5s; results (cached) <2s; results (live) <4s; detail <1s; checkout <1s; confirm <1.5s.

**FR-5.15.68 — Time to interactive.** <2s (P95) mobile 3G.

**FR-5.15.69 — FCP.** <1s desktop, 1.5s mobile.

**FR-5.15.70 — Core Web Vitals.** LCP < 2.5s, FID < 100ms, CLS < 0.1.

**FR-5.15.71 — Bundle size.** < 100KB gzipped on critical path.

## 5.15.13 SEO

**FR-5.15.72 — Server-side rendering.** Public pages SSR/SSG.

**FR-5.15.73 — Structured data.** Product, Flight, Offer, AggregateRating.

**FR-5.15.74 — Meta tags.** Title, description, OpenGraph, canonical.

**FR-5.15.75 — Sitemap.** `/sitemap.xml`.

## 5.15.14 Testing

**FR-5.15.76 — Unit tests.** Pricing and booking logic.

**FR-5.15.77 — Integration tests.** Full flow, error paths, idempotency, quote expiry.

**FR-5.15.78 — E2E tests.** Playwright: desktop, mobile, keyboard nav, screen reader (axe-core).

**FR-5.15.79 — Visual regression tests.** 1440 / 768 / 375.

## 5.15.15 Data Model Updates

**FR-5.15.80 — No new tables required.** Uses `pricing_snapshots`, `bookings`, `booking_items`, `booking_guests`, `payment_intents`, `payments`, `booking_documents`.

**FR-5.15.81 — Quote storage.** `pricing_quotes`: id, quote_ref, booking_id, account_id, product_ref, contract_id, input_params, output_params, rules_applied, pricing_version_id, base_cost_cents, final_total_cents, display_total_cents, display_currency, signature, computed_at, expires_at, consumed_at, created_at.

**FR-5.15.82 — Indexes.** `pricing_quotes(quote_ref)` unique, `(account_id, created_at DESC)`, `(booking_id)`, `(expires_at)`.

**FR-5.15.83 — Quote retention.** 90 days, then purge.

## 5.15.16 API Contracts

**FR-5.15.84 — Search endpoint.** `GET /api/v1/search?q=&vertical=&from=&to=&pax=&filters=&page=&per_page=&sort=`.

**FR-5.15.85 — Availability endpoint.** `GET /api/v1/availability?product_ref=&dates=`. Returns per-date open/closed, available units, and minimum stay. **New in v3.0** — closes the v2.4 FR-15.85 numbering gap. State changes and customer-UI surfaces flow through §9.1.

**FR-5.15.86 — Quote endpoints.** As FR-5.15.48 and FR-5.15.49.

**FR-5.15.87 — Booking endpoint.** `POST /api/v1/bookings` with `Idempotency-Key` header; body `{ quote_id, signature, guests, contact, special_requests }`.

**FR-5.15.88 — Payment endpoint.** `POST /api/v1/bookings/:ref/payment` with `Idempotency-Key`; body `{ method, return_url }`.

**FR-5.15.89 — Confirmation endpoint.** `GET /api/v1/bookings/:ref`.

## 5.15.17 UI Component Library

**FR-5.15.90 — Component inventory.** SearchBar, SearchFilters, SearchResultCard, SupplierComparison, ProductDetail, RoomSelector, DepartureSelector, PriceBreakdown, PriceAuditDrawer, GuestForm, PaymentMethodSelector, BookingSummary, ConfirmationScreen, CacheIndicatorChips, MobileFilterSheet, MultiCityChips, DateRangePicker, PassengerSelector, CurrencyToggle, LanguageToggle, TrustBadge, ChildPolicyBadge.

**FR-5.15.91 — Component library.** shadcn/ui primitives + Tailwind + design tokens.

**FR-5.15.92 — Design tokens.** Colors, typography, spacing, radii, shadows, motion.

## 5.15.18 Observability

**FR-5.15.93 — Metrics.** `search.requests`, `search.latency_ms`, `search.results_count`, `quote.requests`, `quote.latency_ms`, `booking.created`, `booking.confirmed`, `booking.failed`, `payment.succeeded`, `payment.failed`.

**FR-5.15.94 — Traces.** `trace_id` propagated.

**FR-5.15.95 — Alerts.** Search > 5s/5min → P2; quote error > 5%/5min → P1; booking failure > 2%/5min → P1; payment failure > 5%/5min → P1.

**FR-5.15.96 — Session replay.** 5% sampled, PII redacted.

## 5.15.19 Acceptance Criteria

Search with autocomplete/dates/pax; multi-city chips; skeleton/empty/error states; supplier dedup; detail page; price breakdown; price audit trail; multi-step checkout with persistence; guest validation; payment methods; explicit payment consent; idempotency; reference + copy/QR; confirmation with documents; honest post-booking state; mobile filter sheet; currency and language toggles; WCAG AA; Core Web Vitals; server-side signed pricing; quote expiry; specific error states; observability; E2E tests.

## 5.15.20 Out of Scope for B2C

**FR-5.15.20 (withdrawn-as-text, retained as the out-of-scope list).** Guest accounts are auto-created by §5.3.2 on first WhatsApp/email verification rather than via registration; saved payment methods, wishlists, loyalty points, review submission (§5.10, Phase 8), referral program, group booking tools, corporate policies, subscription pricing are post-MVP.

---

# §5.16 Admin & Ops Console

> Source: v2.4 `04b`, §5.16. FR numbers renumbered `FR-16.x → FR-5.16.x`. §5.16.14 matrix authored (was referenced but absent). Corporate-client requirements marked DEFERRED. Corrections inline.

## 5.16.1 Purpose

The Admin & Ops Console is the internal interface for operations, supplier, finance, and compliance teams. Principles: workflow-grouped navigation; role-scoped by default; live by default (SSE for critical, polling for non-critical); auditable by default; dense but legible.

## 5.16.2 Navigation

**FR-5.16.1 — Grouped navigation.** Operations (Dashboard, Bookings, Supplier Hub, Inventory); Commerce (Markup & FX, Payments & Settlement); Trust & Ops (Support & Disputes, Audit Log, Settings). "Corporate Clients" group DEFERRED (P5, Phase 4+).

**FR-5.16.2 — Queue badges.** Live depths; critical red, warning amber, info gray.

**FR-5.16.3 — Role-based visibility.** Hidden if unauthorized; no disabled items.

**FR-5.16.4 — Command palette.** ⌘K / Ctrl+K for search, navigation, actions.

**FR-5.16.5 — Keyboard shortcuts.** ⌘K, G+B bookings, G+S suppliers, G+F finance, G+D dashboard, R refresh, Esc close, ? help, / focus search.

## 5.16.3 Dashboard

**FR-5.16.6 — KPI cards.** Today GMV, Active Bookings, Commission Earned, FX Buffer Profit, SLA Breaches Today. Value, delta, trend, drill-down.

**FR-5.16.7 — GMV chart.** 7-day bars/area, peak highlight, click-through, currency toggle.

**FR-5.16.8 — Supplier health table.** Name, type, success rate, latency, status, click-through.

**FR-5.16.9 — Activity feed.** Last 20 events with timestamp, actor, action, entity, severity.

**FR-5.16.10 — Alert banner.** Critical issues; dismissible; max 3 stacked.

## 5.16.4 Bookings Manager

**FR-5.16.11 — Booking list.** Search, filter, sort, pagination, column selection, saved views.

**FR-5.16.12 — Bulk actions.** CSV, PDF, resend voucher, batch confirm/cancel, reassign supplier, apply tag.

**FR-5.16.13 — Booking detail drawer.** Summary, FX conversion, supplier, guests, payment, fulfillment, communication, timeline, actions.

**FR-5.16.14 — Booking timeline.** Every event with timestamp, actor, action.

**FR-5.16.15 — Booking states.** Per §9.1 and §9.2; real-time via SSE.

## 5.16.5 Supplier Hub

**FR-5.16.16 — External supplier management.** Name, vertical, credentials status, markup override, FX buffer, latency, success rate, status, actions.

**FR-5.16.17 — Direct lodge monitoring.** Lodge, occupancy, ADR, last sync, sync status, housekeeping, actions.

**FR-5.16.18 — Supplier detail page.** Profile, contracts, rate plan history, booking volume, trust timeline, payout history, audit log.

**FR-5.16.19 — Health timeline.** 24h and 7d.

**FR-5.16.20 — Test connection.** Safe test endpoint, success/failure, latency, error, logged.

## 5.16.6 Inventory

**FR-5.16.21 — Unified availability view.** Supplier, product, source, available, blocked, rate, last sync.

**FR-5.16.22 — Filters.** Vertical, supplier, source type, availability, location, freshness.

**FR-5.16.23 — Bulk rate updates.** Multiple items, adjustment, preview, apply. Above threshold requires two-person approval.

## 5.16.7 Markup & FX Engine

**FR-5.16.24 — Global FX rules.** Base currency, provider, buffer slider, live preview, refresh timestamp.

**FR-5.16.25 — B2B tier management.** Retail, Agent Net, Corporate (DEFERRED), Sub-Agent with editable markup.

**FR-5.16.26 — Rule builder.** Condition, value, priority, example calculation, version control.

**FR-5.16.27 — Conversion log.** Every FX conversion with timestamp, original, rate, buffer, final, profit.

## 5.16.8 Payments & Settlement

**FR-5.16.28 — Payment KPIs.** Payable, receivable, wallet, reconciliation status.

**FR-5.16.29 — Transaction ledger.** Date, type, reference, amount, status, method, matched.

**FR-5.16.30 — Payout batch creation.** Period, suppliers, preview, two-person approval, mark paid, reconcile.

**FR-5.16.31 — Reconciliation.** Upload statement, auto-match, flag discrepancies, manual resolution, export.

**FR-5.16.32 — Refund processing.** Request, approve (two-person above threshold), process, confirm, reconcile.

## 5.16.9 Corporate Clients — DEFERRED

**FR-5.16.33 — Corporate client table. DEFERRED.** P5 portal and credit engine are post-MVP (§5.6.5).

**FR-5.16.34 — Credit management. DEFERRED.**

**FR-5.16.35 — Corporate detail page. DEFERRED.**

## 5.16.10 Support & Disputes

**FR-5.16.36 — Ticket queue.** ID, booking ref, issue, priority, assignee, SLA, status.

**FR-5.16.37 — WhatsApp integration.** Live chat, history, quick actions, escalation, attachments, templates.

**FR-5.16.38 — Resolution playbook.** Numbered steps, data, actions, snippets.

**FR-5.16.39 — SLA management.** Critical 2h, High 4h, Normal 24h, Low 72h; breach alerts.

**FR-5.16.40 — Dispute management.** Guest vs supplier with evidence, resolution path, communication log, final outcome.

## 5.16.11 Audit Log

**FR-5.16.41 — Audit log screen.** Timestamp, actor, action, entity, diff, trace_id.

**FR-5.16.42 — Audit search and filter.** Actor, action category, entity type, date range, IP, export.

**FR-5.16.43 — Audit immutability.** No edit, no delete; 7-year retention.

**FR-5.16.44 — Audit detail.** Full event, related events, actor's recent activity.

## 5.16.12 Real-Time Updates

**FR-5.16.45 — Live indicator.** Green pulse, amber reconnecting, red disconnected.

**FR-5.16.46 — Update mechanism.** SSE critical, polling (max 30s) non-critical.

**FR-5.16.47 — Manual refresh.** Button + "Last updated Xs ago".

**FR-5.16.48 — Update animations.** Feed entries animate in; KPI changes highlight; reduced motion respected.

## 5.16.13 Error, Loading, and Empty States

**FR-5.16.49 — Loading states.** Skeletons, inline spinners, progress indicators, optimistic UI where safe.

**FR-5.16.50 — Error states.** Specific message, error code, retry, suggestion, Sentry.

**FR-5.16.51 — Empty states.**

**FR-5.16.52 — Confirmation dialogs.** Destructive actions require confirmation with what, impact, reason, explicit confirm.

## 5.16.14 Permissions — AUTHORED MATRIX

> v2.4 FR-16.53 pointed every action at "§5.16.14 matrix" which was never written. This is the matrix.

| Action | Reservations | Supplier Ops | Finance Ops | Super Admin |
|---|---|---|---|---|
| View bookings | Yes | Yes | Yes | Yes |
| Confirm / cancel booking | Yes | Yes | Yes | Yes |
| Create payout batch | No | No | Yes | Yes |
| Approve payout batch | No | No | No | Yes |
| Refund < P5,000 | No | No | Yes | Yes |
| Refund ≥ P5,000 | No | No | No | Yes |
| View integration contracts | No | No | Payments only | Yes |
| Reveal credential | No | No | No | Yes |
| Request rotation | No | No | Payments only | Yes |
| Approve rotation | No | No | No | Yes |
| Disable integration | No | No | Payments only | Yes |
| Edit pricing rules | No | No | No | Yes |
| Apply manual discount ≤ P1,000 | No | No | Yes | Yes |
| Apply manual discount > P1,000 | No | No | No | Yes |
| View audit log | Yes | Yes | Yes | Yes |
| Export audit log | No | No | Yes | Yes |
| Edit platform settings | No | No | No | Yes |

**FR-5.16.53 — Role-based access control.** Every action is permission-gated per the §5.16.14 matrix.

**FR-5.16.54 — UI enforcement.** Nav, buttons, columns hidden; APIs return 403.

**FR-5.16.55 — Two-person rule.** Payout above threshold, version activation, FX change, credential rotation, supplier suspension, credit limit increase.

## 5.16.15 Accessibility

**FR-5.16.56 — WCAG 2.1 AA.**

**FR-5.16.57 — Keyboard navigation.**

**FR-5.16.58 — Screen reader support.**

**FR-5.16.59 — Reduced motion.**

## 5.16.16 Performance

**FR-5.16.60 — Page load targets.** Dashboard <1.5s; bookings list <1s; booking drawer <800ms; Supplier Hub <1s; supplier detail <1.2s; Markup & FX <1s; payments ledger <1.2s; tickets <1s; audit log <1.5s; settings <800ms.

**FR-5.16.61 — Update latency.** < 2s of the underlying event.

**FR-5.16.62 — Bulk operations.** 100 refunds <30s; 1,000 CSV exports <15s; 500 confirmations <60s.

**FR-5.16.63 — Table virtualization.** >100 rows virtualized, 60fps.

## 5.16.17 Data Model

**FR-5.16.64 — No new transactional tables required.**

**FR-5.16.65 — Materialized views.** `mv_dashboard_kpis` (60s), `mv_supplier_health` (60s), `mv_owned_share_of_gmv` (5 min). **v3.0 correction:** two of the five v2.4 MVs are cut (`mv_corporate_credit` deferred; `mv_channel_performance` cut); 30s refresh on `mv_supplier_health` relaxed to 60s.

**FR-5.16.66 — Saved views.** `admin_saved_views` (account_id, page_key, name, filters, column_config, is_default).

**FR-5.16.67 — Indexes.** `bookings(status, created_at DESC)`, `bookings(booking_ref)`, `bookings(account_id, created_at DESC)`, `audit_events(actor_id, created_at DESC)`, `audit_events(entity_type, entity_id)`, `message_threads(entity_type, entity_id)`.

## 5.16.18 API Contracts

**FR-5.16.68 — Admin API endpoints.** Dashboard, bookings, suppliers, integrations, inventory, pricing, FX, payments, support, audit, saved views. Corporate endpoints DEFERRED.

**FR-5.16.69 — SSE endpoints.** `/stream/bookings`, `/stream/suppliers`, `/stream/sla`, `/stream/payments`, `/stream/activity`.

**FR-5.16.70 — Rate limiting.** Read 300/min, write 60/min, bulk 10/min, SSE 5 concurrent.

## 5.16.19 Observability

**FR-5.16.71 — Metrics.** `admin.page.load_ms`, `admin.action.count`, `admin.action.error_count`, `admin.sse.connections`, `admin.sse.reconnects`, `admin.bulk_operation.duration_ms`.

**FR-5.16.72 — Traces.** `trace_id` propagated.

**FR-5.16.73 — Alerts.** Dashboard >3s/5min → P2; SSE drop >50% → P1; bulk failure >5% → P1; API error rate >2% → P1.

## 5.16.20 Testing

**FR-5.16.74 — Unit tests.** Rendering, interaction, permission gating, states.

**FR-5.16.75 — Integration tests.** Login → dashboard, search → confirm, filter → test connection, create payout → approve, ticket → resolve.

**FR-5.16.76 — E2E tests.** Full flows, keyboard-only, screen reader.

**FR-5.16.77 — Visual regression tests.** 1440 / 1024 / 375.

## 5.16.21 Acceptance Criteria

Nav grouped, role-scoped; queue badges live; command palette; shortcuts; dashboard KPIs; GMV chart click-through; supplier health table; real-time activity feed; alert banner; bookings list; booking drawer timeline; bulk actions; supplier hub; direct lodge monitoring; inventory view; rule builder; FX conversion log; payment ledger; reconciliation; payout batch with two-person rule; support with SLA; WhatsApp integration; playbooks; audit log; SSE; states; confirmation dialogs; permission gating; two-person rule; keyboard nav; WCAG AA; performance targets; bulk targets; MVs refreshing; SSE stable; rate limiting; observability; tests.

## 5.16.22 Out of Scope

Mobile admin console, native desktop apps, custom dashboard layouts, advanced BI, white-label, inline bulk editing of pricing rules, AI-assisted ticket routing, automated dispute resolution, multi-tenant admin.

---

# §5.17 Payments & Settlement

> **New in v3.0.** v2.4 had the payment tables and the PayTabs adapter name but no requirements for what the platform does with money. **v2.7 update:** Primary provider pivoted to DPO Pay (ADR-0023).

**FR-5.17.1 — Payment intent.** A booking creates exactly one `payment_intents` row per attempt. The intent carries booking_ref, amount, currency, method, provider, state (`requires_payment` | `processing` | `succeeded` | `failed` | `requires_action`), and expiry.

**FR-5.17.2 — Capture model.** DPO Pay is the primary provider (ADR-0023, 85% confidence pending sandbox validation). Paystack is the secondary fallback. Owned-inventory payments settle to ArriveSuite's merchant account; sourced-inventory payments are processed agent-model (§1.1) and settled net of the provider charge.

**FR-5.17.3 — 3-D Secure posture.** Card auth must support 3-D Secure step-up where the issuer requires it. **Unresolved launch risk** (§19.3): DPO Pay's 3-D Secure coverage for EU-issued cards making the P3 persona is not validated. The web payment path (not WhatsApp in-app browser) is the only launch surface for a 3-D Secure challenge.

**FR-5.17.4 — PCI posture.** ArriveSuite never stores, processes, or transmits raw card data. Entry happens on the provider-hosted page (DPO Pay or Paystack). ArriveSuite's scope is SAQ-A (§4.8.1). No card numbers, CVVs, or track data in any business table, `integration_payloads`, or logs.

**FR-5.17.5 — Refunds.** Every refund is initiated through the refund policy engine (§5.20). A refund cannot be issued for more than the original charge, cannot be issued twice, and requires two-person approval above the FR-5.16.14 threshold.

**FR-5.17.6 — Reconciliation.** Every payment, refund, and chargeback is matched to the provider statement on a 5-minute reconciliation cycle. Unmatched entries raise a Finance Ops alert (P2), then a P1 after 30 minutes.

**FR-5.17.7 — Idempotent payment writes.** `payments` and `refunds` are idempotency-keyed. A duplicate webhook delivery must not create a second payment or refund.

**FR-5.17.8 — Failure taxonomy.** Card declined, insufficient funds, expired card, suspected fraud, processor error, network error — each mapped to a guest-facing message and an ops action.

---

# §5.18 Payouts & Supplier Finance

> **New in v3.0.** v2.4 covered supplier payouts only under §5.5.10. This section carries the requirements for payout runs, statements, and dispute handling into the admin side.

**FR-5.18.1 — Payout run.** A payout run selects a period and supplier set, computes each payout per FR-5.5.40, previews totals, and is approved by two people (FR-5.16.55) before any funds move.

**FR-5.18.2 — Payout statement.** Each payout carries a statement of gross bookings, commission retained, adjustments, net payout, and destination. The FX buffer is never deducted from supplier payouts (FR-5.5.40).

**FR-5.18.3 — Bank account verification.** A new supplier's bank details are verified with a small transfer before their first payout. Unverified accounts are held out of the payout run.

**FR-5.18.4 — Failed payout.** If a transfer fails, the run row is marked failed, funds return to the suspense account, the supplier is notified by WhatsApp within 24h, and the failure is attributed to a root cause.

**FR-5.18.5 — Disputes.** Supplier payout disputes are Finance Ops tickets with evidence, resolution path, and signed outcome. A dispute pausing a payout does not block other suppliers in the same run.

**FR-5.18.6 — Supplier finance view.** Suppliers see payout history, upcoming payout, statement PDFs, and the trust-score impact of their cancellation rate (FR-5.5.45).

---

# §5.19 Ticketing & Fulfilment

> **New in v3.0.** v2.4 referenced ticketing states (pending → ticketed) in §9.1 and had a `booking_items.item_supplier_type` that implied flights, but never specified what happens between payment and a ticket.

**FR-5.19.1 — Vertical fulfilment modes.** Each vertical declares its fulfilment mode:

| Vertical | Mode | What the platform must produce |
|---|---|---|
| Flights (sourced) | Direct ticketing | PNR, e-ticket, ticketing deadline management |
| Hotels (owned + sourced) | Voucher | Confirmed booking, supplier voucher, no PNR |
| Tours / activities | Voucher / manifest | Confirmed departure, voucher, guest list |
| Transfers | Voucher | Confirmed pickup, driver assignment post-NDA |

**FR-5.19.2 — Flights: order creation.** After payment succeeds, the Booking Workflow (§9.1) creates a Duffel order with the quoted offer. The offer is re-validated at order time; a changed offer rejects the booking to `failed`, never silently re-prices.

**FR-5.19.3 — Flights: ticketing deadline.** Every flight offer has a ticketing deadline. If ticketing has not completed within `ticketing_deadline − 4h`, a P1 alert fires and the booking is moved to `on_hold` for manual review.

**FR-5.19.4 — Flights: PNR and e-ticket.** On ticket issuance, the PNR and e-ticket numbers are stored on the booking item, a voucher PDF is generated to R2, and the guest is notified (FR-5.7.4 template register `ars_booking_ticketing`).

**FR-5.19.5 — Hotels/tours: voucher.** The supplier's confirmation becomes the voucher reference. The platform does not issue a PNR. Supplier non-confirmation inside the SLA (FR-5.5.30) escalates to ArriveSuite ops.

**FR-5.19.6 — Void and exchange.** A flight ticket can be voided inside the airline's void window; an exchange produces a new ticket. Both operations record the financial outcome (fare difference, refund, fee) in the ledger. Exchanges enter a distinct workflow state `exchanging` and do not strand the guest.

**FR-5.19.7 — Fulfilled vs unfulfilled.** A booking is `fulfilled` when the guest has the voucher/ticket. A paid booking that cannot be fulfilled (provider failure, hotel no-show due to their error) refunds per §5.20 and records the root cause.

---

# §5.20 Cancellation & Refund Policy Engine

> **New in v3.0.** v2.4 priced refunds by "per the rate plan" without an engine. This is the seam where a cancellation becomes a financial decision.

**FR-5.20.1 — Policy library.** Rate plans carry one of the standard policies: `flexible` (cancel to 24h before, full refund), `moderate` (cancel to 5 days before, first-night forfeiture), `strict` (50% refund to 14 days before), `non_refundable`. Each maps to a cancellation-fee schedule at the rate-plan level.

**FR-5.20.2 — Refund computation.** Given a booking, a cancellation time, and the policy, the engine returns: the refund amount, the fee retained, the payout-side adjustment, and the guest-visible message. The computation is deterministic and testable.

**FR-5.20.3 — Three-way split.** A cancellation may refund the guest, adjust the supplier payout, and record the commission outcome. The three are computed together so the books balance (ledger entries, §6.6).

**FR-5.20.4 — Supplier-initiated cancellation.** Same policy surface, but the guest is offered rebooking or a full refund regardless of policy — ArriveSuite carries the reputational risk on owned inventory.

**FR-5.20.5 — Flight cancellations.** Cancellation follows the fare's rules. A non-refundable sourced fare refunds nothing to the guest and records the fee to the airline. The platform does not absorb sourced-inventory fare rules.

**FR-5.20.6 — Refund execution.** Successful payment → refund → reconcile. Refund processing time is shown to the guest. Refunds post to the original payment method only.

**FR-5.20.7 — No double refund.** A booking that has been refunded to the guest cannot also refund the same charge to the supplier balance. This is enforced by the policy engine, not by convention.

---

# §5.21 Deposits & Part-Payment

> **New in v3.0.** v2.4 never specified deposits. Domestic suppliers asked for them; v3.0 models the minimum.

**FR-5.21.1 — Deposit model.** A rate plan may require a deposit of a fixed amount or a percentage at booking. The remaining balance is a second `payment_intents` row with its own due date.

**FR-5.21.2 — Deposit capture.** The deposit is captured at booking. The balance cannot be collected before the booking is `confirmed`, and any attempt to do so is a bug.

**FR-5.21.3 — Balance collection.** The balance is collected by the guest on the link sent before arrival. If the balance is not collected by the due date, the booking moves to `on_hold` and then to `expired` after the policy window.

**FR-5.21.4 — Part-payment exposure.** If a guest pays a deposit and the supplier later fails to fulfil, the deposit is refunded in full before any supplier payout is released. The platform does not expose supplier failure to the guest on a partially-paid booking.

**FR-5.21.5 — Display.** Every price shown for a deposit-required product shows total, deposit due now, and balance due date. No "surprise" balance at check-in.

---

# §5.22 Chargebacks, Disputes & Float

> **New in v3.0.** v2.4 had a dispute ticket screen but no financial model for a chargeback.

**FR-5.22.1 — Chargeback intake.** The payment provider (DPO Pay or Paystack) notifies ArriveSuite of a disputed charge. The dispute becomes a ticket with the charge, the guest, the booking, the evidence available, and the deadline.

**FR-5.22.2 — Evidence pack.** For each dispute, the system assembles: booking details, voucher, proof of fulfilment, communication log, and the guest's IP/device records. The pack is exported for manual submission to the provider.

**FR-5.22.3 — Float management.** Expected chargeback liability is modelled as a percentage of GMV (starting assumption 0.5%, §19.5). Funds are held back from payouts proportionally until the chargeback clears or is lost.

**FR-5.22.4 — Lost chargeback.** A lost chargeback is a P&L event: it claws back commission and absorbs the fee. It also feeds the FX buffer P&L line (§19.5) but never hits the supplier payout formula (FR-5.5.40).

**FR-5.22.5 — Dispute analytics.** Chargeback rate per supplier, per vertical, and per payment method is reported to Supplier Ops and to the Finance dashboard. A supplier with a repeated chargeback pattern is reviewed.

---

# §5.23 Availability & Inventory Integrity

> **New in v3.0.** v2.4's availability model was a counter, with "last-write-wins" on conflict — a guarantee of overbookings. This section replaces that.

**FR-5.23.1 — Availability as a row-locked resource.** Every unit of availability is a row in `availability_calendar` with `available_units`, `booked_units`, `blocked_units`. The check for `available_units − booked_units > 0` and the decrement on booking are performed in a single transaction with a row-level lock.

**FR-5.23.2 — No silent last-write-wins.** v2.4 FR-5.5.21's "last-write-wins with audit trail" is withdrawn. Two writes that would conflict return an explicit error to the second writer, naming the date and the current count. The writer must reconcile consciously.

**FR-5.23.3 — Held units.** Walk-ins and holds sit in `blocked_units` with a reason. When availability is set via WhatsApp (FR-5.4.9), the echoed impact line counts blocked-but-live units so the supplier sees the consequence.

**FR-5.23.4 — Atomic range changes.** Setting availability for a date range is all-or-nothing (FR-5.4.13). A range write that conflicts with a booking on any date fails the whole range and lists the conflicting dates.

**FR-5.23.5 — Inventory freshness.** Sourced-inventory availability is a cache; the live provider is the authority. On any mismatch at checkout (FR-5.15.52), the live result wins and the supplier is blamed nowhere.

**FR-5.23.6 — Stale inventory.** 30-day no-update auto-disable (FR-5.5.49) applies to the availability feed, not just the photo feed.

---

# §5.24 Owned ↔ Sourced Dedupe & Consolidation

> **New in v3.0.** v2.4 had "same property detected across sources" in §4.7 but no algorithm or authority.

**FR-5.24.1 — External property map.** `external_property_map` is the manually curated, authoritative map between a sourced-inventory hotel identifier and an owned property. Content Ops maintains it. It is a relational mapping, not a search result.

**FR-5.24.2 — Resolution rule.** When a guest search would surface the same physical property twice, the owned version wins and the sourced version is suppressed if it maps to the same property. The sourced version is still shown when it is materially cheaper or has availability the owned property does not, but always labelled "Partner availability".

**FR-5.24.3 — No silent duplication.** A property must not appear twice in the same search results. If the map is missing for a property, the merge step surfaces a review queue to Content Ops rather than shipping duplicates.

**FR-5.24.4 — Consolidation is post-MVP.** Multi-supplier and consolidation-layer inventory is not in the 10-week MVP. The mapping model exists so that consolidation can be added without reworking the dedupe rule.

---

# §5.25 Supplier Extranet Detail

> Extends §5.5 with buildable detail for the Phase 2 extranet. MICE venues/RFQ enter MVP scope here (§20); car rental and transfers stay out (§18.2).

## 5.25.1 Onboarding and accounts

**FR-5.25.1 — Self-registration then approval.** A supplier self-registers; nothing goes live until DMC staff approve. States: `prospect` → `pending` (docs submitted) → `active`, with `suspended`/`archived` terminal-side states.

**FR-5.25.2 — Licence and contract gate.** Approval requires business registration, BTO licence documents (verified manually, §19.2), and signed contract + commission terms. Documents stored as media references, never inline blobs.

**FR-5.25.3 — Multi-user roles.** One supplier account holds users with roles `owner`, `front_desk`, `finance`. All rows are per-supplier isolated (§6.12); a user sees only their supplier's data.

**FR-5.25.4 — Profile completeness.** Profile holds photos, policies, cancellation terms and child terms (bands configurable per property, never hardcoded). Incomplete profiles cannot be activated.

**FR-5.25.31 — Property policies.** Each property carries structured policies: cancellation terms reference, child terms, pet/smoking/quiet-house rules, check-in/out times, and self-declared star rating. Rate plans carry one policy-library entry (FR-5.20.1) plus a refundable flag; the property types are hotel | lodge | guesthouse | inn | motel | bnb | camp | villa | self-catering.

**FR-5.25.32 — No-show charges.** Supplier no-show marking (FR-5.5.31) charges per the booked rate plan's policy. The fee is recorded on the audit trail with the marking; ledger posting of `no_show_fee` lines (FR-5.14.39) follows the fee-policy decision — never an informal adjustment.

**FR-5.25.5 — Terms acceptance record.** T&C and commission-schedule acceptance is a timestamped, versioned row — not a checkbox that vanishes.

## 5.25.2 Inventory models

**FR-5.25.6 — Accommodation hierarchy.** Property → room types or units → rate plans. Pricing in BWP by season, occupancy and meal plan. Minimum stay, closed-to-arrival and allotments per rate plan. Self-catering prices per whole unit, not per person.

**FR-5.25.7 — Tour builder.** Suppliers build products directly: day-by-day itinerary, inclusions, group size limits, pricing tiers. Departures are fixed-schedule or on-request with per-departure capacity, cut-off times, and guide/vehicle resource tracking.

**FR-5.25.8 — MICE venues.** Venues and spaces with capacity by layout (theatre, boardroom, banquet). Half-day and full-day rates, catering and AV add-ons. Standalone venues (gardens, conference centres) and venues attached to properties are both supported.

**FR-5.25.9 — Holds, options and RFQ inbox.** Date holds and options with expiry. Corporate requests run an RFQ inbox on the three-quote model: request → up to three supplier quotes → accept/decline with deadlines.

**FR-5.25.10 — Events later.** Events follow the same listing → availability → booking flows after the core types. Visa is out of the extranet entirely (D21): no visa tables, no passport-data handling.

**FR-5.25.30 — Activities model.** Suppliers list activities (mokoro trips, game drives, boat cruises, guided walks): description, duration, meeting point, group size limits, guide and equipment requirements, and pricing tiers. Activities run on scheduled instances with per-instance capacity and cut-off times, using the same hold → atomic-confirm flow as tour departures (FR-5.25.7, FR-5.25.12–13).

**FR-5.25.29 — Places and destinations.** Suppliers list local places and destinations (attractions, landmarks, villages): name, geography, description, media, and links to related tours. Distinct from §6.8 reference geo, which stays platform-curated; supplier listings are attributed and trust-scored like any owned inventory.

## 5.25.3 Availability and double-booking prevention

**FR-5.25.11 — One availability ledger.** Engine allocations, walk-in, phone, manual entries and calendar syncs all write to a single ledger. No parallel truth.

**FR-5.25.12 — Temporary holds with expiry.** Checkout takes a hold with a TTL; confirmation is atomic (hold → booking in one transaction). Expired holds release automatically.

**FR-5.25.13 — Database-level enforcement.** Unit-level inventory uses Postgres exclusion constraints on date ranges; allotment-style inventory (tour seats) uses row-locked counters (§5.23.4 pattern). Application checks alone are insufficient.

**FR-5.25.14 — Manual blocks and no overbooking.** Maintenance and owner-use blocks are first-class ledger entries. Overbooking is off by default and requires explicit per-product opt-in with an audit trail.

**FR-5.25.15 — Change audit.** Every availability change records who, what, and from which channel in `audit_events`.

## 5.25.4 Day-to-day operations

**FR-5.25.16 — Manual reservations.** Staff create, modify and cancel walk-in and phone reservations through the same booking envelope as online sales.

**FR-5.25.17 — Calendar views.** Tape chart for rooms, departure calendar for tours, venue diary for MICE — all reading the §5.25.3 ledger, never separate state.

**FR-5.25.18 — Guest records and tender types.** Guest records, notes, deposits and payments received by cash, EFT or Paystack link. Cash/EFT are tender types on the payment record, not provider transactions.

**FR-5.25.19 — Documents and lists.** Confirmations, invoices, receipts, and arrivals/departures lists generate from booking state. No print-button workarounds: the PDF voucher is the print path.

## 5.25.5 Engine integration

**FR-5.25.20 — Canonical-first adapters.** Each supplier maps into the canonical product schema. Per-supplier adapter code exists only where the canonical mapping cannot express the supplier's feed.

**FR-5.25.21 — BWP, no FX, snapshotted.** Rates stay in BWP with no FX conversion. Prices and rates snapshot at booking time; refunds price from the snapshot, never current rates.

**FR-5.25.22 — Push inventory, pull bookings.** The engine pushes inventory and rates and pulls bookings. Products are instant-confirm or on-request with a supplier acceptance deadline.

**FR-5.25.23 — Visible sync health.** Sync status and error log per supplier, reusing §6.7 health-check and payload tables. Failed pushes are retryable from the extranet.

## 5.25.6 Finance

**FR-5.25.24 — Commission or net-rate configuration.** Per-supplier commission or net-rate terms with the markup layer applied deterministically; every rule that fired is recorded on the pricing snapshot.

**FR-5.25.25 — Statements and reconciliation.** Supplier statements and payout reconciliation against `payout_runs`; VAT and levies shown consistently as inclusive or exclusive per rule, never mixed silently.

## 5.25.7 Cross-cutting adds

**FR-5.25.26 — Idempotency on every extranet write.** Manual reservations, blocks, rate changes and RFQ responses all carry idempotency keys; replays return the original.

**FR-5.25.27 — Snapshots are immutable and refund-priced.** Pricing snapshots are never mutated; refunds and re-quotes read the snapshot taken at booking time.

**FR-5.25.28 — Trust and change propagation.** Profile or inventory changes that affect trust recompute the trust score and emit owner-update webhooks; supplier-affecting events also notify the #supply channel.

---

# §9.1 Booking State Machine

> **New in v3.0.** v2.4 had workflow tables and referenced "§9.1/§9.2" but never defined them. This is the explicit replacement for the generic workflow engine (ADR-0020).

## 9.1.1 States

| State | Meaning |
|---|---|
| `draft` | Quote issued; guest not yet committed |
| `pending_payment` | Booking created; awaiting payment |
| `confirmed` | Payment captured; awaiting supplier/fulfilment |
| `on_hold` | Manual review required |
| `ticketing` | Paid; flight ticketing in progress |
| `ticketed` | Ticket issued |
| `exchanging` | Flight exchange in flight |
| `fulfilled` | Guest has the voucher/ticket |
| `cancelled` | Cancelled before fulfilment |
| `refunded` | Refund processed |
| `expired` | Quote or balance window lapsed |
| `no_show` | Guest did not arrive |
| `failed` | Payment or fulfilment failed |

## 9.1.2 Transitions

```
draft → pending_payment (guest commits)
pending_payment → confirmed (payment captured)
pending_payment → failed (payment failed)
pending_payment → expired (window lapsed)
confirmed → ticketing (flight)
confirmed → fulfilled (hotel/tour instant confirm)
confirmed → on_hold (SLA breach / dispute)
confirmed → cancelled (guest or supplier cancel)
ticketing → ticketed (ticket issued)
ticketing → failed (provider error)
ticketed → exchanging (exchange requested)
exchanging → ticketed (exchange complete)
fulfilled → cancelled (late cancel with refund per policy)
cancelled → refunded (refund processed)
on_hold → confirmed | cancelled | expired
```

## 9.1.3 Invariants

**FR-9.1.1 — A confirmed booking is never silently re-priced.** Price changes require a new quote and explicit guest acceptance.

**FR-9.1.2 — Every transition emits an event** into the workflow event log and posts a ledger entry where money moved.

**FR-9.1.3 — Idempotency.** A retried transition does not double-apply. The workflow state and the ledger post atomically.

**FR-9.1.4 — No illegal transitions.** The transition table is executed in code, not in a configuration file (ADR-0020). Adding a state requires a migration + code change.

---

# §9.2 Fulfilment State Machine (per vertical)

> **New in v3.0.** A booking header is one state machine; its line items have their own fulfilment state.

| Vertical | State machine |
|---|---|
| Flight | `order_created → ticketed / voided / exchanged` |
| Hotel | `voucher_issued → arrived / no_show / cancelled` |
| Tour | `departure_confirmed → departed / cancelled` |
| Transfer | `dispatched → picked_up / no_show / cancelled` |

**FR-9.2.1 — Line-item state and booking state stay in sync.** Cancelling a line item recalculates the booking header state. Cancelling the last active line item cancels the booking.

**FR-9.2.2 — The booking is not fulfilled until every line item is fulfilled.** A partial fulfilment is visible to the guest and to ops.

---

## Traceability note for §9

§9.1 and §9.2 replace the v2.4 generic workflow engine tables (`workflow_definitions`, `workflow_instances`, `workflow_events`, `workflow_tasks`). The events those tables captured are now the explicit booking events in the `audit_events` and workflow-event stores, and the transitions are code (ADR-0020).
