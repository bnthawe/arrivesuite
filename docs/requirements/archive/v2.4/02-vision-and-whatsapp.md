\# §2 Vision \& Positioning



\## 2.1 Vision



> \*\*To be the digital infrastructure of Botswana tourism — the layer through which every local product reaches every guest, and through which every guest experiences the real Botswana.\*\*



\## 2.2 Positioning



ArriveSuite positions itself differently depending on audience:



| Audience | What ArriveSuite is |

|---|---|

| \*\*Local suppliers\*\* | The tool that makes your inventory bookable worldwide, at fair margin, without you needing to be a technology company. |

| \*\*B2C guests\*\* | The trusted source for Botswana travel — real photos, real availability, real prices, real suppliers. |

| \*\*B2B agents\*\* | The wholesale access to Botswana inventory with competitive net rates. |

| \*\*Corporate buyers\*\* | The procurement platform for employee travel and MICE in Botswana. |

| \*\*International OTAs\*\* | The standardized source for Botswana inventory that you cannot replicate in-house. |

| \*\*Government / BTO\*\* | The digital infrastructure that makes Botswana's tourism economy visible and accountable. |

| \*\*Investors\*\* | The infrastructure layer for a market that has none, in a country that is uniquely positioned to lead. |



\## 2.3 Comparison to Alternatives



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



\*\*ArriveSuite is not competing with any of them. ArriveSuite is the layer all of them will need to connect to.\*\*



\## 2.4 Strategic Priorities



\*\*Priority 1 — Digitize Botswana's inventory.\*\*



Every BTO-licensed tourism product in the country should be on the platform. This is the primary measure of success. Revenue follows inventory.



\*\*Priority 2 — Own the content.\*\*



First-party photos, descriptions, itineraries, cultural context. This is the moat that cannot be replicated.



\*\*Priority 3 — WhatsApp as primary interface.\*\*



For guests, for suppliers, for agents. It is how Botswana communicates. Treat it with the same seriousness as the web app.



\*\*Priority 4 — Serve the operators.\*\*



Every design decision should be evaluated against: "Does this make it easier for a lodge owner in Maun to run their business?" If not, redesign.



\*\*Priority 5 — Build toward the exchange.\*\*



Design every API as if it will be consumed externally. Because it will.



\*\*Priority 6 — Extend regionally.\*\*



Once Botswana is operational, replicate the model in Namibia, Zambia, Zimbabwe, and beyond — using the same infrastructure.



\*\*Priority 7 — Remain country-specific in content, global in infrastructure.\*\*



The infrastructure can serve any country. The content is Botswana's. This balance is the key to the business.



\*\*Priority 8 — Grow owned share of GMV.\*\*



Every quarter, owned inventory must represent a larger share of total GMV. Sourced inventory funds the transition; owned inventory becomes the business.



\---



\# §2.5 WhatsApp-First Strategy



\## 2.5.1 Purpose



This section defines WhatsApp not as a feature, but as a \*\*primary user interface\*\* for the platform.



\## 2.5.2 Why WhatsApp



\*\*Empirical reality:\*\*



\- WhatsApp is the dominant communication platform in Botswana, used across age groups, income levels, and urban/rural locations.

\- Business communication — including bookings, confirmations, and payments — routinely happens over WhatsApp.

\- A lodge owner in Maun will respond to a WhatsApp message within minutes; they may check email weekly.

\- Tourists, especially regional travelers, expect WhatsApp as a primary contact channel.



\*\*Design implication:\*\*



> Every user journey that involves communication, confirmation, or transaction with a human — guest, supplier, or agent — must be available over WhatsApp.



\## 2.5.3 WhatsApp Capabilities



ArriveSuite integrates WhatsApp at four levels:



\### Level 1 — Notifications



Automated notifications to guests and suppliers for:



\- Booking confirmations

\- Voucher delivery

\- Availability alerts

\- Payment confirmations

\- Cancellation alerts

\- Payout notifications



Delivered via the WhatsApp Business API (Cloud API or a BSP such as Twilio, 360dialog, or Wati).



