# OrderFlow Suite — Autonomous TMS Design Spec

> **Date:** 2026-04-05
> **Author:** Badr (CEO) + Claude
> **Status:** Approved
> **Scope:** Architectural vision for transforming OrderFlow Suite from AI-assisted to AI-operated TMS

---

## 1. Vision

OrderFlow Suite is an **AI-native, confidence-driven Transport Management System** that gradually evolves from human-operated to autonomous. Every decision in the system (accepting orders, planning trips, choosing vehicles, calculating prices, sending invoices) has a confidence score that determines whether the system acts independently or requests human validation.

The human planner evolves from **operator** to **supervisor**.

## 2. Target Market

Platform-breed from day 1 via multi-tenant architecture:
- Dutch groupage/stukgoed (5-50 vehicles)
- Benelux mid-market (20-200 vehicles)
- Niche specialists (refrigerated, ADR, bulk)
- International FTL/LTL operators

## 3. Killer Metrics

| Metric | Current State (industry) | OrderFlow Target |
|--------|------------------------|-----------------|
| Planning time | 3 hours/day | 10 minutes/day |
| Operational cost | Baseline | -15 to -25% |
| Error rate | ~8% | <1% |
| Automation | 10-20% (legacy) | 50% → 95% (growing) |

## 4. The 3 Autonomy Layers

```
Layer 3: AUTONOMOUS (confidence ≥ tenant threshold, default 95%)
  System acts, human gets summary only

Layer 2: VALIDATION (confidence 80-95%)
  System proposes, human approves with one click

Layer 1: HUMAN (confidence < 80%)
  System provides options, human decides
```

Each tenant configures their own thresholds. Low risk tolerance → 98%. Speed-focused → 90%.

## 5. The 4 Autonomous Modules

### Module 1: Autonomous Order Intake

Email/portal/phone → system parses, validates, enriches independently:

- **Client recognition** — After 5+ orders, the system knows each client's patterns (field mapping, language, standard routes). Per-client template that self-refines
- **Address resolution** — Semantic understanding, not just geocoding. "De veiling" = Veilingweg 8, Poeldijk for Fresh Express. Per-client address book that learns
- **Capacity check** — Before confirming: is a vehicle available? Does it fit the planning? Conflicts with time windows?
- **Auto-confirmation** — At confidence ≥ threshold: confirm order, email client, pre-allocate trip. No planner needed

### Module 2: Autonomous Planning

Not "run VRP solver and show result" but **continuously optimize**:

- **Rolling horizon** — System doesn't plan once per day but replans continuously as orders arrive. Every new order triggers a re-evaluation
- **Multi-constraint** — Time windows, vehicle capacity, driver certifications, ADR routes, cold chain, driving time regulations (EU 561/2006) — all as hard constraints
- **Consolidation AI** — Automatically group orders going the same direction, fitting the same time windows, with compatible cargo
- **What-if simulation** — "What if I put this vehicle in maintenance tomorrow?" System shows impact on all planned trips

### Module 3: Autonomous Dispatch & Execution

From plan to execution without intervention:

- **Auto-dispatch** — Once planning is confirmed: automatically send trip to driver app at the right moment
- **Real-time replanning** — Driver stuck in traffic? Client cancels? System replans remaining stops automatically and informs all stakeholders
- **Anomaly detection** — GPS shows driver stationary for 20 min at unexpected location. System proactively asks: "Is there a problem?"
- **Auto-POD** — Geofence detects arrival, driver confirms with one tap, CMR photo automatically linked to order

### Module 4: Autonomous Financial Processing

From delivery to invoice without manual work:

- **Auto-pricing** — Based on rate card, actual kilometers, wait time, surcharges: price automatically calculated when trip completes
- **Auto-invoicing** — Draft invoice auto-generated, at confidence ≥ threshold sent directly
- **Margin monitoring** — Real-time alert when a trip risks falling below margin threshold. System suggests price correction
- **Cashflow prediction** — Based on payment terms per client: prediction when money arrives

## 6. The Confidence System

### 6.1 Three-Layer Confidence

Every decision has three confidence layers:

```
DECISION
  ├── Input confidence  — How certain is the data? (AI extraction, address resolution)
  ├── Model confidence  — How certain is the decision? (planning, pricing)
  └── Outcome confidence — How often was it correct in hindsight? (feedback loop)
```

