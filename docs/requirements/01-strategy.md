# §1–§3 Strategy, Vision & Market

> ArriveSuite Requirements v3.0. Supersedes v2.4 (archived at `archive/v2.4/`).
> Section numbering is stable across v2.4 → v3.0. No § number was reused or reassigned.

---

# §1 Executive Summary

## 1.1 What ArriveSuite Is

ArriveSuite is the **national digital inventory layer for Botswana tourism**, launched with a hybrid inventory model: sourced inventory from global providers (funding the platform) and owned inventory from Botswana suppliers (the long-term moat).

It is not a travel booking website. It is not a metasearch engine. It is not a Booking.com clone.

It is the missing infrastructure that makes Botswana's tourism products — lodges, guesthouses, camps, tour operators, activities, guides, transfers — discoverable, rate-structured, availability-aware, and bookable by any channel in the world.

> **Strategic thesis.** Botswana's tourism inventory exists. It is fragmented, un-digitized, and controlled by intermediaries who extract value without reinvesting it. ArriveSuite digitizes, structures, and connects this inventory — creating a nationally-owned asset that any distributor (B2C, B2B, corporate, OTA, GDS) can consume. The inventory is owned locally. The content is first-party. The platform captures value for Botswana.

> **Execution thesis.** To build the moat, ArriveSuite needs time. To earn time, ArriveSuite needs revenue. To earn revenue, ArriveSuite needs inventory. Therefore, ArriveSuite launches with sourced inventory from global providers while onboarding Botswana suppliers in parallel. Revenue from sourced inventory funds the moat. As owned inventory grows, the platform transitions to a pure-play Botswana inventory exchange.

**Commercial model (v3.0 decision, see §6.2).** ArriveSuite is an **agent** on sourced inventory and a **merchant of record** on owned inventory.

- *Sourced* — Duffel flights, Amadeus hotels. ArriveSuite earns commission. Guest contracts with the airline/hotel. No principal risk, no capital, no inventory liability.
- *Owned* — Botswana lodge, tour and activity inventory. ArriveSuite is the principal, guarantees the voucher, absorbs supplier failure, and carries cancellation/refund exposure.

This split is deliberate. It keeps working capital and fulfilment risk off the flight and hotel side, and it is the only structure under which the promise in §3.5 ("supplier vouchers guaranteed by ArriveSuite") is honest. It is reversible per vertical at Phase 3 review.

## 1.2 The Problem

Botswana has no digital inventory layer for its own tourism products.

**Today's reality:**

- A 12-room lodge in Maun manages bookings via WhatsApp, a paper calendar, and a bank statement.
- A tour operator in Kasane has no way to sell to international travelers except through middlemen who take 25–35% margin.
- International OTAs (Booking.com, Expedia, Viator) resell Botswana inventory at markup, using generic stock photos and outdated descriptions written by people who have never been to Botswana.
- **Local inventory does not appear in global systems** unless an intermediary has already purchased API access to content that belongs locally.
- No one — not the operator, not the guest, not the government — has a unified view of what is bookable in Botswana today.

**The consequence:**

- Local operators get squeezed on margin.
- International guests pay more for worse content.
- No one reinvests in the destination.
- Botswana's tourism economy is digitally subordinate to intermediaries who don't live here.

## 1.3 The Solution

1. **Sourced inventory at launch** — flights from Duffel, hotels from Amadeus. Commission revenue from Week 5. Proof of concept for fundraising. Revenue funds the moat.
2. **The Extranet** — a light property management system that turns Botswana's fragmented inventory into structured, bookable data. The front door to the platform and the moat of the business.
3. **The Pricing Engine** — a server-side engine that resolves rates, markups, taxes, FX and availability deterministically, with signed quotes and immutable snapshots. Works identically for both inventory classes.
4. **Multi-channel distribution** — B2C, B2B agents, corporate buyers, and eventually OTAs and GDS all consume the same inventory through channel-specific interfaces.
5. **The Inventory Exchange** — a standardized protocol by which any distributor can connect to ArriveSuite's Botswana inventory, and any Botswana operator can be distributed worldwide. **Post-MVP.** See §17.3.
6. **WhatsApp as the primary operator interface** — because it is how Botswana communicates. Suppliers confirm, update availability and receive payouts over WhatsApp from Phase 2. Guest booking over WhatsApp is phased; see §2.5 and §5.3.

## 1.4 Why Now

1. **Mobile money and card payments** are now common in Botswana (Orange Money, MyZaka, PayTabs, EFT).
2. **BTO licensing and regulation** are becoming digital-first, making verified inventory possible — though verification is manual, not API-based (§19.2).
3. **Global OTAs are hungry for locally-owned inventory** — they will connect to standardized sources because it's cheaper than replicating on-the-ground content.
4. **Post-pandemic tourism recovery** has created operational urgency among Botswana operators who now accept that digital distribution is non-optional.

## 1.5 Why Botswana First

