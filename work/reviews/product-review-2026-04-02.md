# Product Review - OrderFlow Suite
**Datum:** 2 april 2026
**Reviewer:** AI Orchestrator
**Scope:** Volledige codebase-analyse van alle 12 modules

---

## Executive Summary

OrderFlow Suite is een uitgebreid Transport Management Systeem (TMS) gebouwd met React/TypeScript, Supabase als backend, en Gemini AI voor e-mail parsing. Het systeem bestrijkt de volledige logistieke keten: van e-mail intake tot facturatie. De codebase is functioneel vergevorderd, met sterke AI-integratie in de inbox-module en solide planning/dispatch-logica. De belangrijkste risico's zitten in ontbrekende tests, hardcoded bedrijfsgegevens, en beperkte offline-capaciteit.

---

## Module-analyse

### 1. Inbox / E-mail

**Wat is gebouwd:**
- 3-koloms resizable UI (sidebar + maillijst + review panel)
- AI-extractie via Gemini 2.5 Flash (parse-order edge function)
- Automatische classificatie (rule-based + AI fallback)
- IMAP polling (poll-inbox) met thread-detectie en reply-merging
- .eml import met MIME parsing en PDF-bijlage upload
- Adresverrijking vanuit klantendatabase
- Bulk-acties (goedkeuren/verwijderen)
- Auto-extractie bij selectie van onverwerkt e-mail
- Keyboard navigatie (pijltjestoetsen, j/k)
- AI confidence scoring met normalisatie (0-1 naar 0-100)
- Test scenario's voor demo/ontwikkeling
- Follow-up draft generatie voor ontbrekende velden
- Correctie-feedback opslag (saveCorrection)
- Mail.tsx: Aparte e-mailclient met inbox/sent/drafts, compose, reply/forward, quick-reply

**Wat ontbreekt:**
- Geen real-time IMAP push (polling is handmatig of cron-based)
- Bijlage-preview ontbreekt in UI (PDFs worden wel ge-upload)
- Geen OCR voor gescande PDFs (alleen tekst-PDFs via Gemini)
- Merge-functionaliteit is "binnenkort beschikbaar" (stub)
- Geen undo na verwijdering
- Mail.tsx compose slaat op als order-record (architectuurprobleem)

**UX-kwaliteit:** Uitstekend. Clean 3-panel layout, goede filtering, keyboard shortcuts, responsive.

**Automatiseringsgraad:** Hoog. AI-extractie, auto-classificatie, auto-approve voor high-confidence + known clients, adresverrijking.

**Risico's:**
- Rate limiting van Gemini API (retry met backoff aanwezig maar 429s bij hoog volume)
- EML-parser is custom-built, kan falen bij complexe MIME structuren
- Tenant-fallback naar hardcoded UUID bij ontbreken van context
- Mail.tsx insert orders als "e-mails" -- verwarrend datamodel

| Aspect | Score |
|--------|-------|
| Functionaliteit | 4 |
| UX-kwaliteit | 5 |
| Automatisering | 5 |
| Codekwaliteit | 4 |
| Stabiliteit | 3 |

---

### 2. Orders

**Wat is gebouwd:**
- Orderlijst met server-side paginering, zoeken, statusfilters
- Sorteerbare kolommen (klant, gewicht, status, datum)
- KPI-strip (nieuw, in behandeling, onderweg, afgeleverd, spoed)
- Nieuwe order formulier met multi-tab layout (algemeen, financieel, vrachtdossier)
- Freight lines met laden/lossen stops
- Vrachtlijst samenvatting
- Order detail pagina met volledige CRUD
- Status state machine (DRAFT > PENDING > PLANNED > IN_TRANSIT > DELIVERED, + CANCELLED)
- Frontend validatie van status transitions
- Inline editing met waarschuwing bij PLANNED+ status
- Cancel/reopen flow met reden
- SmartLabel printing
- CMR document generatie
- POD (Proof of Delivery) viewer
- Label Workshop
- Bulk CSV import dialog
- Realtime subscription voor order-updates
- Automatische bevestigingsmail bij order-goedkeuring (send-confirmation)
- Order cost calculator gekoppeld aan client rates

**Wat ontbreekt:**
- Geen batch status updates
- Geen export naar CSV/Excel vanuit orderslijst
- Geen order history/audit trail zichtbaar in UI
- Validatie eenheid beperkt tot 3 opties (Pallets, Colli, Box)
- `estimatedDelivery` is naief berekend (created_at + offset)
- Geen multi-stop orders (alleen laden + lossen)
- Weight berekening mist handling voor `is_weight_per_unit` in sommige contexten

