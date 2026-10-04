# §2.8 WhatsApp as a Transactional Interface, §5.3–§5.4 WhatsApp Functional Requirements

> ArriveSuite Requirements v3.0. Section numbering is stable across v2.4 → v3.0.
> v2.4 §2.5 (strategy) lives in `01-strategy.md`; §2.8 (transactional commerce), §5.3 and §5.4 are new.

---

# §2.8 WhatsApp as a Transactional Interface

## 2.8.1 The Transaction, Not the Message

v2.4's WhatsApp strategy (§2.5) described *messages*: confirmations, vouchers, two-way threads, command handling. It never described what happens when a WhatsApp conversation is the surface on which **money moves and inventory is committed**.

That gap matters because the two are different engineering problems. Sending a template is a fire-and-forget API call with a delivery receipt. Completing a sale is a distributed transaction across a guest's identity, a signed quote, a payment intent, an availability row lock, a booking state machine (§9.1) and a ledger posting — and it has to survive the guest closing the app halfway through.

**v3.0 principle.** A WhatsApp conversation is a **front end to the same booking engine** that the web app calls. It introduces no new business logic, no alternate pricing path, and no alternate booking path. If WhatsApp can do something the web app cannot, that is a defect.

This has three concrete consequences:

1. **Every WhatsApp booking carries a `source_interface = 'whatsapp'` value on the booking (§6.4) and is otherwise identical to a web booking.** It resolves through the same pricing engine, writes the same immutable snapshot, enters the same state machine.
2. **The web app remains the system of record.** Any flow that requires something not expressible in a chat message — a document upload, a terms acceptance with a scrollbar, a comparison table, a payment that needs 3-D Secure step-up — links out to the web rather than degrading into a clumsy chat sequence.
3. **The 24-hour customer service window is treated as a UX deadline, not a platform fact.** Meta's window governs what can be *sent*. It does not govern what can be *committed*. Session state is persisted server-side (§2.8.5) so a guest can resume on the web at any point.

## 2.8.2 Capability Ladder and Phase Gate

Four capabilities, in dependency order. Each has an explicit entry gate, because shipping the fourth without the third is how platforms end up with autonomous agents taking money.

| # | Capability | What it is | Entry gate | Phase |
|---|---|---|---|---|
| L1 | **Notification** | Outbound transactional templates. Booking confirmed, voucher, payment receipt, supplier action required, payout sent. | Meta business verification + display-name approval. Template approval per §2.8.4. | 1 |
| L2 | **Supplier command** | Inbound deterministic commands. Confirm, decline, availability, rate, payout receipt. Authorization required. | L1 + §5.4 shipped + supplier number mapped | 2 |
| L3 | **Guest guided flow** | Menu-driven, deterministic, stateful booking flow with web fallbacks. | L1 + §5.3 shipped + identity model (§5.3.2) | 2 (domestic P2 only) |
| L4 | **Guest natural language + payment** | LLM parsing of search and modification requests; payment via link. | L3 + evaluation harness passing + device-matrix verification (§19.3) + staffed escalation queue (§19.6) | 3 |

**Deliberately not on the ladder:** autonomous agent action (booking without guest confirmation), LLM-initiated refunds or compensation, LLM-driven supplier price changes without the §5.4 confirmation gate, and any agent that can talk to a guest about a failed booking it did not understand. Each is deferred past Year 1. The reasons are staffing (§19.6) and the fact that a confident wrong answer to a paying guest is more expensive than a "I don't understand that — opening a ticket."

**L3 is domestic-first (one of the four v3.0 defaults).** Domestic guests (P2) are on WhatsApp, pay in BWP, book short-lead local inventory, and are the population for whom a chat funnel genuinely outperforms a website. International guests (P3) discover and research on the open web and hit a card-authorization wall inside WhatsApp's in-app browser. L3 ships for P2; L4 for P2; international guests are routed to the web by design.

## 2.8.3 Number and BSP Model

v2.4 named Twilio, 360dialog and Wati in three different sections and never chose. The choice has real consequences: conversation pricing, template approval workflow, and who owns the number.

**v3.0 decision (ADR-0019).** Direct **Meta Cloud API** for Phase 1–2. No BSP at launch.

Rationale: a BSP's value is a management UI, conversation-history retention and support — none of which a two-person team needs at 2,000 conversations/month, and all of which cost margin on every conversation. Direct API is free per-message inside the window and has no per-conversation surcharge.

**v3.0 decision (ADR-0018).** **Two numbers**, both registered to the business (not to an individual):

| Number | Audience | Template set | Notes |
|---|---|---|---|
| **B2C guest** | Guests and prospects | Transactional + a narrow marketing set | Free-form replies only inside the 24h window |
| **Supplier operations** | Onboarded suppliers | Transactional + operational commands | Separate quality rating; separate template history |

The reason for two numbers is that Meta scores template quality and messaging limits **per sender ID**. Mixing guest marketing with supplier operational traffic on one sender ID means a bulk-ish guest message degrades the number suppliers depend on for booking confirmations. Suppliers are persona P1 (§3.3) — the critical persona — and their channel gets its own reputation budget.

**BSP evaluation trigger (Phase 3 review).** Evaluate a BSP when *either*:

- Conversations exceed **5,000/month** (BSP management UI and human-in-the-loop tooling start to pay for themselves), **or**
- **3 or more template rejections** in any rolling 30-day window (a content/operations problem that tooling will not fix).

Migration is additive because all messaging sits behind the `WhatsAppProvider` adapter interface (§12.1). No business logic imports a BSP SDK.

**Consequence to accept explicitly:** direct API requires Meta business verification and display-name review before sending to any number outside the test list. This has multi-day lead time and is a **Phase 0 gate item** (§17.2), not a Phase 1 surprise.

## 2.8.4 Template Register and Approval Pipeline

Every outbound WhatsApp message in Phase 1 is an approved template. There is no free-form outbound except inside the 24-hour window (§2.8.5).

**The v3.0 template register.** These are the transactional templates for MVP. `{{ }}` placeholders are filled server-side from booking data; **no placeholder is ever populated from unsanitised user input** (a guest name containing template-like syntax is the obvious injection vector).

| ID | Category | Trigger | Audience | Placeholders |
|---|---|---|---|---|
| `ars_booking_confirmed` | UTILITY | Booking reaches `confirmed` | Guest | `{{guest_first_name}}`, `{{booking_ref}}`, `{{product_name}}`, `{{total}}`, `{{currency}}`, `{{voucher_url}}` |
| `ars_booking_submitted` | UTILITY | On-request booking created | Guest | `{{guest_first_name}}`, `{{booking_ref}}`, `{{product_name}}`, `{{supplier_name}}` |
| `ars_booking_ticketing` | UTILITY | Booking reaches `ticketed` | Guest | `{{guest_first_name}}`, `{{booking_ref}}`, `{{ticket_ref}}`, `{{voucher_url}}` |
| `ars_booking_cancelled` | UTILITY | Booking reaches `cancelled` | Guest | `{{guest_first_name}}`, `{{booking_ref}}`, `{{refund_amount}}`, `{{currency}}`, `{{refund_eta}}` |
| `ars_booking_refunded` | UTILITY | Refund captured | Guest | `{{booking_ref}}`, `{{refund_amount}}`, `{{currency}}`, `{{method}}` |
| `ars_payment_received` | UTILITY | Payment captured | Guest | `{{booking_ref}}`, `{{amount}}`, `{{currency}}`, `{{method}}` |
| `ars_payment_failed` | UTILITY | Payment attempt failed | Guest | `{{booking_ref}}`, `{{reason}}`, `{{retry_url}}` |
| `ars_payment_action_required` | UTILITY | Payment needs guest action | Guest | `{{booking_ref}}`, `{{amount}}`, `{{currency}}`, `{{pay_url}}`, `{{expires_at}}` |
| `ars_itinerary_reminder` | UTILITY | T-7 and T-1 | Guest | `{{guest_first_name}}`, `{{booking_ref}}`, `{{date}}`, `{{time}}`, `{{meeting_point}}` |
| `ars_supplier_action_required` | UTILITY | On-request booking reaches supplier | Supplier | `{{supplier_name}}`, `{{booking_ref}}`, `{{product_name}}`, `{{dates}}`, `{{pax}}`, `{{gross}}`, `{{currency}}`, `{{respond_by}}` |
| `ars_supplier_confirmed` | UTILITY | Supplier confirms | Supplier | `{{booking_ref}}`, `{{payout_amount}}`, `{{payout_date}}` |
| `ars_supplier_declined` | UTILITY | Supplier declines | Supplier | `{{booking_ref}}`, `{{reason}}` |
| `ars_supplier_availability_confirm` | UTILITY | Echo a proposed availability change | Supplier | `{{property_name}}`, `{{unit_label}}`, `{{count}}`, `{{date_range}}`, `{{impact_line}}` |
| `ars_supplier_rate_confirm` | UTILITY | Echo a proposed rate change | Supplier | `{{property_name}}`, `{{unit_label}}`, `{{new_rate}}`, `{{old_rate}}`, `{{pct_change}}`, `{{date_range}}`, `{{plans_affected}}`, `{{dates_affected}}` |
| `ars_supplier_payout` | UTILITY | Payout released | Supplier | `{{supplier_name}}`, `{{amount}}`, `{{currency}}`, `{{period}}`, `{{payout_ref}}`, `{{bank_hint}}` |
| `ars_supplier_payout_reminder` | UTILITY | T-1 before payout | Supplier | `{{amount}}`, `{{currency}}`, `{{payout_date}}` |
| `ars_supplier_stale_inventory_25d` | UTILITY | No inventory update at 25 days | Supplier | `{{days_stale}}`, `{{property_count}}`, `{{update_url}}` |
| `ars_supplier_stale_inventory_29d` | UTILITY | No inventory update at 29 days | Supplier | `{{days_stale}}`, `{{property_count}}`, `{{update_url}}` |
| `ars_support_ticket_created` | UTILITY | Escalation created | Guest | `{{ticket_ref}}`, `{{eta}}` |
| `ars_recovery_booking_abandoned` | UTILITY | Quote expired with no booking | Guest | `{{booking_ref}}`, `{{product_name}}`, `{{resume_url}}` |

**Pipeline requirements.**

