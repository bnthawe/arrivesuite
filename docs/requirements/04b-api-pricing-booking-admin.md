\# §5.13 API \& Contract Management



\## 5.13.1 Purpose



ArriveSuite connects to external suppliers, payment providers, notification channels, and other services through APIs. This section defines how those connections are registered, credentialed, monitored, rotated, and controlled.



The core design principle is \*\*per-API contract isolation\*\*: each API integration is a first-class entity with its own credentials, health, failover, commercial terms, and lifecycle — not a property hanging off a supplier record.



\## 5.13.2 Domain Model



\*\*FR-13.1 — Per-API contract isolation\*\*



Every API integration is represented as an `integration\_contract` — a single, independent entity. A single provider (e.g., Amadeus) may have multiple contracts (Amadeus Flights, Amadeus Hotels), each with its own:



\- Credentials (never shared across contracts)

\- Environment scope (sandbox or production)

\- Health status and metrics

\- Failover priority and target

\- Commercial terms (FX buffer, markup model, rate limits)

\- Contract ID and audit history



\*\*FR-13.2 — Contract identity\*\*



Every contract has:



\- A globally unique \*\*Contract ID\*\* (format: `{PROVIDER}-{VERTICAL}-{REGION}-{NNN}`)

\- A human-readable \*\*API Name\*\* (editable)

\- A locked \*\*Parent Supplier\*\* (set at creation, cannot be re-parented)

\- A \*\*vertical\*\* (flights, hotel, tours, packages, activities, events, mice, visa, insurance)

\- An \*\*environment\*\* (sandbox | production)

\- A \*\*status\*\* (live | throttled | pending\_owner | enquiry | disabled)



\*\*FR-13.3 — Locked parent supplier\*\*



Once a contract is created, its parent supplier cannot be changed by any user. Changing the parent requires creating a new contract and migrating bookings manually.



\## 5.13.3 Credentials \& Environment



\*\*FR-13.4 — Environment-aware credential storage\*\*



Credentials are stored per environment. A contract's sandbox credentials and production credentials are separate records.



\*\*FR-13.5 — Encrypted at rest\*\*



All credentials are encrypted with AES-256-GCM using envelope encryption via a KMS-managed key.



\*\*FR-13.6 — Masked by default\*\*



Credentials are displayed masked (`••••-••••-••••-82f3`) by default. The last 4 characters are shown for identification only.



\*\*FR-13.7 — Reveal ceremony\*\*



To reveal a full credential, the operator must:



1\. Be authenticated as \*\*Super Admin\*\*

2\. Re-authenticate with password + 2FA

3\. Confirm the reveal action in a dialog with reason

4\. Complete the reveal



The revealed value is displayed for \*\*30 seconds maximum\*\*, then automatically re-masked.



\*\*FR-13.8 — Every reveal is audited\*\*



Every reveal — including copy-to-clipboard — writes an immutable `audit\_events` row.



\*\*FR-13.9 — Copy is a reveal\*\*



Copy-to-clipboard is treated identically to reveal.



\## 5.13.4 Rotation Workflow



\*\*FR-13.10 — Rotation is a ceremony, not a button\*\*



Rotating a credential is a multi-step workflow:



1\. \*\*Request\*\* — authorized operator initiates with a reason

2\. \*\*Approve\*\* — a second Super Admin approves (two-person rule)

3\. \*\*Provision\*\* — operator updates credential in provider's dashboard, then pastes new one

4\. \*\*Validate\*\* — ArriveSuite validates format and calls safe test endpoint

5\. \*\*Activate with grace period\*\* — new credential becomes primary. Old remains valid for 7 days.

6\. \*\*Revoke\*\* — after grace period, old credential automatically revoked



\*\*FR-13.11 — Rotation reasons\*\*



\- `scheduled` — routine 90-day rotation

\- `suspected\_compromise` — credential may have leaked

\- `provider\_request` — provider mandated rotation

\- `compliance` — regulatory requirement

\- `other` — free-text



\*\*FR-13.12 — Rotation reminders\*\*



Reminders at 14, 7, 1, and 0 days before expiry.



\*\*FR-13.13 — Validation failure handling\*\*



Failed validation aborts the rotation. Old credential remains active.



\*\*FR-13.14 — Rotation audit trail\*\*



Every step writes an immutable `audit\_events` row.



\## 5.13.5 Health Monitoring



\*\*FR-13.15 — Continuous health checks\*\*



Each contract is health-checked every 30 seconds.



\*\*FR-13.16 — Health status levels\*\*



\- `healthy` — last check passed

\- `degraded` — passed with elevated latency

\- `down` — last N checks failed

\- `disabled` — manually disabled



\*\*FR-13.17 — Health timeline\*\*



24-hour and 7-day health timeline with sparkline.



\*\*FR-13.18 — Test Connection action\*\*



Manual test with detailed result.



\*\*FR-13.19 — Last-tested badge\*\*



Detail header shows most recent test result.



\*\*FR-13.20 — Webhook health\*\*



Contracts with webhooks track last received, signature status, recent failures, retry queue.



\## 5.13.6 Kill Switch



\*\*FR-13.21 — Granular disable scopes\*\*



\- `outbound\_calls` — stop sending requests

\- `inbound\_webhooks` — reject webhooks

\- `search\_visibility` — hide products from search

\- `new\_bookings` — prevent new bookings

\- `refunds` — block refunds



\*\*FR-13.22 — Disable confirmation\*\*



Requires scopes selection, reason (min 20 chars), impact summary, confirmation.



\*\*FR-13.23 — Disabled banner\*\*



Prominent banner while any scope is disabled.



\*\*FR-13.24 — Auto-disable conditions\*\*



\- Health below threshold for 15 minutes

\- Trust score below 80% (extranet)

\- No owner update for 30 days (extranet)

\- Failed webhook signature verification × 10 in 24h



\*\*FR-13.25 — Kill switch urgency\*\*



Reachable in 2 clicks or fewer, executes in under 5 seconds.



\## 5.13.7 Failover \& Routing



\*\*FR-13.26 — Failover priority\*\*



\- `P1` — critical, automatic failover

\- `P2` — important, manual failover acceptable

\- `P3` — best-effort, no failover required



\*\*FR-13.27 — Failover target\*\*



P1 and P2 contracts must declare a failover target.



\*\*FR-13.28 — Failover execution\*\*



Automatic failover when P1 unavailable for 60 seconds.



\*\*FR-13.29 — Failover test mode\*\*



Manual sample-traffic test.



\## 5.13.8 Caching \& Rate Limits



\*\*FR-13.30 — Tiered cache configuration\*\*



\- Static CDN — 7 days default

\- Redis rate — 15 minutes default

\- Prefetch — configurable



\*\*FR-13.31 — Rate limit tracking\*\*



Configured limit, peak usage, utilization, 429 responses.



\*\*FR-13.32 — Rate limit alerts\*\*



80% for 5 min → alert. 95% → P1.



\*\*FR-13.33 — Prefetch rules\*\*



Route patterns, frequency, time windows.



\## 5.13.9 Commercial Terms



\*\*FR-13.34 — FX buffer\*\*



Per-contract override of platform-wide buffer (default 1.5%).



\*\*FR-13.35 — Markup model\*\*



Base cost model (published | net | BAR) plus per-channel markup overrides.



\*\*FR-13.36 — Base cost model\*\*