\### Level 2 — Two-way messaging



Support for conversation threads:



\- Guests can ask questions about a booking

\- Suppliers can respond to booking requests

\- Agents can request modifications

\- Support can escalate to Operations



All messages are:



\- Logged in `message\_threads` and `messages`

\- Tied to the relevant entity (booking, supplier, agent)

\- Searchable by ops staff

\- Auditable



\### Level 3 — Transactional flows



Full booking flows available over WhatsApp:



\- \*\*Search:\*\* guest sends "Maun 15-22 June 2 adults" → system returns options

\- \*\*View:\*\* guest taps a link to see property detail on web (WebView)

\- \*\*Book:\*\* guest confirms selection → system sends payment link

\- \*\*Pay:\*\* guest pays via PayTabs link or mobile money → system confirms booking

\- \*\*Voucher:\*\* guest receives PDF voucher in WhatsApp



\### Level 4 — Supplier operations



Full supplier workflows available over WhatsApp:



\- \*\*Confirm booking:\*\* supplier receives booking request → replies "confirm" or "decline" → system updates state

\- \*\*Update availability:\*\* supplier sends "Xigera Water Suite 3 rooms available for 20-25 June" → system parses and updates inventory

\- \*\*Update rates:\*\* supplier sends "Xigera rates +10% for July" → system proposes change with confirmation

\- \*\*Housekeeping:\*\* supplier marks rooms clean/dirty

\- \*\*Payouts:\*\* supplier receives payout notification and confirms receipt



\## 2.5.4 WhatsApp Interaction Design



\### Commands



The system supports simple text commands:



| Command | Action |

|---|---|

| `hi` / `hello` | Start a new conversation |

| `book` | Start a booking flow |

| `status \[ref]` | Check booking status |

| `cancel \[ref]` | Initiate cancellation |

| `help` | Show available commands |

| `stop` | Opt out of notifications |



\### Natural language processing



For flows beyond commands, the system uses LLM-based parsing:



\- "I need a lodge in Maun for next weekend" → parsed to search parameters

\- "Can you move my booking to the 20th?" → parsed to modification request

\- "How much for 2 nights at Chobe?" → parsed to quote request



Parsing failures are handed off to a human agent.



\### Handoff to human



At any point in a conversation, a user can request "speak to a human" or the system can escalate if:



\- Confidence is below a threshold

\- The request is beyond the flow's scope

\- The user is frustrated (sentiment analysis)

\- The booking value exceeds a threshold



Escalation routes to the appropriate ops team via the Admin Console's Support view.



\## 2.5.5 WhatsApp Verification



To ensure authentic identity over WhatsApp:



\- \*\*Guest verification:\*\* phone number + one-time code on first interaction

\- \*\*Supplier verification:\*\* phone number registered in the extranet; supplier must be logged in to authorize changes

\- \*\*Agent verification:\*\* phone number registered by agency admin

\- \*\*High-value transactions:\*\* require additional verification (email confirmation or web login)



\## 2.5.6 WhatsApp Payments



Payment over WhatsApp uses:



\- \*\*PayTabs payment links\*\* (primary)

\- \*\*Mobile money\*\* (Orange Money, MyZaka — Phase 2)

\- \*\*Wallet balance\*\* (if user has one)



\*\*Flow:\*\*



1\. System generates a signed payment link with an expiry

2\. Link is sent as a WhatsApp message

3\. Guest taps link → PayTabs hosted page in WhatsApp's in-app browser

4\. Payment captured → PayTabs webhook → system updates booking

5\. Confirmation + voucher sent via WhatsApp



\*\*Security:\*\*



\- Payment links are single-use, 15-minute expiry

\- Amount is fixed; guest cannot modify

\- Link is signed with HMAC to prevent tampering

\- All payment attempts are logged

\- Failed attempts trigger a security alert after 3 retries



\## 2.5.7 WhatsApp for Suppliers (Detailed)



This is the most strategically important part of the WhatsApp strategy.



\### Scenario 1 — Booking confirmation