- Every template has an **EN** version from Day 1 and an **`en_BW`** (Setswana) version. Setswana text is drafted by a human speaker, not machine-translated, and is reviewed before submission. A wrong translation in a payment message is worse than no translation — see §13.4.
- Category is chosen honestly. Booking and payment messages are `UTILITY`; they are not marketing. Meta rejects and penalises category misuse, and `MARKETING` messages are billed at a higher rate.
- Approval status per template and per language is tracked in `whatsapp_templates` and surfaced in the Admin Console (§5.16). **A template that is `PENDING` in Meta cannot be sent** — the send path rejects it rather than firing and failing.
- Every send records `message_id`, template ID, language, category, provider status, and failure reason. Delivery failures feed the health metrics (§5.7.4).
- Marketing templates require explicit opt-in from the guest and are never sent to a guest who has replied `STOP` (§5.3.3).

**Approval lead time is a planning input.** Meta template review is typically hours but is not guaranteed. The Phase 1 launch checklist (§17.4) includes submitting all L1 templates during Phase 0 so they are approved before the first booking is taken.

## 2.8.5 Session, Window and Conversation State

| Concept | Behaviour |
|---|---|
| **24-hour customer service window** | Opens on any inbound message from the guest. Inside it, ArriveSuite may send free-form replies. Outside it, only approved templates. |
| **Service window expiry** | If a booking is in progress and the window expires, the next message to the guest is a template with a resume link (`ars_recovery_booking_abandoned`), not an improvised free-text message. |
| **Flow state** | Persisted server-side against the verified guest principal and the booking/quote (§6.4 `conversation_sessions`). Survives window expiry, app reinstall, and channel switch. |
| **Channel switch** | A guest who starts in WhatsApp can finish on the web and vice versa. `source_interface` on the booking records the *committing* channel; the conversation thread spans both. |
| **Threading** | One WhatsApp thread per (guest principal, business number). Booking messages are sub-linked to the booking via `message_participants` context, not via separate threads per booking — a guest should not lose conversation history because they booked twice. |
| **Message ordering** | Inbound and outbound messages are sequenced by provider timestamp with a monotonic sequence for tie-breaks. Out-of-order delivery is tolerated for display; the flow state machine (§5.3.4) is the authority on what has been done. |

**Free-form outbound is deliberately constrained.** Inside the window ArriveSuite may reply with text, but every free-form reply to a guest that concerns money, inventory or a booking state is generated from a template with variables filled — never improvised. There is no generative outbound guest messaging anywhere in v3.0.

## 2.8.6 Cost Model

Meta Cloud API pricing is per-message, per-category, with country-rate cards that change. v3.0 does not hard-code a per-conversation cost; it models the *shape*.

| Phase | Est. conversations/month | Templates/booking | L1 send cost as % of B2C commission |
|---|---|---|---|
| 1 | ~500 | 3 | ~1–2% |
| 2 | ~1,200 | 4 | ~1–2% |
| 3 | ~2,000 | 5 | ~2–3% |
| Year 2 | ~20,000 | 5 | ~2–3% |
| Year 3 | ~60,000 | 5 | ~2–3% |

**This is a rounding error against a 5–8% sourced commission or 15–25% owned commission, and it is not a reason to choose a BSP.** It *is* a reason to keep the message count per booking low, which is why the register above is 20 templates rather than 40 and why `ars_itinerary_reminder` is T-7 and T-1 only.

The exception worth watching is a BSP's per-conversation fee layered on top of Meta's per-message fee. At 60,000 conversations/month a per-conversation charge becomes material, which is why the BSP trigger in §2.8.3 is a volume threshold rather than a preference.

## 2.8.7 Quality, Limits and Account Health

Meta messaging limits are **tiered per sender ID** (1,000 → 10,000 → 100,000 → 100,000+ conversations/day), and tiers are earned on a rolling quality basis. At Year-1 volumes (§15.4: 2,000 conversations/month) the platform sits in the lowest tier with enormous headroom.

What this means in practice:

- **No tier-up management is required for Year 1.** Do not build a tier-monitoring feature.
- **Quality degradation is the real risk.** A rising block or spam-rate percentage, driven by guests replying `STOP` and not being honoured, or by marketing templates sent without opt-in, is the failure mode to prevent. Honouring `STOP` immediately (FR-5.3.3) is the mitigation, and it is a requirement rather than a nicety.
- **Two numbers isolate the blast radius.** Guest marketing degradation does not affect supplier confirmations (§2.8.3).
- **Alerts.** Sender quality below 90% for 24h → P2. Below 80% or any template rejection in a 7-day window → P1. Any `FORBIDDEN`/`RATE_LIMITED` spike → P1.

## 2.8.8 Fallback Channels

WhatsApp is the primary interface, not the only one. Every transactional event has a second channel so a messaging outage cannot become a fulfilment outage.

| Event | Primary | Fallback |
|---|---|---|
| Guest booking confirmation | WhatsApp | Email (Resend) + web booking detail |
| Guest voucher / ticket | WhatsApp + PDF link | Email attachment |
| Payment failure requiring action | WhatsApp | Email + web payment retry |
| Supplier action required | WhatsApp | Email + extranet dashboard |
| Supplier payout | WhatsApp | Email statement PDF |
| Guest support request | WhatsApp | Web support form + email |