Declares which base cost model applies.



\*\*FR-13.37 — Cost tracking\*\*



For paid APIs: transactions, spend, cost per txn, budget cap.



\*\*FR-13.38 — Cost alerts\*\*



80% of cap → alert. 100% → P1.



\## 5.13.10 Extranet Contract Variant



\*\*FR-13.39 — Extranet-specific fields\*\*



Contracts of type `extranet-lodge` don't use API credentials. Instead:



\- Owner name, phone, email

\- Authentication method (phone OTP | WhatsApp | portal password)

\- Property scope

\- Allotment model

\- Housekeeping sync

\- Offline queue status

\- Trust score and last owner update



\*\*FR-13.40 — Extranet trust score\*\*



Computed from responsiveness, cancellation rate, guest rating, inventory freshness, compliance.



\*\*FR-13.41 — Extranet auto-disable\*\*



30 days without update triggers auto-disable with WhatsApp + email notice at 25 and 29 days.



\## 5.13.11 Bulk Operations



\*\*FR-13.42 — Bulk test connection\*\*



Select multiple, test, view results.



\*\*FR-13.43 — Bulk rotation request\*\*



Request rotation for all contracts of a supplier.



\*\*FR-13.44 — Bulk export\*\*



Filtered list to CSV or JSON.



\*\*FR-13.45 — Bulk disable\*\*



Multiple contracts disabled in one action with aggregate impact.



\## 5.13.12 Permissions



\*\*FR-13.46 — Role-based access\*\*



| Action | Supplier Ops | Finance Ops | Super Admin |

|---|---|---|---|

| View contract list | No | Yes (payments only) | Yes |

| Reveal credential | No | No | Yes |

| Copy credential | No | No | Yes |

| Request rotation | No | Yes (payments only) | Yes |

| Approve rotation | No | No | Yes |

| Test connection | No | Yes | Yes |

| Disable contract | No | Yes (payments only) | Yes |

| Re-enable contract | No | No | Yes |

| Add new contract | No | No | Yes |

| Delete contract | No | No | No |



\*\*FR-13.47 — Two-person rule enforcement\*\*



Requester ≠ approver. At least one Super Admin must exist.



\*\*FR-13.48 — No deletion\*\*



Contracts are disabled, never deleted.



\## 5.13.13 Audit \& Compliance



\*\*FR-13.49 — Every action is audited\*\*



\*\*FR-13.50 — Retained indefinitely\*\*



\*\*FR-13.51 — Exportable for audits\*\*



CSV or PDF with signed hash.



\## 5.13.14 Contract Diff Viewer



\*\*FR-13.52 — Change history\*\*



Every contract detail has a Change History tab.



\*\*FR-13.53 — Diff format\*\*



GitHub-style with credential changes as `\[REDACTED]`.



\## 5.13.15 Data Model



\*\*FR-13.54 — New tables\*\*



The following tables are added:



\- `integration\_contracts`

\- `integration\_credentials`

\- `integration\_rotation\_requests`

\- `integration\_health\_checks`

\- `integration\_webhooks`

\- `integration\_costs`



(Full column definitions in §6 Data Architecture.)



\*\*FR-13.55 — Migrations\*\*



`integration\_providers` retained as registry; credentials scoped per contract.



\*\*FR-13.56 — Indexes\*\*



\- `integration\_contracts(contract\_ref)` unique

\- `integration\_contracts(provider\_id)`

\- `integration\_contracts(status)`

\- `integration\_credentials(contract\_id, environment, status)`

\- `integration\_health\_checks(contract\_id, checked\_at DESC)`



\## 5.13.16 UI Requirements



\*\*FR-13.57 — Index screen\*\*



Search, filters, grouping by parent supplier, columns, row actions, bulk actions, footer.



\*\*FR-13.58 — Detail screen layout\*\*



Header, environment toggle, Test Connection, Save, Core Identity, Key Vault, Markup \& Tax, Policies, Availability \& Sync, Mid-Back Office, Audit \& Safety.



\*\*FR-13.59 — Rotation workflow screens\*\*



Request, Approve, Paste new key, Validate \& activate, Grace period dashboard.



\*\*FR-13.60 — Disable dialog\*\*



Scoped checkboxes, reason (min 20 chars), impact summary, confirmation.



\*\*FR-13.61 — Webhook health panel\*\*



Last received, signature status, recent table, retry queue, manual retry.



\*\*FR-13.62 — Cost dashboard\*\*



Monthly spend, transaction count, cost per transaction, budget cap utilization.



\*\*FR-13.63 — Change history tab\*\*



Diff viewer filtered by actor, field, or date.



\## 5.13.17 Operational Runbooks



\*\*FR-13.64 — Rotation runbook\*\*



`/docs/runbooks/rotation.md`



\*\*FR-13.65 — Incident runbook\*\*



`/docs/runbooks/incident.md`



\*\*FR-13.66 — Compromise runbook\*\*



`/docs/runbooks/compromise.md`



\## 5.13.18 Alerts



\*\*FR-13.67 — Alert destinations\*\*



P1: Slack + SMS + email. P2: Slack + email. P3: Slack.



\*\*FR-13.68 — Alert triggers\*\*



| Trigger | Severity |

|---|---|

| Health down for 60s | P1 |

| Health degraded for 15m | P2 |

| Rate limit > 95% for 5m | P1 |

| Rate limit > 80% for 15m | P2 |

| Cost > 100% of cap | P1 |

| Cost > 80% of cap | P2 |

| Rotation overdue by 7 days | P2 |

| Failed rotation validation | P2 |

| Webhook signature failure × 10 in 24h | P1 |

| Trust score < 80% (extranet) | P2 |

| Auto-disable triggered | P1 |

| Failover executed | P1 |



\*\*FR-13.69 — Alert suppression\*\*



During planned maintenance windows.



\## 5.13.19 Performance Requirements



\*\*FR-13.70 — Index screen load\*\*



Under 800ms (P95) with 200 contracts.



\*\*FR-13.71 — Detail screen load\*\*



Under 1s (P95).



\*\*FR-13.72 — Test Connection latency\*\*



Under 10s (P95).



\*\*FR-13.73 — Disable latency\*\*



Under 5s (P99).



\*\*FR-13.74 — Health check frequency\*\*



30s continuous, up to 200 contracts at 100 QPS.



\## 5.13.20 Acceptance Criteria



Phase 6 is complete when:



\- \[ ] Contracts creatable, editable, searchable

\- \[ ] Credentials encrypted at rest, masked by default

\- \[ ] Reveal requires re-auth and writes audit events

\- \[ ] Rotation is multi-step with two-person approval

\- \[ ] Rotation reminders fire at 14/7/1/0 days

\- \[ ] Health checks run continuously

\- \[ ] Test Connection returns detailed results

\- \[ ] Webhook health tracked per contract

\- \[ ] Disable is scoped with mandatory reason

\- \[ ] Failover configurable and executable

\- \[ ] Bulk operations work

\- \[ ] RBAC enforces the permission matrix

\- \[ ] Audit logs immutable and exportable

\- \[ ] Alerts route correctly by severity

\- \[ ] Runbooks published

\- \[ ] Performance targets met



\---



\# §5.14 Pricing \& Tax Engine



\## 5.14.1 Purpose



The Pricing Engine is the single source of truth for how much anything costs in ArriveSuite. Every price shown to any user is computed by this engine from a base cost plus a deterministic set of rules, FX conversion, tax application, fee inclusion, and discount.