- **Small enough to digitize completely.** ~2,000 BTO-licensed tourism products nationally. A focused team can onboard them all within 24 months.
- **Unique enough to defend.** Safari, Okavango Delta, Chobe, Kalahari, cultural tourism, MICE — the inventory is distinctive and cannot be replicated elsewhere.
- **Digitally underserved.** No dominant local player. No entrenched competitor.
- **Compliance-driven.** BTO licensing provides a verified supply base.
- **Gateway to Southern Africa.** Once operational in Botswana, the same infrastructure extends to Namibia, Zambia, Zimbabwe, and South Africa.

## 1.6 The Business Model

### Primary revenue

| Line | Phase | Basis | Year 1 modelled |
|---|---|---|---|
| Commission — sourced B2C | 1 | 5–8% of net fare | See §19.5 |
| Commission — sourced B2B | 1 | 2–5% | Post-MVP |
| Commission — owned B2C | 2 | 15–25% | See §19.5 |
| Subscription — extranet | 3 | Freemium; paid tiers for channel sync and priority listing | See §19.5 |
| FX buffer — platform P&L | 1 | 1.5% default on cross-border conversion | See §19.5 |
| API licensing | 4 | OTA and GDS connectivity | **Not modelled** — no committed partner |
| Content licensing | 4 | Botswana-owned content to distributors | **Not modelled** — no committed partner |

**v3.0 correction.** v2.4 listed eight revenue lines with no volume attached to seven of them, and listed the FX buffer as a co-equal primary revenue stream. The FX buffer on BWP 20M of Year-1 GMV is approximately BWP 300,000 — it is a margin component, not a business. It is retained as a line here for P&L visibility and explicitly demoted in framing. API and content licensing are shown as unmodelled rather than forecast, because §1.8 records zero OTA connections in Year 1 and no partner is under discussion. See §19.5.

### Revenue trajectory

Owned share of GMV is the strategic metric (§1.8). Sourced revenue funds operations; owned revenue becomes the business.

| Period | Sourced share | Owned share | Blended contribution margin |
|---|---|---|---|
| Month 1 | 100% | 0% | See §19.5 — **not yet positive** |
| Month 3 | 85% | 15% | §19.5 |
| Month 6 | 70% | 30% | §19.5 |
| Month 12 | 40% | 60% | §19.5 |
| Year 2 | 25% | 75% | §19.5 |
| Year 3 | 15% | 85% | §19.5 |

**v3.0 correction — two changes from v2.4:**

1. v2.4 gave blended *margin* figures (6% → 16%). Those were gross commission, before payment processing fees, messaging costs, refunds, chargebacks, support and FX conversion. v3.0 reports **contribution margin** from the §19.5 model and marks early months as not yet positive, because on a 5–8% sourced commission minus 2.5–3.5% card processing, they are not.
2. The owned-share growth rule is restated. "+10 percentage points every quarter" cannot hold indefinitely — it asymptotes past 100%. The rule is **+10pp per quarter to 60% by Month 12, then +5pp per quarter**. See §1.8.

## 1.7 The Roadmap

**v3.0: rebaselined from 13 weeks to 10 weeks of scope.**

v2.4's phase durations summed to 12 weeks but were labelled 13, and its milestone claims (revenue Week 5, owned inventory Week 8, WhatsApp booking Week 10) did not align with its own phase gates (Weeks 3, 5, 7, 8, 9, 10). This has been rebuilt from the phase gates outward. Full detail in §17.

| Phase | Weeks | Deliverable |
|---|---|---|
| Phase 0 | 1 | Foundations: monorepo, cloud stack, worker host, DB, auth, CI |
| Phase 1 | 2 | Sourced flights + B2C checkout + PayTabs + WhatsApp confirmations |
| Phase 2 | 2 | Extranet + owned inventory (first 10 suppliers) + WhatsApp supplier ops |
| Phase 3 | 2 | WhatsApp booking flow + tours + pricing engine v2 |
| Phase 4 | 1 | Hardening, launch prep, first revenue |

**Total: 8 weeks of build, 10 calendar weeks including Phase 0 buffer and the Phase 4 hardening window.**

Scope was cut from v2.4 to reach this. The B2B Agent Portal, Corporate Clients, the Exchange API, Viator tours, the CMS domain, two materialized views and three FR groups (bulk rotation/export, contract diff viewer, pricing scenario tester/dry-run UI) are **post-MVP**. §17.3 lists every cut and §18.2 states what is permanently out.

## 1.8 Success Metrics

**The single most important metric is Owned Share of GMV.** It must grow by at least 10 percentage points per quarter until it reaches 60%, then by at least 5 points per quarter.

| Metric | Year 1 | Year 3 |
|---|---|---|
| Botswana products onboarded | 250 | 2,000 |
| Active owned suppliers | 100 | 1,200 |
| Owned share of GMV | 60% | 80–85% |
| B2C bookings/month | 150 | 4,000 |
| WhatsApp bookings/month | 50 | 2,000 |
| OTA connections | 0 | 5 |
| Supplier payout cadence | Weekly | Daily |
| Time to onboard new supplier | 10 business days | 3 business days |