Rule: **the extranet dashboard and the web booking detail page are always authoritative.** A guest or supplier who has received nothing over WhatsApp must still be able to find out what happened. SMS (local BW provider) exists as a third channel for the highest-consequence events only — payment action required, supplier action required.

---

# §5.3 WhatsApp Guest Booking

> **New in v3.0.** Functional requirements for the guest-facing WhatsApp interface. Phase-gated per §2.8.2.

## 5.3.1 Purpose

Define the guest-facing WhatsApp booking capability: who the guest is, what they can do, what the system can parse, and where the flow hands off to the web or to a human.

**Scope boundary.** This section covers guest booking over WhatsApp. Supplier operations are §5.4. Strategy is §2.5. Transactional-commerce principles are §2.8.

## 5.3.2 Identity and the Guest Principal

**This is the fix for the v2.4 contradiction.** v2.4 FR-5.15.20 put "user accounts" out of scope for B2C ("guest checkout default"), while §6.12 scoped `bookings` RLS to `realm = 'customer'` — a guest with no account could own no rows, so every WhatsApp or anonymous web booking had nowhere to live. Both cannot hold.

**v3.0 resolution.** The WhatsApp phone number *is* the guest principal.

- A first inbound WhatsApp message creates a lightweight `accounts` row with `realm = 'customer'`, `auth_method = 'whatsapp_otp'`, `phone_e164` set, and **`email` and `password_hash` both NULL**.
- The `accounts.email` unique constraint becomes a **partial** unique index on `WHERE email IS NOT NULL`, and a unique index is added on `phone_e164`. This is a required schema migration — see §6.17.
- The number is OTP-verified before it is trusted as an identity (§5.3.3). An unverified inbound message creates a *conversation* but not a *principal*; no booking can be committed against it.
- RLS on `bookings`, `booking_guests` and `message_threads` therefore works unchanged: the guest principal exists, so `account_id = current_setting('app.account_id')` matches. No anonymous-access policy is needed, and none is granted.
- A guest who later creates a web account with the same email **links** to the existing principal rather than creating a second one. Booking history stays whole.

This is the right model on the merits, not just for RLS: for persona P2 (§3.4) the phone number is the durable identifier they will always have, and an email-or-nothing account model puts a wall in front of the domestic audience WhatsApp is supposed to serve.

## 5.3.3 Authentication and Opt-Out

**FR-5.3.1 — Number verification.** A guest's phone number is verified by one-time code before it can be used to commit a booking, download a voucher, or see booking details. Code is 6 digits, single-use, 5-minute TTL, max 5 attempts per number per hour, rate-limited per number and per IP.

**FR-5.3.2 — Verification transport.** The code is sent over WhatsApp by template (`whatsapp_otp` token purpose) when the guest is messaging us, and by SMS when the guest initiated on the web. The same code works on both channels — this is what lets a guest cross the channel boundary mid-flow.

**FR-5.3.3 — `STOP` is honoured immediately.** `STOP`, `STOPALL`, `UNSUBSCRIBE` or `QUIT` in any language disables all non-essential messaging for that number **at the moment the message is received**, before any other processing. Transactional messages about an **existing paid booking** (confirmation, cancellation, refund, action-required) continue, because suppressing those harms the guest; marketing and promotional messages never resume without explicit re-opt-in. The state is written before the reply is sent, so no race can slip a marketing message through.

**FR-5.3.4 — Re-consent.** A `STOP`ped number may re-consent by replying `START` or by ticking the marketing checkbox on the web. Consent is timestamped, source-tagged, and revocable. Consent state is queryable in the Admin Console.

**FR-5.3.5 — No account enumeration.** A verification attempt against an unknown number creates the same observable response as one against a known number. Error messages do not disclose whether a number has a booking history.

**FR-5.3.6 — Minimum guest identity.** A booking requires: verified phone number, full name, and email. Email is required because it is the voucher delivery channel and the fallback for every WhatsApp message (§2.8.8). A guest without an email is offered web checkout instead — a WhatsApp flow never produces a booking that can only be reached through a chat thread.

## 5.3.4 Command Set

**Phase 2 commands are deterministic, exact-match, case-insensitive, and documented in `help`.** No interpretation of any kind.

| Command | Aliases | Action |
|---|---|---|
| `hi` / `hello` / `molo` | — | Start / resume a conversation |
| `help` | `?` | Show the current command set |
| `search` | — | Begin the guided booking flow |
| `status` | — | List recent bookings with state |
| `status ARS-2026-000123` | — | One booking: state, dates, total, voucher link |
| `voucher ARS-2026-000123` | — | Re-send the voucher link |
| `cancel ARS-2026-000123` | — | Start cancellation (§5.20) |
| `pay ARS-2026-000123` | — | Re-send the payment link if unpaid |
| `agent` | `human`, `speak to someone` | Escalate to a human (§5.3.8) |
| `stop` | `stopall`, `unsubscribe`, `quit` | Opt out of non-essential messaging |
| `start` | — | Re-consent |

**FR-5.3.7 — Unrecognised input is acknowledged, not guessed.** A message that matches no command receives a reply listing the available commands plus the web-booking link. The system does not guess.