\*\*Design principles:\*\*



1\. \*\*One engine, many channels.\*\* B2C, B2B, corporate, admin share the same rule set.

2\. \*\*Deterministic.\*\* Same inputs + same version = same output.

3\. \*\*Immutable snapshots.\*\* Booking prices are frozen.

4\. \*\*Versioned.\*\* Rules are versioned; every booking references a version.

5\. \*\*Explainable.\*\* Every price can be broken down into constituent rules.



\## 5.14.2 Inputs and Outputs



\*\*FR-14.1 — Pricing inputs\*\*



| Input | Type |

|---|---|

| contract\_id | UUID |

| product\_ref | String |

| inventory\_source | owned / sourced / consolidated |

| check\_in | Date |

| check\_out | Date |

| nights | Integer |

| pax | { adults, children, infants, seniors } |

| channel | b2c / b2b / corporate / admin |

| market | BW / SADC / US / EU / other |

| agency\_id | UUID (nullable) |

| corporate\_id | UUID (nullable) |

| display\_currency | BWP / USD / ZAR / EUR |

| user\_id | UUID (nullable) |

| is\_new\_booking | Boolean |

| is\_modification | Boolean |

| is\_group | Boolean |



\*\*FR-14.2 — Pricing outputs\*\*



Returns base cost, FX rate + buffer, markup lines, subtotal, tax lines, total tax, fee lines, total fees, discount lines, total discount, final total, display currency info, pricing version, rules applied, computed\_at.



\*\*FR-14.3 — Immutability of output\*\*



Frozen into `pricing\_snapshots` at booking time.



\*\*FR-14.4 — Snapshot integrity\*\*



Snapshots cannot be edited or deleted.



\## 5.14.4 Rule Model



\*\*FR-14.5 — Rule types\*\*



\- `percentage` — N% of subtotal

\- `fixed` — fixed amount

\- `tiered` — different % by threshold

\- `rule\_based` — conditional logic

\- `caps\_floor` — min/max amounts

\- `pass\_through` — copy provider amount



\*\*FR-14.6 — Rule scope\*\*



\- `global`, `channel`, `market`, `agency`, `corporate`, `contract`, `product\_type`, `date\_range`, `currency`, `inventory\_class`



\*\*FR-14.7 — Rule priority\*\*



Lower numbers applied first. Later rules override earlier.



\*\*FR-14.8 — Rule resolution order\*\*



Collect matches → filter active → sort by priority → apply → track effective value → detect conflicts.



\*\*FR-14.9 — Conflict detection\*\*



Same-priority, same-field conflicts error out.



\*\*FR-14.10 — Rule versioning\*\*



Versions are immutable once active.



\*\*FR-14.11 — Version activation\*\*



Dry-run comparison → two-person approval if >10% products affected → effective date → audit.



\*\*FR-14.12 — Version immutability\*\*



Active versions cannot be edited.



\*\*FR-14.13 — Version rollback\*\*



Rollback requires reason + two-person approval + audit.



\## 5.14.5 Tax Model



\*\*FR-14.14 — Tax rules are country-scoped\*\*



\*\*FR-14.15 — Botswana tax rules (initial)\*\*



| Tax | Rate | Applies To | Inclusive |

|---|---|---|---|

| VAT | 14% | Accommodation, tours | No |

| VAT | 0% | International flights | — |

| Tourism Levy | TBD | Accommodation, tours | No |

| WHT | 10% | Corporate B2B cross-border | — |

| Airport Tax | Fixed | Flight bookings | Yes |

| Fuel Surcharge | Variable | Flights | Yes |



\*\*FR-14.16 — Tax applicability\*\*



Country, tax type, rate in bps, product types, channels, inclusive/exclusive, pass-through.



\*\*FR-14.17 — Tax calculation\*\*



Taxes on subtotal after markup, before discounts.



\*\*FR-14.18 — Tax display\*\*



Include/exclude indicator, total, expandable, BURS VAT number.



\*\*FR-14.19 — Tax exemptions\*\*



Country-based, corporate-based, product-based.



\*\*FR-14.20 — Tax registration number\*\*



Stored in `platform\_settings`, displayed on invoices.



\*\*FR-14.21 — Tax filing data\*\*



Written to `tax\_filings`.



\*\*FR-14.22 — Tax rule changes\*\*



Require new version, dry-run, two-person approval, audit.



\## 5.14.6 FX Model



\*\*FR-14.23 — Base currency\*\*



BWP. All internal pricing in BWP minor units.



\*\*FR-14.24 — Supported display currencies\*\*



BWP, USD, ZAR, EUR.



\*\*FR-14.25 — Display currency conversion\*\*



Conversion for display only. Settlement in BWP.



\*\*FR-14.26 — FX rate sources\*\*



Bank of Botswana (primary), OpenExchangeRates (fallback). Refreshed hourly.



\*\*FR-14.27 — FX rate storage\*\*



Base, quote, rate in bps, source, fetched\_at.



\*\*FR-14.28 — FX buffer\*\*



Default 1.5% (150 bps). Per-contract override.



\*\*FR-14.29 — FX buffer resolution\*\*



Contract → channel → market → global default.



\*\*FR-14.30 — FX snapshot\*\*



Stored with booking. Never re-fetched.



\*\*FR-14.31 — Rate staleness\*\*



Warning at 24h, forced refresh.



\*\*FR-14.32 — Manual FX override\*\*



Super Admin only. Max 48 hours. Audit-logged.



\*\*FR-14.33 — Multi-currency B2B contracts\*\*



Non-BWP contracts supported.



\## 5.14.7 Rounding Model



\*\*FR-14.34 — Currency-specific rounding\*\*



BWP nearest 5. USD/ZAR/EUR nearest 1.



\*\*FR-14.35 — Rounding point\*\*



Applied at final total, not per line.



\*\*FR-14.36 — Rounding direction\*\*



nearest / up / down.



\*\*FR-14.37 — Rounding overrides\*\*



Per channel, market, or contract.



\*\*FR-14.38 — Rounding in pricing snapshots\*\*



Rule used stored in snapshot.



\## 5.14.8 Fees



\*\*FR-14.39 — Supported fee types\*\*



\- `platform\_service\_fee`

\- `payment\_processing\_fee`

\- `booking\_fee`

\- `cancellation\_fee`

\- `amendment\_fee`

\- `no\_show\_fee`



\*\*FR-14.40 — Fee absorption\*\*



absorbed / passed\_through / split.



\*\*FR-14.41 — Fee calculation\*\*



After markup and tax, before discounts.



\*\*FR-14.42 — Fee display\*\*



Separate line items to B2C and B2B.



\*\*FR-14.43 — Fee versioning\*\*



Versioned alongside markup and tax rules.



\## 5.14.9 Discounts



\*\*FR-14.44 — Supported discount types\*\*



\- `promo\_code`, `loyalty`, `volume`, `seasonal`, `referral`, `manual`



\*\*FR-14.45 — Discount ordering\*\*



After markup and fees, before tax.



\*\*FR-14.46 — Discount caps\*\*



cap\_cents, cap\_percentage\_bps, combined cap.



\*\*FR-14.47 — Discount stacking rules\*\*



stackable / exclusive / best\_of.



\*\*FR-14.48 — Promo code handling\*\*



