\# §5.5 Supplier Extranet



\## 5.5.1 Purpose



The Supplier Extranet is a \*\*light property management system (PMS)\*\* for Botswana tourism operators. It is the primary way suppliers interact with ArriveSuite, and it is designed mobile-first and WhatsApp-first.



\*\*Design principles:\*\*



1\. \*\*WhatsApp-first.\*\* Every core supplier action is available over WhatsApp.

2\. \*\*Zero-training friendly.\*\* A lodge owner with no software experience should be able to use it within 10 minutes.

3\. \*\*Mobile-primary.\*\* Works on a phone first, then a tablet, then a desktop.

4\. \*\*Offline-tolerant.\*\* Critical actions queue locally and sync when online.

5\. \*\*BWP-native.\*\* No FX exposure for the supplier.

6\. \*\*Content-producing.\*\* The extranet is where first-party content is created.

7\. \*\*Free at the base tier.\*\* No supplier should be blocked by cost.



\## 5.5.2 Onboarding Journey



The supplier onboarding funnel has 6 stages:



\*\*Stage 1 — Discovery\*\*



\- Supplier learns about ArriveSuite via field operations, BTO partnership, industry referrals, or word of mouth

\- ArriveSuite operations team in Gaborone, Maun, Kasane, or Okavango contacts them

\- First contact is via WhatsApp



\*\*Stage 2 — Interest\*\*



\- Supplier expresses interest

\- ArriveSuite sends a WhatsApp introduction with a 60-second explainer

\- A web landing page introduces the platform: what it is, why it matters, what it costs

\- A field agent schedules a call or visit



\*\*Stage 3 — Application\*\*



Supplier applies via:



\- \*\*Option A:\*\* A short WhatsApp flow (name, lodge, rooms, contact)

\- \*\*Option B:\*\* A web form with the same fields

\- \*\*Option C:\*\* Field agent completes the application on-site



Required at application:



\- Legal name, trading name

\- BTO license number and expiry

\- Tax ID (BURS)

\- Contact details (phone, WhatsApp, email)

\- Property type and location

\- Room/tour count

\- Bank details (encrypted)



\*\*Stage 4 — Verification\*\*



\- BTO license verified via BTO API (or manual if API unavailable)

\- Tax ID verified via BURS (where possible)

\- Bank details verified (small test transfer, then reversal — Phase 2)

\- Documents reviewed by Supplier Ops

\- Approval or rejection communicated via WhatsApp



\*\*Stage 5 — Contracting\*\*



\- Digital contract sent via WhatsApp

\- E-signed by supplier

\- Countersigned by ArriveSuite

\- Contract stored in R2

\- Audit trail written



\*\*Stage 6 — Activation\*\*



\- Supplier account created

\- Property/tours setup in extranet

\- Photos and descriptions uploaded (with ArriveSuite content team if needed)

\- Rates and availability entered

\- Test booking performed

\- Listing published

\- Welcome message sent via WhatsApp

\- First channel sync live (B2C search)



\*\*Target:\*\* 5 business days from application to first booking.



\## 5.5.3 Authentication \& Identity



\*\*FR-5.5.1 — Login methods\*\*



Suppliers authenticate via:



\- \*\*Phone number + WhatsApp OTP\*\* (primary)

\- \*\*Email + password\*\* (fallback)

\- \*\*Magic link via WhatsApp\*\* (convenience)



No supplier is forced to remember a password.



\*\*FR-5.5.2 — Session\*\*



Supplier sessions are:



\- Session length: 8 hours

\- Refresh on activity

\- 2FA via WhatsApp on new devices

\- Logged to `audit\_events`



\*\*FR-5.5.3 — Multi-user support\*\*



A supplier account can have multiple users:



\- Owner (full access)

\- Manager (booking + availability + rates)

\- Staff (booking view, housekeeping)



Each user is tied to a WhatsApp number for OTP and notifications.



\*\*FR-5.5.4 — Delegation\*\*



A supplier can delegate specific properties or functions to specific users:



\- Owner of Property A can manage Property A only

\- Manager of Property B can manage Property B

\- Accountant can view payouts but not edit inventory



\## 5.5.4 Property Management



\*\*FR-5.5.5 — Property CRUD\*\*



Suppliers can create, edit, and archive properties with the following fields:



\- Name, type (hotel | lodge | guesthouse | inn | bnb | camp)

\- Description (rich text, but rendered simply)

\- Location (address, coordinates via map picker)