**UX-kwaliteit:** Goed. Professionele tabel, animaties, goede filtering. NewOrder formulier is complex maar functioneel.

**Automatiseringsgraad:** Gemiddeld. Status transitions zijn handmatig, automatische bevestigingsmail is aanwezig.

**Risico's:**
- `useCreateOrder` accepteert `any` type -- geen type safety
- Geen DB constraint voor status transitions (alleen frontend check)
- LocalStorage test orders in OrderDetail (debug code in productie)

| Aspect | Score |
|--------|-------|
| Functionaliteit | 4 |
| UX-kwaliteit | 4 |
| Automatisering | 3 |
| Codekwaliteit | 3 |
| Stabiliteit | 4 |

---

### 3. Planning

**Wat is gebouwd:**
- Drag-and-drop planning board met @dnd-kit
- Dag- en weekweergave
- VRP solver (Vehicle Routing Problem) met:
  - Constraint checking (capaciteit kg/pallets, ADR, koeling)
  - Time window validatie
  - Nearest-neighbor + 2-opt route optimalisatie
  - Proximity-based clustering
- Kaartweergave met geplande routes (PlanningMap)
- Automatische chauffeur-suggestie op basis van certificeringen
- Draft opslag per dag in localStorage
- Afstandswaarschuwingen bij ver uit elkaar liggende stops
- Regio-gebaseerde groepering van ongeassigneerde orders
- Vehicle availability panel
- Datum navigatie met draft bewaring bij wisseling
- Auto-restore van concept-planningen

**Wat ontbreekt:**
- Geen integratie met externe route-API (Google/HERE) voor echte afstanden
- Planning wordt niet naar DB gepersisteerd (alleen localStorage + bevestiging naar trips)
- Geen drag-and-drop herschikking binnen een voertuig (alleen toevoegen)
- Geen capaciteitsvisualisatie (progressbar per voertuig ontbreekt in sidebar)
- Geen rekening met rijtijden EU 561 in planningsfase

**UX-kwaliteit:** Goed. DnD werkt, kaart is informatief, weekweergave geeft overzicht.

**Automatiseringsgraad:** Hoog. VRP solver doet automatische toewijzing met constraints.

**Risico's:**
- LocalStorage-only drafts: data gaat verloren bij cache wissen
- Haversine afstanden wijken 20-40% af van werkelijke wegafstanden
- 2-opt heeft O(n^3) complexiteit per iteratie -- kan traag worden bij 20+ stops

| Aspect | Score |
|--------|-------|
| Functionaliteit | 4 |
| UX-kwaliteit | 4 |
| Automatisering | 4 |
| Codekwaliteit | 4 |
| Stabiliteit | 3 |

---

### 4. Dispatch

**Wat is gebouwd:**
- Trip management met status flow (CONCEPT > VERZONDEN > ONTVANGEN > GEACCEPTEERD > ACTIEF > VOLTOOID)
- Trip creation met stops vanuit planning
- Dispatch naar chauffeur met validatie (chauffeur + adressen + stops)
- Notificatie-systeem via DB notifications tabel
- Automatische order-status sync (ACTIEF > IN_TRANSIT, VOLTOOID > DELIVERED)
- Auto-complete trip wanneer alle stops terminal zijn (via Realtime subscription)
- Datum-filtering en statusfiltering
- Zoeken op ritnummer, adres, contactpersoon
- KPI cards (concept, verzonden, actief, voltooid, problemen)
- Expandable trip cards met stop-details

**Wat ontbreekt:**
- Geen drag-and-drop herschikking van stops
- Geen live GPS tracking weergave op dispatchscherm
- Geen communicatiekanaal naar chauffeur (alleen notificatie)
- Geen herplanning na geweigerde rit

**UX-kwaliteit:** Goed. Overzichtelijke kaarten, duidelijke status flow.

**Automatiseringsgraad:** Hoog. Auto-complete trips, auto-status sync, validatie bij dispatch.

**Risico's:**
- Cascade updates van order statuses zijn niet transactioneel (kunnen half falen)
- `canTransitionTrip` is geimporteerd maar niet zichtbaar gevalideerd in alle flows

| Aspect | Score |
|--------|-------|
| Functionaliteit | 4 |
| UX-kwaliteit | 4 |
| Automatisering | 4 |
| Codekwaliteit | 4 |
| Stabiliteit | 3 |