Case-insensitive, redemption limits, date ranges, product/channel/market restrictions.



\*\*FR-14.49 — Loyalty points\*\*



Points-to-currency rate, min/max redemption.



\*\*FR-14.50 — Volume discounts\*\*



By pax, nights, booking value, group flag.



\*\*FR-14.51 — Manual discounts\*\*



Reason (min 20 chars), approval, audit.



\*\*FR-14.52 — Discount audit\*\*



Rule ID, amount, reason, applied\_by, timestamp.



\## 5.14.10 Channel-Specific Pricing



\*\*FR-14.53 — B2C pricing\*\*



Full retail, tax included, markup hidden.



\*\*FR-14.54 — B2B pricing\*\*



Net rate, markup, commission, tax breakdown, total.



\*\*FR-14.55 — Corporate pricing\*\*



Negotiated rate. Out-of-policy flagged.



\*\*FR-14.56 — Admin pricing\*\*



All layers visible.



\*\*FR-14.57 — Markup disclosure\*\*



Hidden from guests. Disclosed to agency (own bookings), corporate managers.



\*\*FR-14.58 — Multi-currency B2B\*\*



Quotes in requested currency.



\*\*FR-14.59 — Commission vs markup\*\*



Distinguished in B2B pricing.



\## 5.14.11 Data Model



\*\*FR-14.60 — New tables\*\*



\- `pricing\_rules`

\- `pricing\_rule\_scopes`

\- `pricing\_versions`

\- `tax\_rules`

\- `tax\_filings`

\- `currency\_rates`

\- `fx\_buffer\_overrides`

\- `rounding\_rules`

\- `fee\_rules`

\- `discount\_rules`

\- `discount\_redemptions`

\- `pricing\_snapshots`



\*\*FR-14.61 — Required indexes\*\*



\- `pricing\_rules(version\_id, is\_active)`

\- `pricing\_rule\_scopes(rule\_id, scope\_type, scope\_value)`

\- `pricing\_versions(effective\_from, is\_active)`

\- `tax\_rules(country\_code, tax\_type, is\_active)`

\- `currency\_rates(base\_currency, quote\_currency, fetched\_at DESC)`

\- `discount\_rules(promo\_code, is\_active)`

\- `pricing\_snapshots(booking\_id)`



\*\*FR-14.62 — Migration from previous draft\*\*



`pricing\_snapshots` replaced by expanded version.



\## 5.14.12 UI Requirements



\*\*FR-14.63 — Rule list\*\*



Priority, name, scope chips, value, toggle.



\*\*FR-14.64 — Scope matrix\*\*



Rules × channels × markets.



\*\*FR-14.65 — Live preview table\*\*



Final price per channel/market.



\*\*FR-14.66 — Tax rules panel\*\*



Name, rate, applies to, inclusive/exclusive, pass-through.



\*\*FR-14.67 — FX panel\*\*



Current rate, source, buffer, last-updated.



\*\*FR-14.68 — Rounding panel\*\*



Per currency with overrides.



\*\*FR-14.69 — Version indicator\*\*



Active version + effective date in header.



\*\*FR-14.70 — Scenario tester\*\*



Modal for arbitrary scenarios.



\*\*FR-14.71 — Version comparison\*\*



Side-by-side changes.



\*\*FR-14.72 — Conflict warnings\*\*



Conflicting rules highlighted.



\*\*FR-14.73 — Dry-run visualization\*\*



Sample size, price change distribution, volume, revenue impact.



\## 5.14.13 Performance



\*\*FR-14.74 — Single pricing latency\*\*



Under 50ms (P95) with 100 rules.



\*\*FR-14.75 — Bulk pricing latency\*\*



100 products under 500ms (P95).



\*\*FR-14.76 — Rule caching\*\*



Redis with invalidation on change.



\*\*FR-14.77 — Snapshot write latency\*\*



Under 100ms (P95).



\## 5.14.14 Testing



\*\*FR-14.78 — Unit tests\*\*



Every rule type.



\*\*FR-14.79 — Integration tests\*\*



Every pricing scenario.



\*\*FR-14.80 — Regression tests\*\*



Every version activation.



\*\*FR-14.81 — Property-based tests\*\*



Final total = subtotal + tax + fees − discounts. Tax = sum of tax lines.



\*\*FR-14.82 — Snapshot integrity tests\*\*



Cannot update, cannot delete.



\## 5.14.15 Observability



\*\*FR-14.83 — Metrics\*\*



\- `pricing.calculations.total`

\- `pricing.calculations.latency\_ms`

\- `pricing.rules.resolved`

\- `pricing.version.active`

\- `pricing.conflicts.detected`

\- `fx.rate.age\_seconds`

\- `fx.rate.staleness\_alert`



\*\*FR-14.84 — Alerts\*\*



| Trigger | Severity |

|---|---|

| FX rate older than 24h | P2 |

| Pricing latency > 100ms for 5 min | P1 |

| Rule conflict detected | P1 |

| Version activation without dry-run | P0 (block) |

| Snapshot write failure | P1 |

| Tax rate change without approval | P0 (block) |



\*\*FR-14.85 — Audit events\*\*



Every pricing-related action writes to `audit\_events`.



\## 5.14.16 Permissions



\*\*FR-14.86 — Role-based access\*\*



| Action | Finance Ops | Super Admin | Reservations |

|---|---|---|---|

| View pricing rules | Yes | Yes | Yes |

| Create pricing rule | No | Yes | No |

| Edit pricing rule | No | Yes | No |

| Activate pricing version | No | Yes | No |

| Rollback version | No | Yes | No |

| Manage tax rules | No | Yes | No |

| Override FX | No | Yes | No |

| Apply manual discount | Yes (threshold) | Yes | No |

| Apply above threshold | No | Yes | No |



\*\*FR-14.87 — Manual discount thresholds\*\*



Above P1,000 requires Super Admin.



\*\*FR-14.88 — Two-person rule\*\*



Version activation, tax rule changes, FX overrides.



\## 5.14.17 Acceptance Criteria



Phase 2 complete when:



\- \[ ] Rule types work

\- \[ ] Scope resolution works

\- \[ ] Priority ordering works

\- \[ ] Conflict detection works

\- \[ ] Version control works

\- \[ ] Tax rules computed

\- \[ ] FX model works

\- \[ ] Rounding works

\- \[ ] Fees and discounts work

\- \[ ] Channel pricing works

\- \[ ] Snapshots immutable

\- \[ ] Performance targets met

\- \[ ] Testing passes

\- \[ ] Observability wired



\## 5.14.18 Botswana-Specific Considerations



\*\*FR-14.89 — VAT registration\*\*



BURS VAT number required.



\*\*FR-14.90 — Tourism Levy\*\*



Confirm rate with BTO.



\*\*FR-14.91 — WHT rules\*\*



10% per BURS.



\*\*FR-14.92 — BWP rounding\*\*



Nearest 5.



\*\*FR-14.93 — Multi-currency B2B\*\*



Supported for international agencies.





\---



\# §5.15 B2C Booking Flow



\## 5.15.1 Purpose



This section defines the B2C guest-facing booking experience — from search to confirmation.



\*\*Core principle:\*\* transparency without fragility. Guests see how prices are composed, but pricing decisions are made server-side and signed. The client displays; it never determines.



\## 5.15.2 Search Interface



\*\*FR-15.1 — Search bar\*\*



