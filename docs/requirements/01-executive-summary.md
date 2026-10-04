\# §1 Executive Summary



\## 1.1 What ArriveSuite Is



ArriveSuite is the \*\*national digital inventory layer for Botswana tourism\*\*, launched with a hybrid inventory model: sourced inventory from global providers (funding the platform) and owned inventory from Botswana suppliers (the long-term moat).



It is not a travel booking website. It is not a metasearch engine. It is not a Booking.com clone.



It is the missing infrastructure that makes Botswana's tourism products — lodges, guesthouses, camps, tour operators, activities, guides, transfers — discoverable, rate-structured, availability-aware, and bookable by any channel in the world.



\*\*The strategic thesis:\*\*



> Botswana's tourism inventory exists. It is fragmented, un-digitized, and controlled by intermediaries who extract value without reinvesting it. ArriveSuite digitizes, structures, and connects this inventory — creating a nationally-owned asset that any distributor (B2C, B2B, corporate, OTA, GDS) can consume. The inventory is owned locally. The content is first-party. The platform captures value for Botswana.



\*\*The execution thesis:\*\*



> To build the moat, ArriveSuite needs time. To earn time, ArriveSuite needs revenue. To earn revenue, ArriveSuite needs inventory. Therefore, ArriveSuite launches with sourced inventory from global providers while onboarding Botswana suppliers in parallel. Revenue from sourced inventory funds the moat. As owned inventory grows, the platform transitions to a pure-play Botswana inventory exchange.



\## 1.2 The Problem



Botswana has no digital inventory layer for its own tourism products.



\*\*Today's reality:\*\*



\- A 12-room lodge in Maun manages bookings via WhatsApp, a paper calendar, and a bank statement.

\- A tour operator in Kasane has no way to sell to international travelers except through middlemen who take 25–35% margin.

\- International OTAs (Booking.com, Expedia, Viator) resell Botswana inventory at markup, using generic stock photos and outdated descriptions written by people who have never been to Botswana.

\- \*\*Local inventory does not appear in global systems\*\* unless an intermediary has already purchased API access to content that belongs locally.

\- No one — not the operator, not the guest, not the government — has a unified view of what is bookable in Botswana today.



\*\*The consequence:\*\*



\- Local operators get squeezed on margin.

\- International guests pay more for worse content.

\- No one reinvests in the destination.

\- Botswana's tourism economy is digitally subordinate to intermediaries who don't live here.



\## 1.3 The Solution



ArriveSuite builds the missing layer through a hybrid inventory strategy:



1\. \*\*Sourced inventory at launch\*\* — flights from Duffel, hotels from Amadeus, tours from Viator. Revenue from Week 5. Proof of concept for fundraising. Revenue funds the moat.

2\. \*\*The Extranet\*\* — a light property management system that turns Botswana's fragmented inventory into structured, bookable data. This is the front door to the platform and the moat of the business.

3\. \*\*The Pricing \& Inventory Engine\*\* — a server-side engine that resolves rates, markups, taxes, FX, and availability deterministically, with signed quotes and immutable snapshots. Works identically for both inventory classes.

4\. \*\*Multi-Channel Distribution\*\* — B2C, B2B agents, corporate buyers, and (eventually) OTAs and GDS all consume the same inventory through channel-specific interfaces.

5\. \*\*The Inventory Exchange\*\* — a standardized protocol by which any distributor can connect to ArriveSuite's Botswana inventory, and any Botswana operator can be distributed worldwide.

6\. \*\*WhatsApp as Primary Interface\*\* — because it is how Botswana communicates. Guests can search, book, and pay via WhatsApp. Suppliers can confirm bookings, update availability, and receive payouts via WhatsApp. This is not a fallback channel — it is the primary user interface.



\## 1.4 Why Now



Four converging conditions make this the right moment:



1\. \*\*Mobile money and card payments\*\* are now common in Botswana (Orange Money, MyZaka, PayTabs, EFT).

2\. \*\*BTO licensing and regulation\*\* are becoming digital-first, making verified inventory possible.

3\. \*\*Global OTAs are hungry for locally-owned inventory\*\* — they will connect to standardized sources because it's cheaper than replicating on-the-ground content.

4\. \*\*Post-pandemic tourism recovery\*\* has created operational urgency among Botswana operators who now accept that digital distribution is non-optional.



\## 1.5 Why Botswana First



Botswana is the right launch market because:



\- \*\*Small enough to digitize completely.\*\* Thousands of tourism products, not hundreds of thousands. A focused team can onboard them all within 24 months.

\- \*\*Unique enough to defend.\*\* Safari, Okavango Delta, Chobe, Kalahari, cultural tourism, MICE — the inventory is distinctive and cannot be replicated elsewhere.