\- Contact details (phone, WhatsApp, email)

\- Check-in and check-out times

\- Policies (cancellation, child, pet, smoking, quiet hours)

\- Star rating (self-declared, verified by reviews later)



\*\*FR-5.5.6 — Media management\*\*



\- Photos uploaded via WhatsApp, web, or field agent

\- Auto-resized and EXIF-stripped on upload

\- Virus-scanned

\- Cover image required for publishing

\- Minimum 5 photos recommended

\- Alt text auto-generated with LLM, editable



\*\*FR-5.5.7 — Amenities\*\*



\- Amenity taxonomy provided by ArriveSuite

\- Supplier selects amenities applicable to their property

\- Custom amenities can be added (moderated by ArriveSuite)



\*\*FR-5.5.8 — Publishing workflow\*\*



\- Supplier fills in required fields

\- Submits for review

\- Content Ops reviews (Phase 2, then auto-approved after trust is established)

\- Publishes to search results



\## 5.5.5 Room Types \& Rate Plans



\*\*FR-5.5.9 — Room types\*\*



Suppliers define room types:



\- Name (e.g., "Luxury Chalet", "Water Suite", "Standard Double")

\- Capacity (adults, children, infants)

\- Bed configuration (1 king | 2 twins | 1 queen + 1 single)

\- Size (sqm, optional)

\- Attributes (balcony, view, bathroom type)

\- Photos



\*\*FR-5.5.10 — Rate plans\*\*



Suppliers define rate plans for each room type:



\- Name (e.g., "Full Board", "Non-refundable")

\- Meal plan (room only | breakfast | half board | full board | all inclusive)

\- Cancellation policy (flexible | moderate | strict | non-refundable)

\- Min/max stay nights

\- Refundable (yes | no)

\- Inclusions (free WiFi, airport transfer, etc.)



\*\*FR-5.5.11 — Rate setting\*\*



Rates are set via:



\- \*\*Bulk edit:\*\* apply the same rate for a date range

\- \*\*Calendar:\*\* click a date, set rate

\- \*\*WhatsApp:\*\* "Xigera Water Suite 12,500 for 20-25 June"

\- \*\*CSV import:\*\* for suppliers with existing rate sheets



\*\*FR-5.5.12 — Seasonal rates\*\*



Suppliers define seasons:



\- Low (default)

\- High (e.g., July, August, December)

\- Peak (e.g., safari high season)



Rates can be set per season or per specific date.



\*\*FR-5.5.13 — Extra beds\*\*



Suppliers define extra bed pricing:



\- Extra adult

\- Extra child (age band)

\- Free for infants



\*\*FR-5.5.14 — Rate inheritance\*\*



Rate plans inherit from room type defaults but can override per date.



\## 5.5.6 Availability Management



\*\*FR-5.5.15 — Availability model\*\*



Availability is stored per room type per date, with three counters:



\- `available\_units` — bookable

\- `booked\_units` — sold

\- `blocked\_units` — taken out of inventory



\*\*FR-5.5.16 — Booking flow interaction\*\*



When a booking is confirmed:



\- `booked\_units` increases by 1

\- `available\_units` decreases by 1

\- If `available\_units` reaches 0, the room type is sold out for that date



\*\*FR-5.5.17 — Stop-sell\*\*



Suppliers can stop-sell specific dates (e.g., renovation, owner use).



\*\*FR-5.5.18 — Minimum stay\*\*



Rate plans can enforce minimum stay. Bookings shorter than min stay are rejected.



\*\*FR-5.5.19 — Bulk availability update\*\*



Suppliers can:



\- Set a date range to "N rooms available"

\- Block a date range

\- Adjust capacity temporarily



\*\*FR-5.5.20 — WhatsApp availability\*\*



Suppliers can update availability via WhatsApp:



\- "Xigera Water Suite 3 rooms 20-25 June"

\- System parses intent, confirms back

\- On confirmation, inventory updates



\*\*FR-5.5.21 — Offline queue\*\*



If the supplier is offline:



\- Actions queue locally (web) or in WhatsApp

\- Sync occurs on reconnect

\- Conflict resolution: latest write wins, with audit trail



\## 5.5.7 Tour \& Activity Management



\*\*FR-5.5.22 — Tour CRUD\*\*



Suppliers create tours with:



\- Name, type (private | join-in | self-guided | group)

\- Category (safari | cultural | adventure | food | nature)

\- Duration (minutes)

\- Meeting point

\- Highlights

\- Photos