Destination autocomplete, date range, pax composition, multi-city, vertical selector.



\*\*FR-15.2 — Destination autocomplete\*\*



`pg\_trgm` fuzzy matching, ranked by exact match, prefix match, popularity.



\*\*FR-15.3 — Multi-city input\*\*



Chip-based, keyboard-navigable.



\*\*FR-15.4 — Date range picker\*\*



Single date or range, prices per day where available, min stay enforced, past dates prevented, timezone-aware.



\*\*FR-15.5 — Passenger composition\*\*



Adults (12+), children (2–11) with individual age, infants (0–1), seniors where applicable.



\*\*FR-15.6 — Vertical selector\*\*



All enabled verticals. Disabled hidden, not shown.



\*\*FR-15.7 — Search submission\*\*



Server-side. No client filtering or ranking.



\*\*FR-15.8 — Search URL persistence\*\*



Reflected in URL for bookmarks, sharing, back button, refresh.



\## 5.15.3 Search Results



\*\*FR-15.9 — Result loading\*\*



Skeleton placeholders, progressive rendering, "searching" indicator.



\*\*FR-15.10 — Result cards\*\*



Image, name, type, location, rating, trust indicators, amenities, child policy badge, price (total + per-night), CTA.



\*\*FR-15.11 — Multi-supplier deduplication\*\*



One card per product. Supplier comparison affordance. Cheapest highlighted. Saving shown.



\*\*FR-15.12 — Supplier comparison\*\*



Source, base rate, retail rate, cancellation policy, confirmation time, guest rating, trust score.



\*\*FR-15.13 — Filters\*\*



Price, stops, airlines, property type, amenities, child policy, trust threshold, rating, cancellation policy.



\*\*FR-15.14 — Filter state persistence\*\*



Reflected in URL.



\*\*FR-15.15 — Mobile filters\*\*



Full-screen sheet with header, scrollable content, sticky footer.



\*\*FR-15.16 — Cache indicator chips\*\*



Static CDN TTL, Redis rate TTL, prefetch status, payload size.



\*\*FR-15.17 — Result sorting\*\*



Recommended, price low/high, rating, trust score.



\*\*FR-15.18 — Result pagination\*\*



20 per page default. Page numbers + "Load more".



\*\*FR-15.19 — Result empty state\*\*



Clear message, filter suggestions, "Clear all" button.



\*\*FR-15.20 — Result error state\*\*



Specific message, retry, alternative actions, Sentry report.



\## 5.15.4 Product Detail



\*\*FR-15.21 — Product detail page\*\*



Hero gallery, name/type/rating, location with map, description, amenities, room types or departures, availability calendar, reviews, policies, booking sidebar.



\*\*FR-15.22 — Room/departure selection\*\*



Selectable with name, description, capacity, rate plan, availability, price.



\*\*FR-15.23 — Availability display\*\*



For exact dates. Unavailable dates show alternatives or waitlist.



\*\*FR-15.24 — Price display on detail\*\*



Base price, total for dates, taxes/fees indicator, currency.



\*\*FR-15.25 — Price breakdown panel\*\*



Base cost, FX, market markup, channel markup, discounts, taxes, fees, final total, rounding.



\*\*FR-15.26 — Price audit trail\*\*



Drawer with engine version, quote timestamp, expiry, every rule applied, signature.



\*\*FR-15.27 — Price freshness\*\*



TTL 15 minutes. Re-fetch on expiry. Explicit acceptance if changed.



\## 5.15.5 Booking Flow



\*\*FR-15.28 — Multi-step checkout\*\*



Search → Results → Details → Guest info → Payment → Confirmation. Each step distinct URL.



\*\*FR-15.29 — State persistence\*\*



sessionStorage. Refresh preserves.



\*\*FR-15.30 — Guest information\*\*



Lead guest, additional guests, passport/ID, DOB, special requests, emergency contact.



\*\*FR-15.31 — Guest count validation\*\*



Against capacity, rate plan rules, airline rules, hotel rules. Specific error messages.



\*\*FR-15.32 — Payment method selection\*\*



Card (PayTabs), mobile money (Phase 2), bank transfer, wallet, pay later.



\*\*FR-15.33 — Payment confirmation\*\*



Explicit total acceptance, terms acceptance, OTP/2FA where required.



\*\*FR-15.34 — Idempotency\*\*



Client-generated UUID v4. Persisted in sessionStorage. Server deduplicates.



\*\*FR-15.35 — Booking reference\*\*



Format `ARS-YYYY-NNNNNN`. Displayed prominently. Copyable. QR code. In emails and vouchers.



\*\*FR-15.36 — Confirmation screen\*\*



Success, reference (copy + QR), product summary, total paid, supplier contact, voucher PDF, itinerary PDF, add to calendar, share option, post-booking state.



\*\*FR-15.37 — Honest state messaging\*\*



\- Instant confirmation: "Booking confirmed"

\- Ticketing pending: "Booking confirmed — ticket being issued"

\- On-request: "Booking submitted — awaiting supplier confirmation"

\- Never claim instant when it isn't



\## 5.15.6 Mobile Behavior



\*\*FR-15.38 — Mobile-first responsive design\*\*



Mobile 320–639px, tablet 640–1023px, desktop 1024px+.



\*\*FR-15.39 — Mobile navigation\*\*



Sticky header, bottom nav (Phase 2), full-screen sheets, swipe gestures for galleries.



\*\*FR-15.40 — Mobile checkout\*\*



Native input types, autofill, orientation change handled, soft keyboard friendly.



\*\*FR-15.41 — Mobile performance\*\*



Under 3s on 3G, under 100KB JS on critical path, offline-tolerant.



\## 5.15.7 Loading, Error, and Empty States



\*\*FR-15.42 — Loading states\*\*



Skeletons matching final layout. Inline spinners for actions. Progress indicators for batch.



\*\*FR-15.43 — Error states\*\*



Specific message, error code, suggested action, retry, Sentry report.



\*\*FR-15.44 — Error taxonomy\*\*



network, server, validation, business, provider, auth.



\*\*FR-15.45 — Empty states\*\*



Clear explanation, suggested action, quick action button.



\*\*FR-15.46 — Offline state\*\*



Offline indicator, queued non-critical actions, blocked critical with message.



\## 5.15.8 Signed Quotes



\*\*FR-15.47 — Server-side pricing\*\*



All pricing computed server-side. Client never computes.



\*\*FR-15.48 — Quote endpoint\*\*

POST /api/v1/pricing/quote

body: { product\_ref, contract\_id, dates, pax, extras, display\_currency }

returns: { quote\_id, base\_cost\_cents, fx\_rate\_bps, ..., signature, expires\_at }





\*\*FR-15.49 — Batch quote endpoint\*\*

POST /api/v1/pricing/batch

body: { product\_refs, dates, pax, display\_currency }

returns: { quotes: Quote\[] }





Under 500ms (P95) for 100 products.



\*\*FR-15.50 — Quote signature\*\*



HMAC signed. Covers quote\_id, total, version, expires\_at.



\*\*FR-15.51 — Quote expiry\*\*



15 minutes. Enforced server-side.



\*\*FR-15.52 — Quote re-verification\*\*



Server re-runs pricing on booking. Mismatch rejects.



\*\*FR-15.53 — Quote audit\*\*



Stored in `pricing\_quotes`. Retained 90 days.



\## 5.15.9 Accessibility