\- \*\*Digitally underserved.\*\* No dominant local player. No entrenched competitor.

\- \*\*Compliance-driven.\*\* BTO licensing provides a verified supply base.

\- \*\*Gateway to Southern Africa.\*\* Once operational in Botswana, the same infrastructure extends to Namibia, Zambia, Zimbabwe, and South Africa.



\## 1.6 The Business Model



ArriveSuite operates as a \*\*hybrid marketplace with a both merchant-of-record and channel-aggregator model\*\*.



\### Primary revenue



\- \*\*Commission on owned B2C bookings\*\* (high-margin, 15–25%)

\- \*\*Commission on owned B2B bookings\*\* (8–12%)

\- \*\*Commission on sourced B2C bookings\*\* (low-margin, 5–8%)

\- \*\*Commission on sourced B2B bookings\*\* (2–5%)

\- \*\*FX buffer profit\*\* (Botswana-owned currency margin)

\- \*\*Subscription for extranet access\*\* (freemium tier; paid tiers with channel sync, priority listing)

\- \*\*API licensing\*\* (for OTAs and GDS connecting to the inventory)

\- \*\*Content licensing\*\* (Botswana-owned content available to distributors)



\### Secondary revenue



\- \*\*Corporate travel management\*\* (Phase 2)

\- \*\*MICE / event booking\*\* (Phase 3)

\- \*\*Insurance and visa intermediation\*\* (Phase 3)



\### Revenue trajectory



| Period | Sourced share | Owned share | Blended margin |

|---|---|---|---|

| Month 1 | 100% | 0% | 6% |

| Month 3 | 85% | 15% | 8% |

| Month 6 | 70% | 30% | 10% |

| Month 12 | 40% | 60% | 12% |

| Year 2 | 25% | 75% | 14% |

| Year 3 | 15% | 85% | 16% |



\*\*Sourced revenue funds operations. Owned revenue becomes the business.\*\*



\## 1.7 The Roadmap



| Phase | Weeks | Deliverable |

|---|---|---|

| Phase 0 | 1 | Foundations: monorepo, Docker, DB, auth, CI |

| Phase 1 | 2 | Sourced inventory (Duffel + Amadeus) + B2C flow + WhatsApp notifications |

| Phase 2 | 2 | Extranet + Owned inventory (first 20 suppliers) + WhatsApp onboarding |

| Phase 3 | 2 | WhatsApp booking flow + Viator integration + Tours |

| Phase 4 | 1 | Admin Back Office (Reservations, Supplier Ops, Finance Ops) |

| Phase 5 | 1 | B2B Agent Portal + WhatsApp for agents |

| Phase 6 | 1 | WhatsApp supplier ops + Exchange API (XML-out, REST) |

| Phase 7 | 2 | Hardening, launch prep, regional expansion groundwork |



\*\*Total: 13 weeks to launch. Revenue from Week 5. Owned inventory from Week 8. WhatsApp booking from Week 10.\*\*



\## 1.8 Success Metrics



| Metric | Year 1 | Year 3 |

|---|---|---|

| Botswana products onboarded | 500 | 3,000 |

| Active owned suppliers | 300 | 1,500 |

| Sourced inventory GMV | BWP 8M | BWP 80M |

| Owned inventory GMV | BWP 12M | BWP 320M |

| \*\*Owned share of GMV\*\* | \*\*60%\*\* | \*\*80%\*\* |

| B2C bookings/month | 500 | 10,000 |

| B2B bookings/month | 2,000 | 50,000 |

| WhatsApp bookings/month | 300 | 5,000 |

| OTA connections | 0 | 5 |

| GMV | BWP 20M | BWP 400M |

| Supplier payout cadence | Weekly | Daily |

| Time to onboard new supplier | 5 days | 1 day |



\*\*The single most important metric is Owned Share of GMV.\*\* It must grow by at least 10 percentage points every quarter.



\## 1.9 The Defensibility



ArriveSuite is defensible not because of technology, but because of \*\*content, relationships, and standards\*\*:



1\. \*\*First-party content\*\* — photos, descriptions, amenities produced with and by Botswana operators.

2\. \*\*Verified inventory\*\* — BTO-licensed suppliers, contract-bound, quality-scored.

3\. \*\*Local presence\*\* — field teams in Gaborone, Maun, Kasane, and Okavango.

4\. \*\*WhatsApp-native relationships\*\* — direct relationships with operators who trust the platform.

5\. \*\*Standards ownership\*\* — ArriveSuite defines the protocol that others must implement to connect.

6\. \*\*Channel leverage\*\* — once operators are on the platform, they will not want to be distributed through multiple systems.



\*\*The sourced inventory is not the moat. It is the funding mechanism for the moat. The moat is the content, the relationships, and the trust.\*\*