---

### 5. Chauffeurs

**Wat is gebouwd:**
- ChauffeurApp (mobiele interface):
  - PIN authenticatie met SHA-256 hashing en lockout (3 pogingen, 5 min block)
  - Verplichte PIN-wijziging bij eerste login
  - Legacy PIN migratie (plaintext naar hash)
  - GPS tracking met buffered batch-upload (30s interval)
  - Tijdregistratie (clock in/out, pauze start/end)
  - EU 561 rijtijdmonitoring (4.5u continu, 9u dagelijks)
  - Geofence detectie (200m radius) met HITL bevestiging
  - Proof of Delivery (handtekening + foto's + ontvanger)
  - Offline POD opslag via IndexedDB met sync
  - Trip Flow UI voor stop-voor-stop navigatie
- Chauffeurs management pagina:
  - CRUD voor chauffeurs met certificeringen
  - Status filtering (beschikbaar, onderweg, rust, ziek)
  - KPI cards
- ChauffeursRit (ritplanning per voertuig):
  - Leaflet kaartweergave per rit
  - Stop timeline met laden/lossen
  - Trip creation en dispatch vanuit dit scherm

**Wat ontbreekt:**
- Geen echte push notifications (alleen DB notification)
- Geen chat/messaging tussen dispatcher en chauffeur
- Geen foto-upload naar cloud storage (alleen base64 in POD)
- Geen rijtijd-historiek/rapportage
- DriveTimeMonitor waarschuwt maar blokkeert niet

**UX-kwaliteit:** Goed voor mobiel. PIN flow is veilig. GPS en geofence zijn innovatief.

**Automatiseringsgraad:** Hoog. Automatische GPS tracking, geofence-detectie, EU 561 monitoring, offline sync.

**Risico's:**
- GPS accuracy kan laag zijn indoor (accuracy niet gevalideerd)
- driver_positions tabel wordt snel groot zonder cleanup
- Offline POD sync kan conflicteren als stop status al is gewijzigd

| Aspect | Score |
|--------|-------|
| Functionaliteit | 4 |
| UX-kwaliteit | 4 |
| Automatisering | 5 |
| Codekwaliteit | 3 |
| Stabiliteit | 3 |

---

### 6. Fleet (Vloot)

**Wat is gebouwd:**
- Voertuiglijst gegroepeerd per type (busje, bakwagen, koelwagen, trekker)
- Filters op type, status, certificering
- Zoek op naam/kenteken
- Real-time beladingsgraad (utilization) vanuit actieve trips
- Verlopen onderhoud waarschuwing
- VehicleDetail pagina met 5 tabs:
  - Specificaties (type, merk, bouwjaar, capaciteit, uitrusting)
  - Documenten (APK, verzekering, ADR, tachograaf) met vervaldatum tracking
  - Onderhoud (planning + voltooiing)
  - Beschikbaarheid (4-weken kalenderweergave)
  - Prestaties (placeholder)
- CRUD voor voertuigen, documenten, onderhoud
- Capaciteit in kg en palletplaatsen + laadruimte afmetingen

**Wat ontbreekt:**
- Prestaties tab is leeg/placeholder
- Geen fuel/brandstof tracking
- Geen kilometerstand bijhouden
- Geen koppeling naar OBD/telematica
- Geen foto's van voertuigen
- Geen export van vlootdata

**UX-kwaliteit:** Goed. Card layout per type, progress bars voor beladingsgraad.

**Automatiseringsgraad:** Gemiddeld. Real-time utilization is goed, maar onderhoud is handmatig.

**Risico's:**
- Geen automatische herinnering voor verlopen documenten (alleen visueel)
- Status "defect" moet handmatig worden ingesteld

| Aspect | Score |
|--------|-------|
| Functionaliteit | 3 |
| UX-kwaliteit | 4 |
| Automatisering | 2 |
| Codekwaliteit | 4 |
| Stabiliteit | 4 |

---

### 7. Facturatie

**Wat is gebouwd:**
- Factuurlijst met zoek, statusfilters, sortering
- Factuur aanmaken vanuit afgeleverde orders per klant
- Client rates systeem (per_km, per_pallet, per_rit, toeslagen)
- Automatische concept-factuur generatie (useAutoInvoiceGeneration)
- PDF generatie met jsPDF (professionele layout met header, regels, BTW, betaalgegevens)
- CSV export (Dutch semicolon format)
- UBL 2.1 XML export (compatibel met NL boekhoudtools)
- Status flow (concept > verzonden > betaald > vervallen)
- Factuur detail dialog met acties
- Route-afstand schatting voor per-km tarieven (haversine * 1.3 of 150km fallback)
- Auto invoice number generatie via DB RPC
- Vervaldatum berekening vanuit klant payment_terms

**Wat ontbreekt:**
- Geen creditnota's
- Geen betalingsherinnering (automatisch)
- Geen koppeling met boekhoudpakket (Exact/Twinfield config in Settings maar niet functioneel)
- Geen factuur per e-mail versturen (status "verzonden" is handmatig)
- Rapportage pagina (Rapportage.tsx) is basic -- bar + pie charts, geen drill-down

**UX-kwaliteit:** Goed. Clean tabel, modale factuurdetails, export opties.

**Automatiseringsgraad:** Hoog. Auto concept-factuur generatie, rate-based berekening, UBL export.

**Risico's:**
- Hardcoded bedrijfsgegevens in PDF/UBL ("Royalty Cargo B.V.", IBAN, KVK, BTW)
- Auto invoice polls elke 60s -- kan CPU/queries verspillen als er niets te doen is
- Distance fallback van 150km is zeer onnauwkeurig

| Aspect | Score |
|--------|-------|
| Functionaliteit | 4 |
| UX-kwaliteit | 4 |
| Automatisering | 4 |
| Codekwaliteit | 4 |
| Stabiliteit | 3 |

---

### 8. Klanten

**Wat is gebouwd:**
- Klantenlijst met zoek en slide-out detail panel
- ClientDetailPanel met klantgegevens, contactinfo, rates, orderhistorie
- Nieuwe klant dialog
- Actieve orders count
- Status (actief/inactief)
- ClientPortal (apart portaal voor klanten):
  - Supabase auth login
  - Order overzicht per klant
  - Nieuwe order aanvragen
  - Matching op email of user_metadata.client_id

**Wat ontbreekt:**
- Geen klant-specifieke communicatie-historie
- Geen SLA-configuratie per klant
- Geen klant-dashboard met KPIs
- ClientPortal is minimaal (geen track & trace integratie)
- Geen klant-import (CSV)

**UX-kwaliteit:** Goed. Clean tabel met slide-out panel.

**Automatiseringsgraad:** Laag. Meeste handelingen zijn handmatig.

**Risico's:**
- ClientPortal client matching op email is fragiel (case-sensitivity, meerdere emails)
- Geen rate-card versioning

| Aspect | Score |
|--------|-------|
| Functionaliteit | 3 |
| UX-kwaliteit | 3 |
| Automatisering | 2 |
| Codekwaliteit | 3 |
| Stabiliteit | 4 |

---

### 9. Settings

**Wat is gebouwd:**
- Branding (bedrijfsnaam, primaire kleur, logo upload)
- Notificatie-instellingen (nieuwe order, annulering, deadline, dagelijks/wekelijks)
- SMS configuratie (Twilio/MessageBird provider, templates, event triggers)
- Integraties (Slack, Teams, Exact Online, Twinfield, Samsara, Transfollow)
- Master Data sectie
- Settings persistentie via useSettings hooks
- Gebruikersbeheer (UsersPage):
  - Profiles + user_roles
  - Rol wijzigen (admin/medewerker)
  - KPI stats

**Wat ontbreekt:**
- Alle integraties zijn UI-only (geen werkende backend connecties)
- SMS is niet functioneel (alleen configuratie opslag)
- Geen API key management
- Geen audit log van settings wijzigingen
- Geen tenant billing/subscription beheer

**UX-kwaliteit:** Goed. Tabbed layout, clean forms.

**Automatiseringsgraad:** Laag. Settings worden opgeslagen maar niet toegepast.

**Risico's:**
- API keys worden als plaintext in DB opgeslagen (geen encryptie)
- Geen validatie van webhook URLs
- RBAC is minimaal (alleen admin/medewerker)

| Aspect | Score |
|--------|-------|
| Functionaliteit | 2 |
| UX-kwaliteit | 3 |
| Automatisering | 1 |
| Codekwaliteit | 3 |
| Stabiliteit | 3 |

---

### 10. Dashboard

**Wat is gebouwd:**
- Operationeel overzicht met 6 KPIs
- Financial KPI widget
- Operational Forecast widget
- Recente orders tabel
- Spoed/achterstallige orders signalering
- Voertuig overzicht

**Wat ontbreekt:**
- Niet configureerbaar (geen widget drag-and-drop)
- Geen historische trend charts
- Geen real-time updates (geen Realtime subscription)
- Geen personalisatie per gebruiker

**UX-kwaliteit:** Goed. Clean layout met motion animaties.

**Automatiseringsgraad:** Gemiddeld. Data wordt automatisch berekend maar niet proactief gesignaleerd.

| Aspect | Score |
|--------|-------|
| Functionaliteit | 3 |
| UX-kwaliteit | 4 |
| Automatisering | 2 |
| Codekwaliteit | 4 |
| Stabiliteit | 4 |

---

### 11. Track & Trace

**Wat is gebouwd:**
- Publieke pagina (geen auth vereist)
- Zoek op ordernummer
- Visuele timeline met 5 stappen (ontvangen > in behandeling > gepland > onderweg > afgeleverd)
- Status badge per stap
- Order details (klant, adressen, gewicht)

**Wat ontbreekt:**
- Geen real-time locatie op kaart
- Geen ETA weergave
- Geen proactieve notificatie (e-mail/SMS)
- Geen shareable tracking link
- Branding is hardcoded "Royalty Cargo"

**UX-kwaliteit:** Goed. Simpel en duidelijk voor eindklanten.

**Automatiseringsgraad:** Laag. Puur status-weergave, geen proactieve communicatie.

| Aspect | Score |
|--------|-------|
| Functionaliteit | 2 |
| UX-kwaliteit | 4 |
| Automatisering | 1 |
| Codekwaliteit | 4 |
| Stabiliteit | 4 |

---

### 12. Exceptions

**Wat is gebouwd:**
- Delivery exceptions uit DB (delivery_exceptions tabel)
- Ad-hoc exceptions berekend uit orders data:
  - Ontbrekende data (missing_fields op DRAFT orders)
  - SLA risico (orders langer dan 24u in DRAFT)
  - Vertragingen (IN_TRANSIT langer dan 3u)
  - Capaciteitsproblemen (uit voertuigdata)
- Urgency levels (critical, warning, info)
- Resolve exception functionaliteit
- Exception count polling (60s interval)
- Koppeling naar relevante orders

**Wat ontbreekt:**
- Geen automatische escalatie
- Geen toewijzing aan medewerker
- Geen opmerkingen/thread per exception
- Geen historiek van opgeloste exceptions
- Geen SLA-configuratie (hardcoded 3u/24u thresholds)

**UX-kwaliteit:** Goed. Duidelijke urgentie-kleuring, actie-knoppen.

**Automatiseringsgraad:** Gemiddeld. Detectie is automatisch, maar oplossing is handmatig.

| Aspect | Score |
|--------|-------|
| Functionaliteit | 3 |
| UX-kwaliteit | 4 |
| Automatisering | 3 |
| Codekwaliteit | 4 |
| Stabiliteit | 4 |

---

## Totaaloverzicht Scores

| Module | Functionaliteit | UX | Automatisering | Codekwaliteit | Stabiliteit | Gem. |
|--------|:-:|:-:|:-:|:-:|:-:|:-:|
| Inbox/Email | 4 | 5 | 5 | 4 | 3 | **4.2** |
| Orders | 4 | 4 | 3 | 3 | 4 | **3.6** |
| Planning | 4 | 4 | 4 | 4 | 3 | **3.8** |
| Dispatch | 4 | 4 | 4 | 4 | 3 | **3.8** |
| Chauffeurs | 4 | 4 | 5 | 3 | 3 | **3.8** |
| Fleet | 3 | 4 | 2 | 4 | 4 | **3.4** |
| Facturatie | 4 | 4 | 4 | 4 | 3 | **3.8** |
| Klanten | 3 | 3 | 2 | 3 | 4 | **3.0** |
| Settings | 2 | 3 | 1 | 3 | 3 | **2.4** |
| Dashboard | 3 | 4 | 2 | 4 | 4 | **3.4** |
| Track & Trace | 2 | 4 | 1 | 4 | 4 | **3.0** |
| Exceptions | 3 | 4 | 3 | 4 | 4 | **3.6** |
| **Gemiddeld** | **3.3** | **3.9** | **3.0** | **3.7** | **3.5** | **3.5** |

---

## Top 10 Verbeterpunten (geprioriteerd op impact)

### 1. Hardcoded bedrijfsgegevens verwijderen (CRITICAL)
**Impact:** Blokkeert multi-tenant gebruik en elke andere klant
**Locatie:** invoiceUtils.ts (PDF/UBL), TrackTrace.tsx, ChauffeurApp.tsx
**Actie:** Bedrijfsnaam, adres, IBAN, KVK, BTW-nr uit tenant-record laden i.p.v. hardcoded "Royalty Cargo B.V."

### 2. Planning-state naar database verplaatsen (HIGH)
**Impact:** Planningen gaan verloren bij cache wissen; geen samenwerking tussen planners
**Locatie:** Planning.tsx (localStorage), planningUtils.ts
**Actie:** Assignments opslaan in DB (trips tabel of planning_drafts tabel), localStorage als fallback/cache

### 3. Track & Trace uitbreiden met live tracking en notificaties (HIGH)
**Impact:** Klantervaring en concurrentiepositie
**Locatie:** TrackTrace.tsx, send-confirmation edge function
**Actie:** GPS-positie tonen op kaart, ETA berekening, proactieve e-mail/SMS bij statuswijzigingen, shareable link per order

### 4. Settings-integraties daadwerkelijk implementeren (HIGH)
**Impact:** Zonder werkende integraties (Exact Online, Slack, SMS) is het systeem een silo
**Locatie:** Settings.tsx, nieuwe edge functions nodig
**Actie:** Minimaal Slack webhooks + SMS (Twilio) + Exact Online facturatie-export functioneel maken

### 5. Test-coverage toevoegen (HIGH)
**Impact:** Refactoring en feature-toevoeging is riskant zonder tests
**Locatie:** Geen test bestanden gevonden behalve vitest.config.ts
**Actie:** Unit tests voor VRP solver, route optimizer, invoice calculations, status transitions. Integration tests voor edge functions.

### 6. Facturatie vervolledigen met creditnota's en herinneringen (MEDIUM)
**Impact:** Financiele workflow is incompleet
**Locatie:** useInvoices.ts, Facturatie.tsx
**Actie:** Creditnota support, automatische herinneringsmails bij vervallen facturen, koppeling met boekhoudsoftware

### 7. Echte route-afstanden integreren (MEDIUM)
**Impact:** Planning-kwaliteit en factuurnauwkeurigheid (per-km tarieven)
**Locatie:** routeOptimizer.ts, vrpSolver.ts, useInvoices.ts
**Actie:** Google Routes API of HERE integreren voor echte wegafstanden en reistijden i.p.v. haversine * factor

### 8. Offline-first versterken (MEDIUM)
**Impact:** Chauffeurs werken regelmatig in gebieden zonder bereik
**Locatie:** ChauffeurApp.tsx, offlineStore.ts
**Actie:** Service Worker met caching, offline trip-data, queue-based GPS/POD uploads, conflict resolution

### 9. Type-safety en `any` types elimineren (MEDIUM)
**Impact:** Bugs en onderhoudsproblemen
**Locatie:** useCreateOrder (any), OrderDetail.tsx (any), useTrips.ts (type assertions)
**Actie:** Strict types voor alle Supabase queries, genereer types uit database schema, elimineer alle `as any` casts

### 10. Klantmodule verdiepen (MEDIUM)
**Impact:** Klantbeheer is kern van een TMS
**Locatie:** Clients.tsx, ClientPortal.tsx, useClients.ts
**Actie:** SLA-configuratie per klant, communicatiehistorie, klant-dashboard met KPIs, rate-card versioning, CSV import

---

## Architectuurobservaties

**Sterke punten:**
- Consistente tech-stack (React + TanStack Query + Supabase + Tailwind)
- Goede scheiding van hooks en UI-componenten
- AI-integratie is innovatief en goed geimplementeerd
- Multi-tenant basis is aanwezig (tenant_id op alle tabellen)
- Real-time subscriptions op orders en trip_stops
- UBL export is een zeldzaam en waardevol feature voor NL markt

**Aandachtspunten:**
- Geen geautomatiseerde tests
- Database schema validaties ontbreken grotendeels (status transitions alleen frontend)
- Haversine duplicatie in 3+ bestanden (routeOptimizer, useInvoices, useDriverTracking)
- Polling patterns (auto-invoice 60s, exceptions 60s) zijn niet efficient -- beter Realtime subscriptions
- Geen error boundary components (uncaught errors crashen hele app)
- Geen logging/monitoring framework (alleen console.error)