**FR-5.3.8 — Booking references in commands are validated.** An unknown or malformed reference returns "I couldn't find that booking" and never leaks whether it exists for another principal.

## 5.3.5 Guided Booking Flow (Deterministic)

A menu-driven flow. Every step is a numbered option list, so it works on a feature phone and is fully deterministic.

```
1. Vertical          → [ Stay ] [ Tour ] [ Transfer ] [ Activity ]
2. Destination       → text input, matched against cities/properties; suggestions as a list
3. Dates             → "next weekend" is NOT parsed in Phase 2;
                       system sends a date list / link to the web date picker
4. Guests            → [1 adult] [2 adults] [2+1 child] [group] ...
5. Results           → top 3 as a numbered list: name, price/night, total, "Botswana Verified" tag
6. Choose             → numbered selection
7. Confirm            → full summary + total; reply YES to proceed
8. Details            → name, email (link or template-driven collection)
9. Pay                → PayTabs link (single-use, 15-minute TTL)
10. Confirmed          → reference, voucher link, WhatsApp notification, optional web itinerary
```

**FR-5.3.9 — Every step is server-side stateful.** Step 1 through step 10 are persisted against the verified guest principal (§6.4). A guest who closes WhatsApp mid-flow resumes at the same step, in WhatsApp or on the web.

**FR-5.3.10 — Confirmation is explicit and last.** The booking is committed only on an explicit `YES` at step 7, and only after the signed quote (§5.15.8) has been re-verified server-side. Nothing is committed earlier in the flow.

**FR-5.3.11 — Flow expiry.** An in-progress flow expires 24 hours after last interaction. On expiry the guest receives `ars_recovery_booking_abandoned` with a resume link; nothing was committed.

**FR-5.3.12 — Price is never computed in the flow.** Each step re-quotes server-side and displays the engine's output verbatim, including the expiry timestamp. A price is never assembled from message text.

**FR-5.3.13 — Steps that chat cannot do honestly are linked, not faked.** Date-range selection with a price-per-day calendar, guest-count validation against rate-plan rules, terms acceptance, and 3-D Secure step-up all link to the web. The chat message says which step is being handed over and why.

## 5.3.6 Natural-Language Parsing (Phase 3, Gated)

**This is the only LLM surface in v3.0.** It is gated on three things, all of which are gates, not aspirations:

1. **An evaluation harness exists** with a labelled set of at least 200 real utterances per supported language, and the parser meets an agreed accuracy threshold on it.
2. **A staffed escalation queue exists** (§19.6). Unparsed input goes to a human, not to a guess.
3. **Confidence thresholds are enforced** below `handoff_threshold`, the system escalates rather than proceeding.

**FR-5.3.14 — LLM scope.** The model parses intent and extracts structured parameters only. It never returns a price, never confirms a booking, never issues a refund, and never changes supplier inventory.

**FR-5.3.15 — Structured output.** The model must return a validated structured object against a Zod schema. Output that does not validate is discarded, not coerced.

**FR-5.3.16 — Confidence and escalation.** Below the configured threshold, on an unsupported intent, or on a request above the value threshold (§5.3.17), the system replies that it is passing the guest to a person and creates a support ticket (§5.9).

**FR-5.3.17 — Value threshold.** Above **BWP 5,000** equivalent, a parsed request is always confirmed back to the guest before any action is taken, regardless of confidence. The LLM proposes; the guest disposes.

**FR-5.3.18 — Prompts containing guest PII are not persisted.** Transient only. Nothing sent to the model is written to `integration_payloads` beyond a redacted request/response shape (no message body, no name, no email, no phone). Provider-side zero-retention settings are configured and recorded as evidence (§15.7).

**FR-5.3.19 — Model changes are controlled.** The model identifier and prompt version are recorded against every parsed message, so a regression can be traced. A model or prompt change requires the evaluation harness to pass before promotion.

**FR-5.3.20 — Setswana is not machine-translated on the parsing path.** A Setswana utterance that cannot be parsed with high confidence escalates. Guessing in a language the team cannot verify is how a guest ends up with the wrong lodge.

**FR-5.3.21 — No autonomous outbound.** The model never initiates a message. All outbound guest messaging is a template or a menu (§2.8.5).

## 5.3.7 Message Rendering and Accessibility Constraints

WhatsApp's renderer is not a document the platform controls. v2.4 promised WCAG 2.1 AA (§15.6) without distinguishing surfaces it can influence from surfaces it cannot.

**FR-5.3.22 — Plain text by default.** Booking and transactional messages are plain text. WhatsApp does not render Markdown reliably and formatting characters leak into SMS fallback and into the guest's notification preview.

**FR-5.3.23 — No tables.** Tabular data (price breakdowns, itinerary days, multiple bookings) is either reformatted as a labelled list or linked to the web. Column alignment does not survive message rendering.

**FR-5.3.24 — Link-first for documents.** Vouchers, tickets, statements and itineraries are delivered as a signed, single-use-expiring link plus the reference. Not as attachments, not as long URLs pasted inline.

**FR-5.3.25 — Message length.** Transactional messages stay under approximately 900 characters so they preview usefully in a notification. Longer content is linked.