\*\*FR-5.5.23 — Departures\*\*



Each tour has departures:



\- Date

\- Time

\- Capacity

\- Booked count

\- Status (scheduled | sold out | cancelled)



\*\*FR-5.5.24 — Pax tiers\*\*



Departures have pax tiers:



\- Adult (12+)

\- Child (2–11)

\- Infant (0–1)

\- Senior (60+)

\- Student (with valid ID)



Each tier has its own price.



\*\*FR-5.5.25 — Itineraries\*\*



Tours have day-by-day itineraries:



\- Day number

\- Title

\- Description

\- Activities



\*\*FR-5.5.26 — Inclusions \& exclusions\*\*



Tours have lists of:



\- Included items (transport, guide, meals, water, park fees)

\- Excluded items (personal items, gratuities, drinks)



\*\*FR-5.5.27 — Departure availability\*\*



Departures can be:



\- Published (bookable)

\- Held (temporarily not bookable)

\- Cancelled (with reason, notifies booked guests)



\*\*FR-5.5.28 — WhatsApp tour updates\*\*



Suppliers can:



\- Add departures via WhatsApp

\- Cancel departures via WhatsApp

\- Update capacity via WhatsApp



\## 5.5.8 Booking Management



\*\*FR-5.5.29 — Incoming bookings\*\*



Suppliers see bookings for their inventory:



\- Real-time updates via WhatsApp + web

\- Booking reference

\- Guest details

\- Dates

\- Total amount

\- Payment status



\*\*FR-5.5.30 — Confirmation actions\*\*



For instant-book bookings:



\- Supplier receives WhatsApp notification

\- Booking is auto-confirmed

\- Supplier acknowledges (optional)



For on-request bookings:



\- Supplier receives WhatsApp notification

\- Supplier must confirm or decline within SLA (default 24h)

\- Actions: `CONFIRM` or `DECLINE <reason>`



\*\*FR-5.5.31 — No-show handling\*\*



Supplier can mark a guest as a no-show within 24h of arrival:



\- Guest is charged (per policy)

\- Booking status → `no\_show`

\- Guest notified



\*\*FR-5.5.32 — Modification requests\*\*



Guests can request modifications:



\- Supplier receives notification

\- Supplier approves or declines

\- If approved, price adjusted and guest notified



\*\*FR-5.5.33 — Cancellations\*\*



Guest-initiated cancellations:



\- Follow the rate plan's cancellation policy

\- Supplier notified

\- Refund initiated by ArriveSuite



Supplier-initiated cancellations (rare):



\- Require reason

\- Escalated to ArriveSuite ops

\- Guest rebooking attempt first

\- Refund if rebooking fails



\*\*FR-5.5.34 — WhatsApp booking confirmation flow\*\*



\[ArriveSuite → Supplier]

New booking: ARS-2026-000123

Water Suite · 15-22 June 2026

2 adults · BWP 14,375 · Paid

Reply CONFIRM / DECLINE <reason>



\[Supplier → ArriveSuite]

CONFIRM



\[ArriveSuite → Supplier]

Confirmed. Voucher issued.

Payout scheduled 30 June





\## 5.5.9 Media \& Content



\*\*FR-5.5.35 — Content production tools\*\*



\- Photo upload (web + WhatsApp)

\- Auto-resize, EXIF stripping, virus scan

\- Alt text generation (LLM)

\- Description editor (rich text)

\- Itinerary builder

\- Translation (English → Setswana, later French)



\*\*FR-5.5.36 — Content quality score\*\*



Each listing has a content score (0–100):



\- Photos: 0–30

\- Description: 0–20

\- Amenities: 0–10

\- Policies: 0–10

\- Rates: 0–15

\- Availability: 0–15



Listings below 60 are flagged for Content Ops review.



\*\*FR-5.5.37 — Assisted content production\*\*



For small suppliers, ArriveSuite Content Ops can:



\- Visit the property

\- Take photos

\- Write descriptions

\- Set up rates

\- Publish listing



Supplier retains ownership of content, but ArriveSuite has a license to distribute.



\*\*FR-5.5.38 — Content updates\*\*



Suppliers can update content at any time. Changes are:



\- Audit-logged

\- Re-reviewed if significant

\- Published immediately for minor changes



\## 5.5.10 Payouts \& Finance



\*\*FR-5.5.39 — Payout schedule\*\*



Default: weekly, every Monday for the prior week's completed bookings.



Options:



\- Weekly (default)