**v3.0 correction — the v2.4 table was not self-consistent and has been withdrawn pending the §19.5 model.** v2.4 asserted Year-1 GMV of BWP 20M alongside 2,500 bookings/month, implying BWP 667 average booking value, while simultaneously asserting 300 suppliers × 8 bookings/month of *owned* inventory — 2,400 owned bookings/month — implying BWP 417 average owned booking value. The document's own worked example was BWP 14,375 for a 7-night, 2-adult lodge stay. Those figures differ by roughly 34×, and no top-down GMV target survives that contradiction.

v3.0 therefore states **no GMV or revenue target until §19.5 is populated from the bottom up.** Publishing a number that cannot be reconciled against the booking targets would repeat the v2.4 error. The volume metrics above are held because they are set by capacity assumptions — supplier onboarding throughput (§19.4), ops headcount (§3.12), and search demand — rather than by arithmetic on an assumed average booking value.

Year-1 active-supplier count is cut from 300 to **100**. See §19.4: 300 suppliers requires a field organisation that BWP 40,000 of field-ops budget does not fund.

## 1.9 The Defensibility

ArriveSuite is defensible not because of technology, but because of **content, relationships, and standards**:

1. **First-party content** — photos, descriptions, amenities produced with and by Botswana operators.
2. **Verified inventory** — BTO-licensed and BTO-graded suppliers, contract-bound, quality-scored.
3. **Local presence** — field presence in Maun and Kasane first, then Gaborone and the Okavango.
4. **WhatsApp-native relationships** — direct relationships with operators who trust the platform.
5. **Standards ownership** — ArriveSuite defines the protocol others implement to connect.
6. **Channel leverage** — once operators are on the platform, they will not want to be distributed through multiple systems.

**The sourced inventory is not the moat. It is the funding mechanism for the moat. The moat is the content, the relationships, and the trust.**

---

# §2 Vision & Positioning

## 2.1 Vision

> **To be the digital infrastructure of Botswana tourism — the layer through which every local product reaches every guest, and through which every guest experiences the real Botswana.**

## 2.2 Positioning

| Audience | What ArriveSuite is |
|---|---|
| **Local suppliers** | The tool that makes your inventory bookable worldwide, at fair margin, without you needing to be a technology company. |
| **B2C guests** | The trusted source for Botswana travel — real photos, real availability, real prices, real suppliers. |
| **B2B agents** | The wholesale access to Botswana inventory with competitive net rates. |
| **Corporate buyers** | The procurement platform for employee travel and MICE in Botswana. |
| **International OTAs** | The standardized source for Botswana inventory that you cannot replicate in-house. |
| **Government / BTO** | The digital infrastructure that makes Botswana's tourism economy visible and accountable. |
| **Investors** | The infrastructure layer for a market that has none, in a country that is uniquely positioned to lead. |

## 2.3 Comparison to Alternatives

| Dimension | ArriveSuite | PHPTravels / Generic | Booking.com / Expedia | Viator / GYG | Local operator WhatsApp |
|---|---|---|---|---|---|
| Owns local inventory | Yes | No | No | No | Yes |
| Structures inventory | Yes | Partial | Yes | Yes | No |
| Distributes locally | Yes | Partial | No | No | No |
| Distributes globally | Yes | No | Yes | Yes | No |
| Botswana-first | Yes | No | No | No | Yes |
| WhatsApp-native | Yes | No | No | No | Yes |
| Multi-channel | Yes | Partial | No | No | No |
| Content owned locally | Yes | No | No | No | Yes |
| Exchange-ready | Yes | No | No | No | No |
| Hybrid inventory at launch | Yes | No | N/A | N/A | No |
| Built for a single country's tourism economy | Yes | No | No | No | No |

**ArriveSuite is not competing with any of them. ArriveSuite is the layer all of them will need to connect to.**

**Correction to this table (v3.0).** "Exchange-ready: Yes" and "Distributes globally: Yes" describe a capability, not a shipped state. The Exchange API is post-MVP (§17.3) and has zero committed distribution partners. The table is retained for strategic intent but the honest present-tense claim is: *ArriveSuite is building the layer that others will need to connect to.*

## 2.4 Strategic Priorities

**Priority 1 — Digitize Botswana's inventory.** Every BTO-licensed tourism product should be on the platform over time. This is the primary measure of success. Revenue follows inventory.

**Priority 2 — Own the content.** First-party photos, descriptions, itineraries, cultural context. The moat that cannot be replicated.

**Priority 3 — WhatsApp as the primary operator interface.** For suppliers first, guests second. It is how Botswana communicates. Treat it with the same seriousness as the web app — but see §2.6 for the honest phasing, which is narrower than v2.4 claimed.

**Priority 4 — Serve the operators.** Every design decision should be evaluated against: "Does this make it easier for a lodge owner in Maun to run their business?" If not, redesign.

**Priority 5 — Build toward the exchange.** Design every API as if it will be consumed externally. Post-MVP, but the interfaces should not preclude it.

**Priority 6 — Extend regionally.** Once Botswana is operational, replicate the model in Namibia, Zambia, Zimbabwe — using the same infrastructure.

**Priority 7 — Remain country-specific in content, global in infrastructure.** The infrastructure can serve any country. The content is Botswana's.