**Outcome confidence** is the key. The system compares its prediction with what the human did:
- System proposed trip A, planner approved → confidence +1
- System proposed trip A, planner changed to B → confidence -1, system learns why
- System acted autonomously, client didn't complain → confidence confirmed
- System acted autonomously, client complained → confidence -5, back to human validation

### 6.2 Feedback Loop Per Decision Type

| Decision | Learns from | Example |
|----------|------------|---------|
| Client recognition | Planner corrections on client_name | "JvdBerg" = "Van der Berg Logistics" after 3 corrections |
| Address resolution | Planner adjusts address | "Depot Rotterdam" → "Maasvlakte 2, Hal 7" becomes template |
| Vehicle choice | Planner changes vehicle assignment | Refrigerated truck for Fresh Express, not standard box truck |
| Trip consolidation | Planner splits/merges groups | Rotterdam→Utrecht and Rotterdam→Amersfoort together? |
| Time estimation | Difference planned vs actual arrival | A15 at 08:00 = always 20 min delay → build buffer |
| Pricing | Planner adjusts price manually | Tier discount above 10 pallets for this client |

### 6.3 Autonomy Progression Per Tenant

```
Week 1-4:   EVERYTHING human (system learns, builds templates)
Week 5-8:   Known clients → validation mode (one-click approval)
Week 9-16:  Standard orders → autonomous, exceptions → validation
Week 17+:   90%+ autonomous, human only for anomalies
```

### 6.4 Autonomy Dashboard

```
┌─────────────────────────────────────────┐
│  AUTONOMY SCORE: 73%                    │
│  ████████████████████░░░░░░░  73/100    │
│                                          │
│  Order Intake     ████████████░  89%     │
│  Planning         ██████████░░░  71%     │
│  Dispatch         █████████░░░░  65%     │
│  Invoicing        ████████░░░░░  62%     │
│                                          │
│  Today: 34 autonomous / 8 validated     │
│  This week: 2 corrections by planner    │
└─────────────────────────────────────────┘
```

## 7. Market Position

| | Legacy TMS | Modern SaaS | OrderFlow Suite |
|---|---|---|---|
| Setup time | 6-12 months | 1 day | 1 week (incl. AI training) |
| Automation | 10-20% | 30-40% | 50% → 95% (grows) |
| AI role | Reporting | None | Core of every decision |
| Price | €50k+/year | €200/month | €500-2000/month |
| Complexity | ADR, cold, groupage | Packages only | ADR, cold, groupage, FTL/LTL |
| System learning | Static | Static | Gets smarter per week |

## 8. Three Defensible Advantages

1. **System gets smarter per client** — After 100 orders it knows client patterns better than a new planner. Knowledge lives in the system, not in people's heads
2. **Confidence-driven autonomy** — No all-or-nothing. Gradual transition that is measurable and configurable. The entrepreneur decides how much they trust the system
3. **First AI-native TMS for complex transport** — Not AI as feature but AI as foundation. Every screen, every decision, every workflow built around "how can AI do this itself?"

## 9. Architecture Changes Needed

### 9.1 Event-Driven Architecture
Every status change triggers an evaluation: "Can I do the next step autonomously?" Current request-response must become event-stream.

### 9.2 Per-Tenant AI Context
Currently one Gemini prompt for all tenants. Must become: per-tenant prompt with client templates, address book, and historical patterns.

### 9.3 Confidence Store
Central table tracking confidence per decision type, per client, per tenant with trend visualization.

### 9.4 Async Processing Pipeline
Orders processed autonomously don't need the UI. Background pipeline: intake → validation → planning → dispatch → invoicing.

## 10. Current State vs. Target

### Already Built (Release 1):
- Multi-tenant foundation with RLS
- AI email parsing with confidence scoring
- VRP solver with 2-opt optimization
- Time windows & slot booking (Plan A)
- Rate cards & pricing engine (Plan B)
- Return orders & packaging (Plan C)
- Notifications & client portal (Plan D)
- Chauffeur app with PIN auth & offline POD
- 2067 tests passing

### Next Phase (Release 2 — Autonomy):
- Confidence store & feedback loop engine
- Per-tenant AI context & client templates
- Event-driven pipeline (order → invoice without UI)
- Autonomy dashboard
- Rolling horizon planner
- Real-time replanning on anomalies
- What-if simulation
- Auto-dispatch triggers
- Cashflow prediction