**FR-5.3.26 — Accessibility position.** WhatsApp-rendered content is **exempt** from the §15.6 WCAG 2.1 AA obligation, because the platform does not control the client renderer. The exemption is scoped precisely: the moment the guest is handed to an ArriveSuite-rendered surface (the web app, the extranet, the linked document viewer), full WCAG 2.1 AA applies to that surface. Every WhatsApp flow that hands over must therefore hand over to an accessible page, and that page is the accessibility obligation.

**FR-5.3.27 — No accessibility-critical information only in WhatsApp.** Booking references, amounts, and action deadlines are available on the web booking detail page. A guest who cannot use the chat interface is not excluded from their own booking.

**FR-5.3.28 — Language.** Template language follows the verified principal's preference (EN or `en_BW`), falling back to English. Menu commands accept English and Setswana equivalents.

## 5.3.8 Payment over WhatsApp (Phase 3, Gated)

**FR-5.3.29 — PayTabs link only.** The system issues a single-use PayTabs payment link. ArriveSuite never handles card data in any channel (§4.8.1).

**FR-5.3.30 — Link properties.** Single-use; 15-minute TTL; amount fixed server-side and not editable by the recipient; HMAC-signed; bound to the quote and the verified principal.

**FR-5.3.31 — Failure handling.** Three consecutive failures on the same booking raises a P2 alert and offers a web payment route plus a support ticket. Repeated failure is a signal, not a retry loop.

**FR-5.3.32 — Mobile money.** Orange Money / MyZaka payment links are Phase 3 and gated on PayTabs confirming operator support. Not assumed.

**FR-5.3.33 — Gate.** This section does not ship until the device-matrix verification in §19.3 passes: WhatsApp in-app browser return-URL handling and 3-D Secure step-up verified on current Android and iOS, on both the guest and supplier numbers. This is why L4 is Phase 3 and not Phase 2.

## 5.3.9 Handoff and Escalation

**FR-5.3.34 — Escalation triggers.** Any of: the `agent` command; unparsed input; booking value above threshold; an LLM confidence below threshold; a guest expressing dissatisfaction (explicit keyword set or three consecutive failures); any flow requiring a decision the system is not authorised to make.

**FR-5.3.35 — Escalation creates a ticket.** A support ticket (§5.9) is created with the full conversation context, the verified principal, the booking reference if any, and the trace ID. The guest receives `ars_support_ticket_created` with a reference and an expected response time (§5.9.4).

**FR-5.3.36 — The conversation continues.** The WhatsApp thread stays attached to the ticket and is visible in the Admin Console (§5.16.10). An agent replying in the console sends into the same thread. The guest does not have to restate anything.

**FR-5.3.37 — Graceful failure.** If messaging is unavailable, the guest can complete the identical booking on the web. Every WhatsApp flow has a web equivalent; none of them is the only path.

## 5.3.10 Acceptance Criteria

Phase 2 (§5.3 L1 + L3) is complete when:

- [ ] A first inbound WhatsApp message creates a guest principal with a verified phone number and NULL email/password, and RLS works without an anonymous policy
- [ ] `STOP` suppresses non-essential messaging immediately and is provable in a test
- [ ] All L1 templates submitted, approved, and tracked per language; a `PENDING` template cannot be sent
- [ ] A guest completes a booking end-to-end via the guided menu flow (search → select → confirm → pay → voucher)
- [ ] The flow is resumable in WhatsApp and on the web, across the 24-hour window
- [ ] An expired flow commits nothing and sends the recovery message
- [ ] `status`, `cancel`, `voucher` and `pay` work against a real booking
- [ ] Every flow step has a web equivalent; disabling WhatsApp does not remove any booking capability
- [ ] Fallback channels verified: a simulated WhatsApp outage still delivers confirmation and voucher by email
- [ ] Setswana templates present and human-reviewed

Phase 3 (§5.3 L4) additionally requires:

- [ ] Evaluation harness with ≥200 labelled utterances passes the agreed threshold, in EN and `en_BW`
- [ ] Escalation queue staffed with a published response SLA
- [ ] Value-threshold confirmation enforced and tested
- [ ] No prompt or PII persisted; redaction verified by inspection of `integration_payloads`
- [ ] Device-matrix verification of in-app-browser payment return and 3-D Secure passed (§19.3)

---

# §5.4 WhatsApp Supplier Operations

> **New in v3.0.** Functional requirements for the supplier-facing WhatsApp interface. Phase 2.

## 5.4.1 Purpose

Define the supplier-facing WhatsApp interface: how a supplier is identified and authorised, which actions can be taken by message, and which actions are confirmation-gated because they change live inventory or money.

**This is the load-bearing interface for persona P1** (§3.3). §2.5.1 makes the commitment: most suppliers will work over WhatsApp, not the extranet. If the WhatsApp path is worse than the extranet, P1 will use the extranet and only for things the extranet forces.

## 5.4.2 Supplier Principal and Authorisation

**FR-5.4.1 — Number-to-supplier mapping.** A `supplier_accounts.phone_e164` is mapped to the supplier's operational number at onboarding (Stage 4, §5.5.2). Incoming messages from that number resolve to the supplier and the default acting user.

**FR-5.4.2 — Multi-user authorisation.** A supplier with multiple users (§5.5.3 FR-5.5.3) receives commands from any mapped number, but the acting user is resolved from the number and every action is attributed to that user. Delegation scope is enforced (§5.5.4 FR-5.5.4): a Manager scoped to Property B cannot act on Property A via WhatsApp either.