**Priority 8 — Grow owned share of GMV.** Every quarter, owned inventory must represent a larger share of total GMV.

---

# §2.5 WhatsApp Strategy

## 2.5.1 Purpose

This section defines WhatsApp not as a feature, but as the **primary operator interface** and a **phased guest interface** for the platform.

**v3.0 scoping decision.** v2.4 defined four "levels" of WhatsApp capability and treated transactional guest flows as one level among four, while simultaneously calling WhatsApp the platform's "primary user interface" in §1.3 and §2.4. Those two positions are incompatible and the roadmap resolved it in favour of the web product — putting guest WhatsApp booking at Phase 3 while making international web B2C the Phase 1 persona.

v3.0 makes the commitment precise instead of rhetorical. WhatsApp is:

- **The primary supplier interface** — from Phase 2, suppliers confirm, decline, update availability, update rates, acknowledge payouts and reach support over WhatsApp. Not as an alternative to the extranet; as the default way most suppliers will actually work.
- **A phased guest interface** — notifications and confirmations from Phase 1; a guided, menu-driven booking flow from Phase 2; natural-language search from Phase 3; payment from Phase 3.

Guest booking is **not** load-bearing for international guests (persona P3) at launch. International travellers discover, research and transact on the open web, and card authorization inside a chat in-app browser is the single highest-friction step in the funnel. Domestic guests (P2) and suppliers (P1) are where WhatsApp genuinely wins. See §5.3.

## 2.5.2 Why WhatsApp

**Empirical reality:**

- WhatsApp is the dominant communication platform in Botswana, used across age groups, income levels, and urban/rural locations.
- Business communication — including bookings, confirmations, and payments — routinely happens over WhatsApp.
- A lodge owner in Maun will respond to a WhatsApp message within minutes; they may check email weekly.
- Tourists, especially regional travelers, expect WhatsApp as a contact channel.

**Design implication:**

> Every supplier workflow that involves communication, confirmation, or transaction with a human must be available over WhatsApp. Guest workflows must be available over WhatsApp from Phase 3.

## 2.5.3 Capabilities by Phase

| Capability | Phase | Notes |
|---|---|---|
| Booking confirmations, vouchers, payment confirmations, cancellation alerts, payout notifications (template-based) | 1 | Approved templates only — register at §2.8.4 |
| Two-way threads tied to booking, supplier, agent | 1 | Logged, searchable, auditable |
| Supplier booking confirm / decline via WhatsApp | 2 | Command-driven, no LLM |
| Supplier availability and rate updates via WhatsApp | 2 | Command-driven with confirmation step |
| Supplier support over WhatsApp | 2 | Human, business hours |
| Guest booking flow, guided menu-driven | 2 | Deterministic; no LLM |
| Guest natural-language search and booking | 3 | LLM parsing, gated on evaluation (§5.3) |
| Guest payment via WhatsApp link | 3 | Gated on in-app-browser return reliability (§19.3) |
| Guest search, booking and payment — international | Post-MVP | Web remains the primary path for P3 |

**Not in v2.4, deliberately:** "Level 4 — full supplier workflows including housekeeping status and natural-language rate updates." Housekeeping state is an operational nicety that no supplier will use at volume; it is deferred to post-MVP. Natural-language supplier updates are deferred with guest LLM flows to Phase 3, for the same reason — LLM parsing requires an evaluation harness and a human fallback that a solo developer cannot staff in Phase 2.

## 2.5.4 Interaction Design

### Commands

| Command | Action |
|---|---|
| `hi` / `hello` | Start a new conversation |
| `book` | Start a booking flow |
| `status [ref]` | Check booking status |
| `cancel [ref]` | Initiate cancellation |
| `help` | Show available commands |
| `stop` | Opt out of notifications |

Supplier-specific:

| Command | Action |
|---|---|
| `CONFIRM [ref]` | Confirm a booking request |
| `DECLINE [ref] <reason>` | Decline a booking request |
| `AVAIL <property> <n> units <from>-<to>` | Set availability for a date range |
| `RATE <room type> <amount> <from>-<to>` | Propose a rate change |
| `PAYOUTS` | Show recent payouts and statements |
| `RECEIVED [ref]` | Confirm payout receipt |

All commands are **deterministic and exact-match** in Phase 2. Free-text interpretation is Phase 3 (§5.3).

### Natural language processing (Phase 3)

For flows beyond commands, the system uses LLM-based parsing:

- "I need a lodge in Maun for next weekend" → search parameters
- "Can you move my booking to the 20th?" → modification request
- "How much for 2 nights at Chobe?" → quote request

Parsing failures are handed off to a human agent. **This requires a staffed escalation queue** — see §3.12 and §19.6 for the staffing implication, and §5.3 for the requirements.

### Handoff to human

A user can request "speak to a human", or the system escalates when confidence is below the configured threshold, the request is outside the flow's scope, or the booking value exceeds a threshold. Escalation routes to the Admin Console Support view (§5.16).

## 2.5.5 Verification