\- Bi-weekly

\- Monthly

\- On-demand (fee applies)



\*\*FR-5.5.40 — Payout calculation\*\*



Payout = Σ(booking total) − Σ(commission) − Σ(FX buffer) + Σ(adjustments)



\*\*FR-5.5.41 — Payout methods\*\*



\- Bank transfer (BWP) — default

\- Mobile money (Orange Money, MyZaka) — Phase 2

\- Cash on collection — for remote suppliers (Phase 3)



\*\*FR-5.5.42 — Payout notifications\*\*



Suppliers receive WhatsApp notification on payout:



\[ArriveSuite → Supplier]

Payout processed: BWP 47,600

Period: 1-30 June 2026

Reference: PAY-2026-06-XIG

Bank: FNB ••••4567

Reply RECEIVED to confirm.



\[Supplier → ArriveSuite]

RECEIVED



\[ArriveSuite → Supplier]

Confirmed. Statement emailed.





\*\*FR-5.5.43 — Statements\*\*



Monthly statements show:



\- Bookings received

\- Gross revenue

\- Commission deducted

\- Net payout

\- Adjustments



Statements are available on web and sent as PDF via WhatsApp.



\*\*FR-5.5.44 — Disputes\*\*



Suppliers can dispute a payout within 7 days:



\- Reason (mandatory)

\- Evidence (optional)

\- Escalated to Finance Ops



\## 5.5.11 Trust Score \& Reputation



\*\*FR-5.5.45 — Trust score composition\*\*



Every supplier has a trust score (0–100) based on:



\- \*\*Responsiveness\*\* (25%) — median time to confirm bookings

\- \*\*Cancellation rate\*\* (20%) — % of bookings cancelled by supplier

\- \*\*Guest rating\*\* (20%) — average guest review score

\- \*\*Inventory freshness\*\* (20%) — time since last owner update

\- \*\*Compliance\*\* (15%) — BTO license validity, tax compliance



\*\*FR-5.5.46 — Trust score impact\*\*



Trust score affects:



\- Search ranking (higher trust = higher rank)

\- Auto-disable threshold (below 80 triggers review)

\- Featured placement eligibility

\- Priority in failover chains



\*\*FR-5.5.47 — Trust score transparency\*\*



Suppliers see their trust score and its components in the extranet. Understanding what drives the score is required for behavior change.



\*\*FR-5.5.48 — Review management\*\*



Guests can leave reviews after checkout. Suppliers can:



\- See all reviews

\- Respond to reviews (publicly)

\- Flag inappropriate reviews (escalated to ArriveSuite)



\*\*FR-5.5.49 — Stale inventory auto-disable\*\*



If a supplier does not update inventory for 30 days:



\- Listing auto-disabled

\- Notification sent at 25 days and 29 days

\- Reactivation is automatic once inventory is updated



\## 5.5.12 Analytics \& Reporting



\*\*FR-5.5.50 — Supplier dashboard\*\*



The supplier dashboard shows:



\- Bookings this month (count, revenue)

\- Occupancy rate (for lodging)

\- ADR (average daily rate)

\- Top channels (B2C, B2B, WhatsApp)

\- Guest origin (top countries/cities)

\- Trust score and components

\- Recent reviews

\- Upcoming check-ins



\*\*FR-5.5.51 — Booking history\*\*



Full searchable history with filters:



\- Date range

\- Booking status

\- Guest name

\- Channel



\*\*FR-5.5.52 — Revenue reports\*\*



\- Daily, weekly, monthly revenue

\- Breakdown by room type, channel, market

\- Export to CSV



\*\*FR-5.5.53 — Forecasting\*\*



Simple occupancy forecast based on:



\- Current bookings

\- Historical patterns

\- Seasonal trends



\## 5.5.13 Support \& Communication



\*\*FR-5.5.54 — WhatsApp support\*\*



Suppliers can reach support via WhatsApp:



\- A dedicated support number

\- Human response within 2 hours (business hours)

\- Botswana-based team

\- Setswana and English



\*\*FR-5.5.55 — Support categories\*\*



\- Technical (login, upload, rates)

\- Financial (payouts, statements)

\- Booking (guest issues)

\- Content (photos, descriptions)

\- Onboarding (new suppliers)



\*\*FR-5.5.56 — Knowledge base\*\*



A self-serve knowledge base with:



\- Getting started

\- Property setup

\- Managing availability

\- Payouts

\- Content best practices



Available in English and Setswana.