**FR-5.4.3 — Unknown number.** A message from an unmapped number receives a neutral reply ("this number is not registered with a supplier account") and creates a conversation record for human review. It never reveals whether a supplier exists, never accepts commands, and never changes state.

**FR-5.4.4 — Property disambiguation.** When a supplier has multiple properties or a property has multiple room types, every command that names one must resolve unambiguously or the system asks which, with a numbered list. Guessing is not permitted.

## 5.4.3 Booking Commands

| Command | Behaviour |
|---|---|
| `CONFIRM <ref>` | Confirm an on-request booking (§9.1). |
| `DECLINE <ref> <reason>` | Decline with mandatory free-text reason. |
| `STATUS <ref>` | Current state, dates, pax, gross, commission, net. |
| `DATES <ref>` | Stay dates or departure date. |

**FR-5.4.5 — Booking alerts are actionable and time-bounded.** The `ars_supplier_action_required` template states the response deadline explicitly. The deadline comes from the rate plan's confirmation SLA (default 24 hours, §5.5.8 FR-5.5.30) and is displayed to the supplier as a date and time, not as a vague "within 24 hours".

**FR-5.4.6 — SLA breach is visible to the supplier.** At 50% and 100% of the SLA the supplier receives a reminder naming the booking and the remaining time. Breach escalation to ArriveSuite ops is the platform's problem, not an argument with the supplier.

**FR-5.4.7 — Decline is not a black hole.** A declined booking returns the guest to search with the supplier's reason surfaced. On owned inventory ArriveSuite is merchant of record (§1.1), so the guest's remedy is an immediate refund or rebooking, not a dispute between guest and supplier (§5.20).

**FR-5.4.8 — Late confirmation is refused honestly.** Confirming after the SLA has expired and the booking has auto-expired returns "that booking has expired" and offers a fresh search. It does not resurrect a dead booking.

## 5.4.4 Availability Commands

| Command | Behaviour |
|---|---|
| `AVAIL <property> <unit> <n> units <from>-<to>` | Set available units for a date range. |
| `BLOCK <property> <unit> <from>-<to> <reason>` | Stop-sell a date range. |
| `OPEN <property> <unit> <from>-<to>` | Release a block. |

**FR-5.4.9 — Availability changes are confirmation-gated with an impact statement.** Every availability mutation is preceded by an echo containing the property, the unit, the count, the date range, and a plain-language impact line — including the case where the change **reduces** availability below units already sold. Example:

> Set Xigera Water Suite to 3 available units, 20–25 June 2026.
> This sells out 1 unit currently held for walk-ins.
> Reply YES to apply, or send a correction.

**FR-5.4.10 — Overbooking is refused with a specific message.** If the requested `available_units` is below `booked_units` for any date in the range, the command is rejected, the conflicting dates are listed, and the safe alternative (block from the next free date, or increase physical capacity) is offered. The system never allows a supplier to talk itself into an overbooking. See §5.23.

**FR-5.4.11 — Confirmation token expires.** A pending availability confirmation expires after 30 minutes or when the supplier sends any other command, whichever is first.

**FR-5.4.12 — Availability writes are atomic and audited.** Applied under row lock per date (§5.23.4), with an `audit_events` row recording actor, number, parsed intent, confirmed payload, before and after values.

**FR-5.4.13 — No cross-date partial application.** A range change is all-or-nothing. If any date in the range conflicts, nothing is written. v2.4's "last-write-wins" conflict resolution (§5.5.6 FR-5.5.21) is withdrawn — see §5.23.2.

## 5.4.5 Rate Commands

| Command | Behaviour |
|---|---|
| `RATE <property> <unit> <amount> <from>-<to>` | Propose a rate for a date range. |
| `SEASON <property> <unit> <season> <amount> <from>-<to>` | Propose a seasonal rate. |
| `CLOSE <property> <from>-<to>` | Stop selling all room types for a range. |

**FR-5.4.14 — Rate changes are confirmation-gated with full impact disclosure.** The echo must state: property, unit, new rate, current rate, percentage change, date range, **the number of rate plans affected, and the number of dates affected**. Example (§2.5.7 Scenario 3):

> Proposed: Xigera Water Suite, BWP 12,500/night, 1–31 July 2026.
> Current: BWP 11,000/night (+13.6%).
> Applies to 4 rate plans, 31 dates. Reply YES to apply.
> This changes a live price and may affect bookings already taken under the old rate.

**v3.0 correction.** v2.4's rate-change example had no confirmation step, no disclosure of what would change, and no signal that a live price was about to move. Rate is the single highest-consequence action a supplier can take over WhatsApp, and it is the action most likely to be sent by someone who does not understand what a "rate plan" is. Both gates now exist.

**FR-5.4.15 — Booked business is protected.** Reducing a rate below the net rate of an existing confirmed booking does **not** trigger a refund or a re-price (a confirmed booking is never re-priced — §18.2). The system states how many confirmed bookings were taken under the higher rate and that they are unaffected.