- **Guest:** phone number + one-time code on first interaction. The verified number becomes the guest principal (§6.2, §9.1).
- **Supplier:** phone number registered in the extranet; supplier must be authenticated to authorize changes.
- **Agent:** phone number registered by agency admin.
- **High-value transactions:** additional verification (email confirmation or web login).

## 2.5.6 Payments

Payment over WhatsApp uses:

- **PayTabs payment links** (primary)
- **Mobile money** (Orange Money, MyZaka — Phase 3)
- **Wallet balance** (if the guest has one)

**Flow:**

1. System generates a signed payment link with an expiry.
2. Link is sent as a WhatsApp message (approved template).
3. Guest taps link → PayTabs hosted page in WhatsApp's in-app browser.
4. Payment captured → PayTabs webhook → system updates booking.
5. Confirmation + voucher sent via WhatsApp.

**Security:**

- Payment links are single-use, 15-minute expiry.
- Amount is fixed; the guest cannot modify it.
- Link is signed with HMAC to prevent tampering.
- All payment attempts are logged.
- Repeated failures raise a security alert after 3 retries.

**v3.0 added risk (Phase 3 gate).** The in-app browser step is not reliable across Android, iOS and BSP clients; return-URL handling and 3-D Secure step-up are known failure modes. This flow must not ship until verified against the target device matrix (§19.3). It is not on the critical path to first revenue, which is why it is Phase 3.

## 2.5.7 WhatsApp for Suppliers

**Scenario 1 — Booking confirmation**

```
[ArriveSuite → Supplier]
New booking: ARS-2026-000123
Water Suite · 15-22 June 2026
2 adults · BWP 14,375 · Paid
Reply CONFIRM / DECLINE <reason>

[Supplier → ArriveSuite]
CONFIRM

[ArriveSuite → Supplier]
Confirmed. Voucher issued.
Payout scheduled 29 June 2026 (Monday)
```

**Scenario 2 — Availability update**

```
[Supplier → ArriveSuite]
AVAIL Xigera Water Suite 3 units 20-25 Jun

[ArriveSuite → Supplier]
Set Xigera Water Suite to 3 available units,
20–25 June 2026. Reply YES to confirm, or send a
correction. (This will sell out rooms currently
held for walk-ins.)

[Supplier → ArriveSuite]
YES
```

**Scenario 3 — Rate change**

```
[Supplier → ArriveSuite]
RATE Xigera Water Suite 12500 01-31 Jul

[ArriveSuite → Supplier]
Proposed: Xigera Water Suite, BWP 12,500/night,
1–31 July 2026. Current: BWP 11,000/night (+13.6%).
Applies to 4 rate plans, 31 dates. Reply YES to apply.
This changes a live price and may affect bookings
already taken under the old rate.

[Supplier → ArriveSuite]
YES
```

**Scenario 4 — Payout confirmation**

```
[ArriveSuite → Supplier]
Payout processed: BWP 47,600
Period: 22–28 June 2026
Reference: PAY-2026-06-XIG
Bank: FNB ••••4567
Reply RECEIVED to confirm.

[Supplier → ArriveSuite]
RECEIVED

[ArriveSuite → Supplier]
Confirmed. Statement emailed.
```

**v3.0 correction.** v2.4's rate-change example ("Xigera rates +10% for July") gave no confirmation step, no statement of what would be affected, and no indication that a live price was about to change. Supplier-initiated rate and availability changes are the highest-consequence WhatsApp actions in the system — they affect inventory that may already be sold. Both are now confirmation-gated with an impact statement (§5.5).

---

# §2.6 Hybrid Inventory Strategy

> **Reconstructed in v3.0.** v2.4 listed this section as complete in its index and cited it as the source of the v2.1 strategic reframe, but no text existed — the file ended mid-sentence at §2.5.7. The strategy is reconstructed here from its consistent appearances across §1.1, §1.3, §1.6, §1.9 and §2.4, which agree on the following. **Review against the founding team's intent before building against it.**

## 2.6.1 The Problem Hybrid Inventory Solves

A destination inventory layer has a sequencing problem. The asset — first-party content and contracted supply from local operators — takes 12 to 24 months to build, requires field operations, content production and trust that cannot be bought. The revenue needed to fund that build is available immediately from *other people's* inventory.

Launching only with local inventory means no revenue during the period that matters most. Launching only with sourced inventory means building a business that a competitor can replicate in a quarter, with no defensibility and no local constituency.

## 2.6.2 The Two Inventory Classes

| | **Sourced** | **Owned** |
|---|---|---|
| Origin | Duffel, Amadeus | Botswana suppliers via the extranet |
| Commercial role | Revenue now; funds the moat | The business |
| ArriveSuite's role | Agent — earns commission, guest contracts with provider | Merchant of record — guarantees the voucher |
| Margin | 5–8% B2C, 2–5% B2B | 15–25% B2C |
| Defensibility | None — trivially copied | Content, relationships, contracts |
| Failure mode | Provider outage, coverage gaps, rate parity conflict | Supplier non-performance |
| Data model | Cached, thin, ephemeral | Authoritative, relational |
| Onboarding | API contract (§5.13) | Field ops + extranet (§5.5) |

## 2.6.3 Why the Same Engine Serves Both