\*\*FR-5.5.57 — Training\*\*



\- Video tutorials (WhatsApp-shareable)

\- Live training sessions (monthly, in Gaborone/Maun/Kasane)

\- Field support on request



\## 5.5.14 Security



\*\*FR-5.5.58 — Account security\*\*



\- Phone OTP login (primary)

\- 2FA on new devices

\- Session IP logging

\- Suspicious activity alerts



\*\*FR-5.5.59 — Data protection\*\*



\- Bank details encrypted at rest (AES-256-GCM)

\- Guest PII protected under Botswana Data Protection Act

\- Audit trail on all actions

\- Supplier can request data export or deletion



\*\*FR-5.5.60 — Compliance\*\*



\- BTO license verification (annual)

\- Tax ID verification

\- Bank account verification (test transfer)

\- Regular KYC refresh (annual)



\## 5.5.15 Mobile Experience



\*\*FR-5.5.61 — Mobile-first design\*\*



The extranet must be usable on:



\- Android (primary for Botswana)

\- iOS

\- Feature phones with WhatsApp (via WhatsApp flows)



\*\*FR-5.5.62 — Progressive web app\*\*



The extranet is a PWA:



\- Installable on Android home screen

\- Works offline (queued actions)

\- Push notifications (Phase 2)



\*\*FR-5.5.63 — Offline tolerance\*\*



Critical actions queue locally:



\- Confirm booking

\- Update availability

\- Update rates

\- Housekeeping status



Queue syncs on reconnect. Conflicts resolved with last-write-wins and audit.



\*\*FR-5.5.64 — Low data mode\*\*



\- Optimized for 3G

\- Lazy loading

\- Compressed images

\- <100KB initial payload



\## 5.5.16 Rate Plans \& Seasonality (Advanced)



\*\*FR-5.5.65 — Rate plan types\*\*



\- \*\*Standard\*\* — same rate all year

\- \*\*Seasonal\*\* — different rates per season

\- \*\*Dynamic\*\* — rate changes based on demand (Phase 3)

\- \*\*Package\*\* — bundled with meals, activities (Phase 2)



\*\*FR-5.5.66 — Length-of-stay discounts\*\*



Suppliers can set:



\- 7+ nights: −10%

\- 14+ nights: −15%

\- 30+ nights: −20%



\*\*FR-5.5.67 — Advance purchase discounts\*\*



\- 30+ days advance: −5%

\- 60+ days advance: −10%



\*\*FR-5.5.68 — Last-minute pricing\*\*



\- Within 7 days: −15% to fill occupancy

\- Configurable by supplier



\## 5.5.17 Distribution Control



\*\*FR-5.5.69 — Channel selection\*\*



Suppliers choose which channels receive their inventory:



\- B2C direct

\- B2B agents

\- Corporate

\- WhatsApp

\- OTA partners (Phase 4)

\- Exchange API (Phase 6)



Default: all channels. Suppliers can opt out of specific channels.



\*\*FR-5.5.70 — Rate parity\*\*



ArriveSuite enforces rate parity across channels for owned inventory. Suppliers cannot sell cheaper elsewhere without triggering the parity rule.



Exception: suppliers can offer lower rates to ArriveSuite than to competitors (this is favored).



\*\*FR-5.5.71 — Exclusive inventory\*\*



Suppliers can mark inventory as exclusive to ArriveSuite:



\- Higher commission paid by ArriveSuite

\- Higher search ranking

\- Featured placement



\## 5.5.18 Acceptance Criteria



Phase 2 (Extranet MVP) is complete when:



\- \[ ] Supplier can apply via web or WhatsApp

\- \[ ] BTO license verification works

\- \[ ] Contract e-signing works

\- \[ ] Supplier can log in via WhatsApp OTP

\- \[ ] Supplier can create a property with rooms, rates, availability

\- \[ ] Supplier can upload media

\- \[ ] Supplier can receive and confirm bookings via WhatsApp

\- \[ ] Supplier can update availability via WhatsApp

\- \[ ] Supplier can receive payouts and confirm receipt via WhatsApp

\- \[ ] Supplier can see bookings, revenue, and trust score

\- \[ ] Trust score computed nightly

\- \[ ] Stale inventory auto-disabled after 30 days

\- \[ ] Offline queue works

\- \[ ] PWA installable

\- \[ ] Knowledge base available in English + Setswana

\- \[ ] Field onboarding playbook documented

\- \[ ] First 20 suppliers onboarded end-to-end