**FR-5.4.16 — Rate changes are versioned and reversible.** Applied rate changes write an `audit_events` row with before and after, and can be reverted from the extranet. Reverting a WhatsApp-applied change from the web is allowed; the audit trail notes the channel difference.

## 5.4.6 Payout Commands

| Command | Behaviour |
|---|---|
| `PAYOUTS` | Recent payouts with amount, period, reference, status. |
| `RECEIVED <payout_ref>` | Confirm receipt of a payout. |
| `STATEMENT <month>` | Request a statement PDF for a month. |
| `DISPUTE <payout_ref> <reason>` | Raise a payout dispute (§5.18.6). |

**FR-5.4.17 — Payout notification includes the arithmetic.** The `ars_supplier_payout` message states amount, currency, period, reference, destination hint, and — on request — the breakdown of gross, commission and adjustments. P1 will not accept a figure they cannot reconcile (§3.3, FR-5.5.40).

**FR-5.4.18 — `RECEIVED` is an acknowledgement, not a settlement.** It records that the supplier confirms receipt. It does not close the payout in the ledger; that requires the bank reconciliation to match (§5.17.6). This distinction matters when a supplier says they never received funds.

**FR-5.4.19 — Disputes over WhatsApp enter the same queue as web disputes.** They create a Finance Ops dispute with the conversation attached. WhatsApp is not a lower-quality path into support.

## 5.4.7 Support over WhatsApp

**FR-5.4.20 — Dedicated supplier support number.** The supplier operations number (§2.8.3) is the support channel. Business hours are published; the response target is 2 hours in business hours (§5.5.13 FR-5.5.54).

**FR-5.4.21 — Category inference.** The system proposes a support category from the message (§5.5.13) and the supplier can correct it. Category drives routing and SLA (§5.9.4).

**FR-5.4.22 — Self-serve before human.** Rate, availability, and payout *questions* (not changes) return the answer from the knowledge base first, with an "ask a person" path. This is a large share of P1's messages and none of it needs a human.

**FR-5.4.23 — Language.** Supplier support is available in English and Setswana, by people. Templates are Setswana-reviewed (§2.8.4).

## 5.4.8 Command Grammar and Parsing

**FR-5.4.24 — Phase 2 parsing is exact.** A strict grammar, case-insensitive, with tokenised date ranges (`20-25 Jun`, `2026-06-20/2026-06-25`, `next weekend` is **not** supported in Phase 2). Unparseable input returns the expected format, not a guess.

**FR-5.4.25 — Free text is never silently discarded.** Anything not matching a command produces a helpful reply with the current command set and the extranet link. Nothing is silently dropped — a supplier who believes they changed something and did not is a trust incident.

**FR-5.4.26 — No LLM in the Phase 2 supplier path.** Natural-language supplier commands are Phase 3 at the earliest, gated on the same evaluation harness as §5.3.6, and even then they remain confirmation-gated (FR-5.4.9, FR-5.4.14). Housekeeping-status commands are post-MVP (§2.5.3).

**FR-5.4.27 — Property and unit resolution.** Names are matched case-insensitively against the supplier's own properties and units, with `pg_trgm` fuzzy matching behind an exact match. Ambiguity always asks; it never assumes.

**FR-5.4.28 — Command rate limits.** 30 commands per rolling hour per number; a breach is logged and alerted. Prevents a loop from a buggy integration or a mis-sent message from writing thousands of availability rows.

## 5.4.9 Acceptance Criteria

Phase 2 (§5.4 L2) is complete when:

- [ ] A supplier's registered number resolves to that supplier and the acting user, with delegation scope enforced
- [ ] `CONFIRM` and `DECLINE` work against a live on-request booking and update booking state per §9.1
- [ ] SLA deadline is stated to the supplier and reminder messages fire at 50% and 100%
- [ ] `AVAIL`, `BLOCK` and `OPEN` are confirmation-gated with an impact line
- [ ] An availability change that would overbook is refused, lists the conflicting dates, and writes nothing
- [ ] A multi-date range change is all-or-nothing — no partial writes
- [ ] `RATE` is confirmation-gated and discloses old rate, new rate, % change, plans affected and dates affected
- [ ] Reducing a rate below an existing confirmed booking's net rate does not refund or re-price, and the system says so
- [ ] `PAYOUTS`, `RECEIVED`, `STATEMENT` and `DISPUTE` work and reach the same queues as their web equivalents
- [ ] An unmapped number receives a neutral reply and changes nothing
- [ ] Unparseable input returns the expected format; nothing is silently dropped
- [ ] Every mutation writes an `audit_events` row with the acting user, the number, and the parsed intent
- [ ] Two-person rule enforced: no single message can release a payout, change tax, or rotate a credential

---

## §5.3–§5.4 Traceability

| Requirement group | Origin |
|---|---|
| §2.8.1–§2.8.8 | v3.0. v2.4 §2.5 described messages but never transactions, numbers, templates, windows, cost or quality |
| §5.3.1–§5.3.10 | v3.0. Resolves the v2.4 FR-5.15.20 vs §6.12 RLS contradiction; WhatsApp number becomes the guest principal |
| §5.4.1–§5.4.9 | v3.0. Operationalises v2.4 §2.5.7's WhatsApp scenarios and FR-5.5.20/FR-5.5.28, adding the confirmation gates v2.4 lacked |