The strategic prize is that a supplier's lodge and an Amadeus hotel are priced, quoted and booked by identical machinery. That is what makes ArriveSuite an inventory *layer* rather than a booking *site*: the moment the two classes diverge in pricing or booking semantics, the layer claim fails and it becomes two products.

This is why §4.1 principle 2 (two inventory engines, one booking layer) is load-bearing rather than a convenience. Both classes resolve through the same pricing engine (§5.14), produce the same signed quote shape (§5.15.8), write the same immutable snapshot (§6.4), and enter the same booking state machine (§9.1).

Where they *must* diverge, the divergence is explicit and typed — `booking_items.item_supplier_type` — never implicit.

## 2.6.4 Rate Parity and the Sourced/Owned Conflict

The two classes collide commercially. v2.4 addressed this in one line:

> **FR-5.5.70** ArriveSuite enforces rate parity across channels for owned inventory. Suppliers cannot sell cheaper elsewhere without triggering the parity rule. Exception: suppliers can offer lower rates to ArriveSuite than to competitors.

**This requirement is withdrawn from v3.0** and replaced. Three reasons:

1. **It is not enforceable.** Detecting that a supplier has discounted on their own website or on a competitor requires continuous price monitoring across properties the platform has no contractual relationship with. The requirement as written commits the platform to an operation it cannot perform.
2. **It is corrosive to the critical persona.** §3.3 lists what P1 will never accept, and "being locked into a system they cannot leave" is on that list. Rate parity is a lock-in mechanism dressed as consumer protection.
3. **It is commercially backwards.** A supplier who gives ArriveSuite a better rate than competitors has signalled something valuable. The platform should compete on the supplier's willingness to prefer it, not on surveillance.

**Replacement policy — Commercial Terms Disclosure (new FR-5.5.72).**

- Owned inventory may be distributed to any channel the supplier selects (FR-5.5.69).
- ArriveSuite publishes its commission rate to the supplier in the contract and in the extranet. There are no hidden fees (§3.3).
- ArriveSuite may offer suppliers a **preferred-supplier rate** — a lower net rate in exchange for higher commission, priority search placement, and featured status. This is the mechanism that makes exclusivity attractive rather than imposed.
- ArriveSuite does not monitor, enforce, or contractually police rates the supplier sells outside the platform.
- **Owned-inventory cannibalisation is managed commercially, not technically.** When owned and sourced inventory describe the same property, §5.15.3 applies the sourced-inventory disclosure rule: sourced is shown only when it is materially cheaper, and the cheaper option is always visible.

## 2.6.5 The Transition

The transition is measured by one number: **owned share of GMV** (§1.8). Sourced revenue funds operations; owned revenue becomes the business.

Three checkpoints:

| Checkpoint | Owned share | What must be true |
|---|---|---|
| Month 3 | 15% | 25 suppliers live, content production working, first owned booking fulfilled correctly |
| Month 12 | 60% | 100 active suppliers, commission sustainable, payout cadence trusted by suppliers |
| Year 3 | 80–85% | Platform is the default channel for Botswana tourism supply |

**Failure condition.** If owned share has not reached 15% by Month 6, the hybrid thesis is not working. At that point the honest options are to increase field-ops investment materially, or to accept that ArriveSuite is an aggregator and reposition. What is not an option is continuing to describe it as an inventory layer while it functions as a reseller — that is the outcome §18.2 forbids.

## 2.6.6 Regional Extension

The same infrastructure serves Namibia, Zambia and Zimbabwe. The content is country-specific; the engine, contracts, adapters and console are not.

**Nothing in v3.0 requires country-specific code**, and nothing in v3.0 requires country-specific tables either. Country scoping is a column (`properties.country_code`), not a schema fork — this is why the schema in §6 keeps `country_code` from Day 1 even though Botswana is the only market at launch.

---

# §3 Target Market & Personas

## 3.1 Launch Market

**Primary:** Botswana (BWP, English + Setswana).

Botswana is uniquely positioned as the launch market because:

- **Small and digitizable.** ~2,000 BTO-licensed tourism products nationally.
- **Distinctive inventory.** Okavango Delta, Chobe, Kalahari, Makgadikgadi, cultural tourism, MICE. Not replicable elsewhere.
- **Digital greenfield.** No dominant local OTA. No entrenched competitor. Mobile money now common.
- **Gateway to SADC.** Once operational in Botswana, the same infrastructure extends to Namibia, Zambia, Zimbabwe, and South Africa.

**Secondary (Phase 4+):** Namibia · Zambia · Zimbabwe · South Africa.

**Tertiary (Phase 5+):** International source markets (US, EU, UK, China, India, GCC).

## 3.2 Product Market Fit by Persona

ArriveSuite serves six distinct personas. Each has different needs, and the platform addresses each differently.

## 3.3 Persona P1 — Botswana Tourism Operator (Critical Persona)

This is the **most important persona** in the entire platform. Every other persona depends on this one.

**Profile:**