\*\*FR-15.54 — WCAG 2.1 AA compliance\*\*



Contrast ≥ 4.5:1, keyboard-accessible, focus visible, ARIA labels, semantic HTML, skip links.



\*\*FR-15.55 — Keyboard navigation\*\*



Tab, Shift+Tab, Enter, Escape, arrow keys, focus trapped in modals.



\*\*FR-15.56 — Screen reader support\*\*



Alt text, aria-live regions, form errors announced, status messages announced.



\*\*FR-15.57 — Reduced motion\*\*



`prefers-reduced-motion` respected.



\*\*FR-15.58 — Text scaling\*\*



200% zoom readable without horizontal scroll.



\## 5.15.10 Multi-Currency



\*\*FR-15.59 — Currency toggle\*\*



BWP default, USD, ZAR, EUR.



\*\*FR-15.60 — Currency preference persistence\*\*



Cookie + account setting.



\*\*FR-15.61 — Currency display\*\*



Code, decimal places per convention, locale-appropriate separators.



\*\*FR-15.62 — Conversion disclosure\*\*



Rate used, refreshed hourly, base amount on hover.



\## 5.15.11 Multi-Language



\*\*FR-15.63 — Language support\*\*



English default, Setswana infrastructure.



\*\*FR-15.64 — Language toggle\*\*



Header or footer.



\*\*FR-15.65 — Language persistence\*\*



Cookie. Applied to emails.



\*\*FR-15.66 — Date and number formatting\*\*



Per selected locale.



\## 5.15.12 Performance



\*\*FR-15.67 — Page load targets\*\*



| Page | Target (P95) |

|---|---|

| Search page | < 1.5s |

| Search results (cached) | < 2s |

| Search results (live API) | < 4s |

| Product detail | < 1s |

| Checkout | < 1s |

| Confirmation | < 1.5s |



\*\*FR-15.68 — Time to interactive\*\*



Under 2s (P95) mobile 3G.



\*\*FR-15.69 — First contentful paint\*\*



Under 1s desktop, 1.5s mobile.



\*\*FR-15.70 — Core Web Vitals\*\*



LCP < 2.5s, FID < 100ms, CLS < 0.1.



\*\*FR-15.71 — Bundle size\*\*



Under 100KB gzipped on critical path.



\## 5.15.13 SEO



\*\*FR-15.72 — Server-side rendering\*\*



Public pages SSR or SSG.



\*\*FR-15.73 — Structured data\*\*



Product, Flight, Offer, AggregateRating.



\*\*FR-15.74 — Meta tags\*\*



Title, description, OpenGraph, canonical.



\*\*FR-15.75 — Sitemap\*\*



`/sitemap.xml`.



\## 5.15.14 Testing



\*\*FR-15.76 — Unit tests\*\*



Pricing and booking logic. All rule types, channels, markets, edge cases.



\*\*FR-15.77 — Integration tests\*\*



Full flow, error paths, idempotency, quote expiry.



\*\*FR-15.78 — E2E tests\*\*



Playwright: desktop flow, mobile flow, keyboard nav, screen reader (axe-core).



\*\*FR-15.79 — Visual regression tests\*\*



Desktop 1440px, tablet 768px, mobile 375px.



\## 5.15.15 Data Model Updates



\*\*FR-15.80 — No new tables required\*\*



Uses `pricing\_snapshots`, `bookings`, `booking\_items`, `booking\_guests`, `payment\_intents`, `payments`, `booking\_documents`.



\*\*FR-15.81 — Quote storage\*\*

pricing\_quotes



id, quote\_ref, booking\_id, account\_id



product\_ref, contract\_id



input\_params (jsonb), output\_params (jsonb), rules\_applied (jsonb)



pricing\_version\_id, base\_cost\_cents, final\_total\_cents



display\_total\_cents, display\_currency, signature



computed\_at, expires\_at, consumed\_at, created\_at





\*\*FR-15.82 — Indexes\*\*



\- `pricing\_quotes(quote\_ref)` unique

\- `pricing\_quotes(account\_id, created\_at DESC)`

\- `pricing\_quotes(booking\_id)`

\- `pricing\_quotes(expires\_at)`



\*\*FR-15.83 — Quote retention\*\*



90 days, then auto-purge.



\## 5.15.16 API Contracts



\*\*FR-15.84 — Search endpoint\*\*

GET /api/v1/search?q=\&vertical=\&from=\&to=\&pax=\&filters=\&page=\&per\_page=\&sort=





\*\*FR-15.86 — Quote endpoints\*\*



As in FR-15.48 and FR-15.49.



\*\*FR-15.87 — Booking endpoint\*\*

POST /api/v1/bookings

headers: { Idempotency-Key: uuid }

body: { quote\_id, signature, guests, contact, special\_requests }



text



\*\*FR-15.88 — Payment endpoint\*\*

POST /api/v1/bookings/:ref/payment

headers: { Idempotency-Key: uuid }

body: { method, return\_url }



text



\*\*FR-15.89 — Confirmation endpoint\*\*

GET /api/v1/bookings/:ref



text



\## 5.15.17 UI Component Library



\*\*FR-15.90 — Component inventory\*\*



SearchBar, SearchFilters, SearchResultCard, SupplierComparison, ProductDetail, RoomSelector, DepartureSelector, PriceBreakdown, PriceAuditDrawer, GuestForm, PaymentMethodSelector, BookingSummary, ConfirmationScreen, CacheIndicatorChips, MobileFilterSheet, MultiCityChips, DateRangePicker, PassengerSelector, CurrencyToggle, LanguageToggle, TrustBadge, ChildPolicyBadge.



\*\*FR-15.91 — Component library\*\*



shadcn/ui primitives + Tailwind + design tokens.



\*\*FR-15.92 — Design tokens\*\*



Colors, typography, spacing, radii, shadows, motion.



\## 5.15.18 Observability



\*\*FR-15.93 — Metrics\*\*



\- `search.requests`, `search.latency\_ms`, `search.results\_count`

\- `quote.requests`, `quote.latency\_ms`

\- `booking.created`, `booking.confirmed`, `booking.failed`

\- `payment.succeeded`, `payment.failed`



\*\*FR-15.94 — Traces\*\*



`trace\_id` propagated through all systems.



\*\*FR-15.95 — Alerts\*\*



\- Search latency > 5s for 5 min: P2

\- Quote error rate > 5% for 5 min: P1

\- Booking failure rate > 2% for 5 min: P1

\- Payment failure rate > 5% for 5 min: P1



\*\*FR-15.96 — Session replay\*\*



5% sampled, PII redacted.



\## 5.15.19 Acceptance Criteria



Phase 2 complete when:



\- \[ ] Search works with autocomplete, dates, pax

\- \[ ] Multi-city works with chips

\- \[ ] Results with skeleton, empty, error states

\- \[ ] Supplier dedup works

\- \[ ] Detail page complete

\- \[ ] Price breakdown available

\- \[ ] Price audit trail on click

\- \[ ] Multi-step checkout with persistence

\- \[ ] Guest forms validate against product rules

\- \[ ] Payment method selection works

\- \[ ] Payment confirmation requires explicit consent

\- \[ ] Idempotency prevents duplicates

\- \[ ] Booking reference displayed with copy/QR

\- \[ ] Confirmation shows documents

\- \[ ] Post-booking state is honest

\- \[ ] Mobile filter sheet works