- Lodge owner, guesthouse manager, tour operator, activity provider, or camp manager
- Located in Maun, Kasane, Gaborone, Okavango, Chobe, Kalahari, or Makgadikgadi
- Business size: 4–50 rooms or 1–20 tours per day
- May have 3–50 staff
- Uses WhatsApp as primary business communication
- Manages bookings via paper calendar, WhatsApp, or a spreadsheet
- May have a bank account but not always a POS
- Speaks English and Setswana
- Trust is local and relationship-based

**Pains:**

- No digital presence beyond a Facebook page
- Cannot be found by international guests except through intermediaries
- Loses 25–35% margin to intermediaries (Booking.com, Viator, Expedia)
- Cannot easily manage availability or rates across channels
- Cash-flow constrained; cannot afford expensive PMS
- Cannot afford to build or maintain a website
- No way to accept international payments
- No way to reach out to past guests
- No visibility into who is booking, when, or why

**Desired outcomes:**

- More bookings, direct or through the platform
- Higher margin on each booking
- Less admin work, especially on confirmations
- Predictable payouts
- Visibility into performance
- Simple tools (WhatsApp-first)
- Support in Setswana and English

**How ArriveSuite addresses this persona:**

- **Extranet (light PMS)** — free tier, WhatsApp-native, works on any phone
- **WhatsApp integration** — suppliers confirm bookings, update availability, receive payouts via WhatsApp
- **Field onboarding** — ArriveSuite staff visit the property, set up the account, take photos, enter rates
- **Content production** — ArriveSuite produces photos, descriptions, itineraries for the supplier
- **Multi-channel distribution** — the same listing reaches B2C, B2B, corporate, WhatsApp, and OTA partners
- **Weekly payouts** — same day, BWP native, no FX exposure for the supplier
- **Performance visibility** — simple dashboard showing bookings, revenue, ratings
- **WhatsApp support** — a Botswana-based support team reachable on WhatsApp

**What this persona will never accept:**

- A complex web-only interface
- English-only
- **Hidden fees** — see FR-5.5.40; the FX buffer is never deducted from supplier payouts
- Slow payouts
- Being locked into a system they cannot leave — see §2.6.4, which is why rate parity enforcement was withdrawn

**Key metrics for this persona:**

- Time from first contact to first booking received
- Bookings received per month
- Average revenue per booking
- Payout timeliness
- Retention rate

## 3.4 Persona P2 — B2C Guest (Domestic)

**Profile:**

- Botswana resident or long-term visitor
- Books weekend getaways, family trips, corporate off-sites
- Pays in BWP via card or mobile money
- Uses WhatsApp as primary communication
- Values: clarity, fast checkout, local deals
- Pain: opaque pricing, unresponsive suppliers, no unified booking option

**How ArriveSuite addresses this persona:**

- B2C web + WhatsApp booking from Phase 2
- BWP first, USD/ZAR/EUR toggle
- Mobile money support (Phase 3)
- Clear pricing with tax breakdown
- Local language support (Setswana)
- Direct communication with suppliers

## 3.5 Persona P3 — B2C Guest (International Tourist)

**Profile:**

- Tourist booking a Botswana safari or Victoria Falls trip
- Comes from US, EU, UK, China, India, or GCC
- Pays in USD or EUR
- Values: trust, secure payment, English support, professional content
- Pain: "Is this real? Will the lodge honor it?"

**How ArriveSuite addresses this persona:**

- Professional B2C site with first-party content
- Trust signals: BTO verified and graded, reviews, secure payment
- English default, currency toggle (USD, EUR)
- Supplier vouchers guaranteed by ArriveSuite — valid because ArriveSuite is merchant of record on owned inventory (§1.1)
- Support in English via email and WhatsApp
- Payment via international cards — see §19.3 on 3-D Secure and foreign-card acceptance, which is an unresolved launch risk
- Botswana Verified badge for owned inventory

**Important:** International tourists are willing to pay more for confidence. ArriveSuite's brand, content and guarantee are worth a premium.

**v3.0 scoping:** the **web** is this persona's primary interface. WhatsApp is a support and notification channel for them, not the booking channel (§2.5.1).

## 3.6 Persona P4 — B2B Agent (Travel Agency)

**Profile:**

- Travel agency booking on behalf of clients
- Located in Botswana, SADC, or internationally
- Wants net rates, markup control, credit terms
- Values: margin, reliability, quick confirmation
- Pain: manual processes, no visibility into supplier availability

**Status: post-MVP.** v2.4 shipped this at Phase 5 (Week 9) while §5.6 — the section defining it — had never been authored. It is now Phase 4+ and specified in §5.6.

**How ArriveSuite will address this persona:**

- B2B agent portal with net rates
- Agent-specific markup in the pricing engine
- Credit limits and terms (net-15, net-30)
- Booking on behalf of clients
- Reporting on commission and volume
- WhatsApp for booking status
- API access for agencies with systems

**Sub-types:**

- **Local agents** — Botswana-based, book for domestic and outbound
- **SADC agents** — Namibia, Zambia, Zimbabwe, South Africa
- **International agents** — US, EU tour operators

## 3.7 Persona P5 — Corporate Buyer

**Profile:**