\- \[ ] Currency toggle works

\- \[ ] Language toggle works

\- \[ ] WCAG 2.1 AA verified

\- \[ ] Core Web Vitals pass

\- \[ ] All pricing server-side and signed

\- \[ ] Quote expiry handled

\- \[ ] Error states specific and actionable

\- \[ ] Observability wired

\- \[ ] E2E tests pass



\## 5.15.20 Out of Scope for B2C



\- User accounts (guest checkout default)

\- Saved payment methods

\- Wishlists

\- Loyalty points

\- Review submission

\- Referral program

\- Group booking tools

\- Corporate travel policies

\- Subscription pricing



\---



\# §5.16 Admin \& Ops Console



\## 5.16.1 Purpose



The Admin \& Ops Console is the internal interface where ArriveSuite's operations, supplier, finance, and compliance teams work.



\*\*Design principles:\*\*



1\. \*\*Workflow-grouped navigation\*\* — not alphabetical or technical.

2\. \*\*Role-scoped by default\*\* — nothing hidden with grayed-out UI; simply not rendered.

3\. \*\*Live by default\*\* — SSE for critical, polling for non-critical.

4\. \*\*Auditable by default\*\* — every mutation writes to `audit\_events`.

5\. \*\*Dense but legible\*\* — built for operators who work in it 8 hours a day.



\## 5.16.2 Navigation



\*\*FR-16.1 — Grouped navigation\*\*



| Group | Items |

|---|---|

| Operations | Dashboard, Bookings, Supplier Hub, Inventory |

| Commerce | Markup \& FX, Payments \& Settlement, Corporate Clients |

| Trust \& Ops | Support \& Disputes, Audit Log, Settings |



\*\*FR-16.2 — Queue badges\*\*



Live queue depths. Critical (red), Warning (amber), Info (gray).



\*\*FR-16.3 — Role-based visibility\*\*



Hidden if unauthorized. No disabled items.



\*\*FR-16.4 — Command palette\*\*



⌘K / Ctrl+K for global search, navigation, actions.



\*\*FR-16.5 — Keyboard shortcuts\*\*



| Shortcut | Action |

|---|---|

| ⌘K | Command palette |

| G then B | Bookings |

| G then S | Suppliers |

| G then F | Finance |

| G then D | Dashboard |

| R | Refresh |

| Esc | Close |

| ? | Help |

| / | Focus search |



\## 5.16.3 Dashboard



\*\*FR-16.6 — KPI cards\*\*



Today GMV, Active Bookings, Commission Earned, FX Buffer Profit, SLA Breaches Today. Value, delta, trend, drill-down.



\*\*FR-16.7 — GMV chart\*\*



7-day bars/area with peak highlight, click-through, currency toggle.



\*\*FR-16.8 — Supplier health table\*\*



Name, type, success rate, latency, status, click-through.



\*\*FR-16.9 — Activity feed\*\*



Last 20 events with timestamp, actor, action, entity, severity.



\*\*FR-16.10 — Alert banner\*\*



For critical issues. Dismissible. Max 3 stacked.



\## 5.16.4 Bookings Manager



\*\*FR-16.11 — Booking list\*\*



Search, filter, sort, pagination, column selection, saved views.



\*\*FR-16.12 — Bulk actions\*\*



CSV, PDF, resend voucher, batch confirm/cancel, reassign supplier, apply tag.



\*\*FR-16.13 — Booking detail drawer\*\*



Summary, FX conversion, supplier details, guests, payment, fulfillment, communication, timeline, actions.



\*\*FR-16.14 — Booking timeline\*\*



Every event with timestamp, actor, action.



\*\*FR-16.15 — Booking states\*\*



Per §9.1 and §9.2. Real-time via SSE.



\## 5.16.5 Supplier Hub



\*\*FR-16.16 — External supplier management\*\*



Name, vertical, credentials status, markup override, FX buffer, latency, success rate, status, actions.



\*\*FR-16.17 — Direct lodge monitoring\*\*



Lodge, occupancy, ADR, last sync, sync status, housekeeping, actions.



\*\*FR-16.18 — Supplier detail page\*\*



Profile, contracts, rate plan history, booking volume, trust timeline, payout history, audit log.



\*\*FR-16.19 — Health timeline\*\*



24-hour and 7-day.



\*\*FR-16.20 — Test connection\*\*



Safe test endpoint, success/failure, latency, error, logged.



\## 5.16.6 Inventory



\*\*FR-16.21 — Unified availability view\*\*



Supplier, product, source, available, blocked, rate, last sync.



\*\*FR-16.22 — Filters\*\*



Vertical, supplier, source type, availability, location, freshness.



\*\*FR-16.23 — Bulk rate updates\*\*



Multiple items, adjustment, preview, apply. Above threshold requires two-person approval.



\## 5.16.7 Markup \& FX Engine



\*\*FR-16.24 — Global FX rules\*\*



Base currency, provider, buffer slider, live preview, refresh timestamp.



\*\*FR-16.25 — B2B tier management\*\*



Retail, Agent Net, Corporate, Sub-Agent with editable markup.



\*\*FR-16.26 — Rule builder\*\*



Condition editor, value editor, priority, example calculation, version control.



\*\*FR-16.27 — Conversion log\*\*



Every FX conversion with timestamp, original, rate, buffer, final, profit.



\## 5.16.8 Payments \& Settlement



\*\*FR-16.28 — Payment KPIs\*\*



Payable, receivable, wallet, reconciliation status.



\*\*FR-16.29 — Transaction ledger\*\*



Date, type, reference, amount, status, method, matched.



\*\*FR-16.30 — Payout batch creation\*\*



Select period, select suppliers, preview, approve (two-person), mark paid, reconcile.



\*\*FR-16.31 — Reconciliation\*\*



Upload statement, auto-match, flag discrepancies, manual resolution, export.



\*\*FR-16.32 — Refund processing\*\*



Request, approve (two-person above threshold), process, confirm, reconcile.



\## 5.16.9 Corporate Clients



\*\*FR-16.33 — Corporate client table\*\*



Name, location, tier, credit limit, utilized, markup, overdue, status.



\*\*FR-16.34 — Credit management\*\*



Adjust limits, suspend, remind, export, view history.



\*\*FR-16.35 — Corporate detail page\*\*



Profile, credit history, payment history, volume chart, policy exceptions, audit log.



\## 5.16.10 Support \& Disputes



\*\*FR-16.36 — Ticket queue\*\*



ID, booking ref, issue, priority, assignee, SLA, status.



\*\*FR-16.37 — WhatsApp integration\*\*



Live chat, history, quick actions, escalation, attachments, templates.



\*\*FR-16.38 — Resolution playbook\*\*



Numbered steps, data needed, actions, snippets.



\*\*FR-16.39 — SLA management\*\*



Critical 2h, High 4h, Normal 24h, Low 72h. Alerts on breach.



\*\*FR-16.40 — Dispute management\*\*



Guest vs. supplier with evidence, resolution path, communication log, final outcome.



\## 5.16.11 Audit Log



\*\*FR-16.41 — Audit log screen\*\*



Timestamp, actor, action, entity, diff, trace\_id.



\*\*FR-16.42 — Audit search and filter\*\*



Actor, action category, entity type, date range, IP, export.



\*\*FR-16.43 — Audit immutability\*\*



No edit, no delete. 7-year retention.



\*\*FR-16.44 — Audit detail\*\*



Full event, related events (entity and trace), actor's recent activity.



\## 5.16.12 Real-Time Updates



\*\*FR-16.45 — Live indicator\*\*



Green pulse, amber reconnecting, red disconnected.



\*\*FR-16.46 — Update mechanism\*\*



SSE for critical, polling (max 30s) for non-critical.



\*\*FR-16.47 — Manual refresh\*\*



Button + "Last updated Xs ago".



\*\*FR-16.48 — Update animations\*\*



Feed entries animate in. KPI changes highlight. `prefers-reduced-motion` respected.



\## 5.16.13 Error, Loading, and Empty States



\*\*FR-16.49 — Loading states\*\*



Skeletons, inline spinners, progress indicators, optimistic UI where safe.



\*\*FR-16.50 — Error states\*\*



Specific message, error code, retry, suggestion, Sentry.



\*\*FR-16.51 — Empty states\*\*



Clear explanation, suggested action, quick action button.



\*\*FR-16.52 — Confirmation dialogs\*\*



Destructive actions require confirmation with what, impact, reason, explicit confirm.



\## 5.16.14 Permissions



\*\*FR-16.53 — Role-based access control\*\*



Every action permission-gated per §5.16.14 matrix.



\*\*FR-16.54 — UI enforcement\*\*



Nav, buttons, columns hidden; APIs return 403 if unauthorized.



\*\*FR-16.55 — Two-person rule\*\*



Payout above threshold, version activation, FX change, credential rotation, supplier suspension, credit limit increase.



\## 5.16.15 Accessibility



\*\*FR-16.56 — WCAG 2.1 AA compliance\*\*



\*\*FR-16.57 — Keyboard navigation\*\*



\*\*FR-16.58 — Screen reader support\*\*



\*\*FR-16.59 — Reduced motion\*\*



\## 5.16.16 Performance



\*\*FR-16.60 — Page load targets\*\*



| Page | Target (P95) |

|---|---|

| Dashboard | < 1.5s |

| Bookings list | < 1s |

| Booking drawer | < 800ms |

| Supplier Hub | < 1s |

| Supplier detail | < 1.2s |

| Markup \& FX | < 1s |

| Payments ledger | < 1.2s |

| Support tickets | < 1s |

| Audit log | < 1.5s |

| Settings | < 800ms |



\*\*FR-16.61 — Update latency\*\*



Under 2s of underlying event.



\*\*FR-16.62 — Bulk operations\*\*



100 refunds < 30s. 1,000 CSV exports < 15s. 500 confirmations < 60s.



\*\*FR-16.63 — Table virtualization\*\*



For > 100 rows, virtualize to maintain 60fps.



\## 5.16.17 Data Model



\*\*FR-16.64 — No new transactional tables required\*\*



\*\*FR-16.65 — Materialized views\*\*



\- `mv\_dashboard\_kpis` — 60s refresh

\- `mv\_supplier\_health` — 30s refresh

\- `mv\_corporate\_credit` — 5 min refresh



\*\*FR-16.66 — Saved views\*\*



`admin\_saved\_views` (account\_id, page\_key, name, filters, column\_config, is\_default).



\*\*FR-16.67 — Indexes\*\*



\- `bookings(status, created\_at DESC)`

\- `bookings(booking\_ref)`

\- `bookings(customer\_email)`

\- `audit\_events(actor\_id, created\_at DESC)`

\- `audit\_events(entity\_type, entity\_id)`

\- `message\_threads(entity\_type, entity\_id)`



\## 5.16.18 API Contracts



\*\*FR-16.68 — Admin API endpoints\*\*



Full list covering dashboard, bookings, suppliers, integrations, inventory, pricing, FX, payments, corporate, support, audit, saved views.



\*\*FR-16.69 — SSE endpoints\*\*



`/stream/bookings`, `/stream/suppliers`, `/stream/sla`, `/stream/payments`, `/stream/activity`.



\*\*FR-16.70 — Rate limiting\*\*



Read: 300/min. Write: 60/min. Bulk: 10/min. SSE: 5 concurrent.



\## 5.16.19 Observability



\*\*FR-16.71 — Metrics\*\*



\- `admin.page.load\_ms`

\- `admin.action.count`

\- `admin.action.error\_count`

\- `admin.sse.connections`

\- `admin.sse.reconnects`

\- `admin.bulk\_operation.duration\_ms`



\*\*FR-16.72 — Traces\*\*



`trace\_id` propagated.



\*\*FR-16.73 — Alerts\*\*



\- Dashboard load > 3s for 5 min: P2

\- SSE connections drop > 50%: P1

\- Bulk op failure > 5%: P1

\- Admin API error rate > 2%: P1



\## 5.16.20 Testing



\*\*FR-16.74 — Unit tests\*\*



Rendering, interaction, permission gating, states.



\*\*FR-16.75 — Integration tests\*\*



Login → dashboard, search → confirm, filter → test connection, create payout → approve, ticket → resolve.



\*\*FR-16.76 — E2E tests\*\*



Full flows, keyboard-only, screen reader (axe-core).



\*\*FR-16.77 — Visual regression tests\*\*



Desktop 1440px, tablet 1024px, mobile 375px.



\## 5.16.21 Acceptance Criteria



Phase 6 complete when:



\- \[ ] Nav grouped by workflow, role-scoped

\- \[ ] Queue badges live and accurate

\- \[ ] Command palette works

\- \[ ] Keyboard shortcuts work

\- \[ ] Dashboard shows 5 KPIs with deltas

\- \[ ] GMV chart renders with click-through

\- \[ ] Supplier health table status-highlighted

\- \[ ] Activity feed updates in real time

\- \[ ] Alert banner shows for critical issues

\- \[ ] Bookings list: search, filter, sort, pagination

\- \[ ] Booking drawer shows full timeline

\- \[ ] Bulk actions work with confirmation

\- \[ ] Supplier Hub shows external and direct

\- \[ ] Supplier detail includes health timeline

\- \[ ] Inventory unified view works

\- \[ ] Rule builder works with preview

\- \[ ] Conversion log shows buffer profit

\- \[ ] Payment ledger and reconciliation work

\- \[ ] Payout batch workflow with two-person rule

\- \[ ] Corporate management works

\- \[ ] Support tickets with SLA countdown

\- \[ ] WhatsApp integration works

\- \[ ] Playbooks visible

\- \[ ] Audit log exists, filterable, immutable

\- \[ ] Real-time updates via SSE work

\- \[ ] Loading, error, empty states exist everywhere

\- \[ ] Confirmation dialogs on all destructive actions

\- \[ ] Permission gating at UI and API

\- \[ ] Two-person rule enforced

\- \[ ] Keyboard navigation works

\- \[ ] WCAG 2.1 AA verified

\- \[ ] Performance targets met

\- \[ ] Bulk operations within targets

\- \[ ] Materialized views refreshing

\- \[ ] SSE endpoints stable under load

\- \[ ] Rate limiting works

\- \[ ] Observability wired

\- \[ ] Tests pass



\## 5.16.22 Out of Scope



\- Mobile admin console

\- Native desktop apps

\- Custom dashboard layouts

\- Advanced BI / analytics

\- White-label admin

\- Inline bulk editing of pricing rules

\- AI-assisted ticket routing

\- Automated dispute resolution

\- Multi-tenant admin