- Corporate travel manager or procurement officer
- Located in Gaborone or regional HQ
- Manages travel for employees
- Values: cost control, policy compliance, invoicing, reporting
- Pain: manual booking, no visibility, no policy enforcement

**Status: post-MVP.** The `corporate` realm is deliberately absent from the v3.0 MVP schema (§6.2) and from the RLS policy set (§6.12). See §17.3.

**How ArriveSuite will address this persona:**

- Corporate portal with policy engine
- Cost centers and approval workflows
- Monthly invoicing with cost-center breakdown
- Negotiated rates for corporate accounts
- SSO (SAML, OIDC)
- Employee self-service

**Example corporate buyers:** Debswana Mining · Gov BW (various ministries) · Banks (FNB, Stanbic, Absa) · Mining companies.

## 3.8 Persona P6 — Internal Operations Team

**Profile:**

- ArriveSuite staff
- Multiple roles: Reservations, Supplier Ops, Finance Ops, Support, Content Ops, Super Admin
- Values: efficiency, clear queues, one-click actions, shared visibility
- Pain: email chaos, no shared view, manual reconciliation

**How ArriveSuite addresses this persona:**

- Admin & Ops Console (§5.16)
- Role-specific dashboards
- Queue badges on nav
- Bulk actions
- Audit trail
- Real-time updates
- Keyboard shortcuts
- Command palette

## 3.9 Persona Interaction Map

```
┌──────────────────────┐
│ P1 — Botswana        │
│ Tourism Operator     │
│ (Critical)           │
└──────────┬───────────┘
           │ supplies inventory
           ▼
┌──────────────────────┐
│ ARRIVESUITE          │
│ Platform Engine      │
└──────────┬───────────┘
           │
   ┌───────┼────────┐
   ▼       ▼        ▼
  P2       P3      P4
  Local   Intl    B2B
  B2C     B2C     Agent
   │       │        │
   └───────┼────────┘
           ▼
       P5 — Corporate
       Buyer (post-MVP)

  (All served by P6 — Internal Ops Team)
```

## 3.10 Persona Priorities by Phase

| Phase | Primary Persona | Secondary |
|---|---|---|
| Phase 1 | P3 (Intl B2C, web) | P6 (Ops) |
| Phase 2 | P1 (Operator) | P2, P6 |
| Phase 3 | P2 (WhatsApp guest booking) | P1, P6 |
| Phase 4 | P6 (Ops hardening) | P1, P2 |
| Phase 5+ | P4 (Agent), P5 (Corporate) | — |

**Note:** P1 is the strategic focus from Phase 2 onward. Everything else exists to serve P1's inventory to the rest of the personas.

**v3.0 correction:** v2.4 made P3 the Phase 1 primary persona on the strength of sourcing alone — before any supplier, any content and any owned inventory existed. P3 is the *revenue* persona at launch. P1 is the *strategic* persona, and Phase 2 is where the strategy starts or fails.

## 3.11 Anti-Personas

Explicitly **not** served:

- **Budget backpackers** seeking hostels — not the Botswana market
- **Package tour buyers** — Botswana is FIT-heavy
- **Metasearch users** — ArriveSuite is not a comparison site
- **Enterprise travel agencies with proprietary GDS** — they won't switch
- **Crypto payment users** — not a Botswana market segment
- **Anyone looking for the cheapest price only** — ArriveSuite competes on trust and content

## 3.12 Persona Success Metrics

Targets are stated as **capacity-derived**, not aspirational. Every figure assumes staffing that §19.4 budgets.

| Persona | Metric | Year 1 Target |
|---|---|---|
| P1 — Operator | Active suppliers on platform | 100 |
| P1 — Operator | Avg bookings received/month | 8 |
| P1 — Operator | Payout timeliness | 100% within 1 business day of schedule |
| P2 — Local B2C | Bookings/month | 50 |
| P3 — Intl B2C | Bookings/month | 100 |
| P4 — Agent | Active agencies | post-MVP |
| P5 — Corporate | Active corporate accounts | post-MVP |
| P6 — Internal | Bookings processed/agent/day | 30 |
| P6 — Internal | Avg handle time per booking | <5 min |
| P6 — Internal | Support conversations handled/day | 40 |

**v3.0 correction.** v2.4 targeted 300 active suppliers and 50 active agencies in Year 1. Fifty agencies implies a B2B sales motion, support load and credit exposure for a team of one, and 300 suppliers implies a field organisation BWP 40,000 does not fund. Both are cut. See §19.4.

## 3.13 Persona Research Priorities

**These must be completed before Phase 2 gate review.** v2.4 listed them as research "before and during Phase 1" with no gate attached; they are the evidence base for the supplier onboarding funnel in §5.5.2, and without them the funnel is guesswork.

1. **Interviews with 30 Botswana operators** across Maun, Kasane, Gaborone, Okavango
2. **Interviews with 10 B2C guests** — mix of local and international
3. **Interviews with 5 B2B agents** — Botswana and SADC
4. **Field observation** — how do lodges actually operate day to day?

**Research artifacts:** persona profiles (above), journey maps per persona, jobs-to-be-done statements, pain quantifications.
