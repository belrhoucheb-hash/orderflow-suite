# Changelog

## [2026-04-02] — Grote update: Automatisering, Design System, Security, Volledige TMS

### Nieuw
- **Compleet TMS platform** — 20+ pagina's: Dashboard, Orders, Inbox, Mail, Planning, Dispatch, ChauffeurApp, Chauffeurs, Fleet, Facturatie, Rapportage, Track & Trace, Exceptions, Clients, Settings, Login
- **Dispatch to Delivery UI** — Trips, stops, POD-beheer, TripFlow component
- **AI Corrections feedback loop** — Dispatcher-correcties worden automatisch teruggestuurd naar Gemini prompt voor toekomstige orders van dezelfde klant
- **PDF factuur generatie** — Professionele layout via jsPDF met logo, factuurregels en BTW-berekening
- **Offline POD opslag** — IndexedDB-opslag met automatische sync bij verbinding, amber banner bij ongesynchroniseerde PODs
- **Geofence aankomstdetectie** — Automatische bevestigingsmelding bij < 200m van bestemming (HITL)
- **Rijtijdregistratie EU 561/2006** — DriveTimeMonitor: 4,5u rijpauze, 9u dagmaximum, automatische waarschuwingen
- **2-opt route optimalisatie** — Post-processing op nearest-neighbor voor betere routes
- **Client extraction templates** — Automatische opbouw na 5+ orders van dezelfde klant
- **Chauffeur PIN authenticatie** — 4-cijferige PIN met 3-pogingen lockout
- **SLA monitor** — Server-side monitoring via pg_cron (elke 10 min, WARNING/KRITIEK niveaus)
- **Auto trip-completion** — Bij alle stops klaar wordt billing automatisch op GEREED gezet
- **Auto concept-factuur** — Automatische aanmaak bij billing GEREED (HITL: alleen concept)
- **Auto-approve orders** — Bij confidence >=95% + bekende klant (HITL-conform)
- **Email polling cron** — Automatisch elke 5 minuten via pg_cron
- **Wachtwoord reset flow** — Via Supabase Auth
- **OnboardingWizard** — Nieuw gebruikerswelkom
- **BarcodeScanner component** — Voor warehouse en POD scanning
- **MobileNav** — Mobiele bottom sheet navigatie
- **KeyboardShortcuts** — Toetsenbordsneltoetsen voor power users
- **Edge Functions** — import-email, send-confirmation, send-follow-up

### Verbeterd
- **Inbox refactor** — Van 926 naar 344 regels, logica verplaatst naar useInbox.ts hook
- **Server-side paginering** — Orders pagina (25/pagina, exacte count)
- **NewOrder formuliervalidatie** — 6 verplichte velden, rode borders, toasts
- **Settings persistentie** — Opslag naar DB via tenant_settings tabel + useSettings hook
- **Per-veld confidence scoring** — Groen/oranje/rood indicators in InboxReviewPanel
- **Fleet beladingsgraad** — Echte data via useVehicleUtilization hook
- **Datum/tijd/referentie/contact extractie** — Toegevoegd aan parse-order prompt
- **Gemini responseSchema enforcement** — Gestructureerde output
- **2 few-shot examples** — Voor betere extractie-accuracy
- **Facturatie per_km berekening** — Haversine afstand i.p.v. gewicht als proxy
- **AI confidence normalisatie** — 0-1 float genormaliseerd naar 0-100% (parse-order + UI)
- **Dispatch chauffeursnaam** — Toont echte naam i.p.v. "Chauffeur toegewezen"
- **Exceptions badge in sidebar** — Rode counter met 60s refresh
- **Kolomsortering** — Op Orders + Facturatie tabellen
- **Planning auto-save** — Naar localStorage met herstel bij navigatie
- **NewOrder responsive** — Grid breakpoints, scrollbare tabellen
- **Consistente loading/error states** — Fleet, Dashboard, Clients
- **Consistente SearchInput** — Orders, Chauffeurs
- **Auto-extractie bij email selectie** — Geen handmatig "Extraheer" klikken meer nodig
- **Europallet standaard afmetingen** — AI vult automatisch 120x80x150 in; rolcontainer 80x67x170
- **Adresvalidatie** — Alleen stad (bijv. "Groningen") wordt geflagged; geldig adres vereist straat + huisnummer + stad

### Gefixt
- **Factuurregels klik** (#18) — Opent nu detail dialog i.p.v. navigatie naar niet-bestaande pagina
- **Factuurcreatie** (#19) — useCreateInvoice queryde 'tenant_users' i.p.v. 'tenant_members'
- **INGEPLAND tab klik** (#20) — stopPropagation op onPointerDown zodat dnd-kit clicks niet opslokt
- **Auto-extractie trigger** (#22) — AI-extractie bij selectie van onverwerkte email
- **Europallet afmetingen** (#21) — Confidence penalty niet meer bij afleidbare afmetingen
- **Adresvalidatie** (#23) — Server-side check: geen cijfer in adres = missing_fields + -20 confidence; field_confidence gecapt op 40 voor city-only adressen
- **"+ Nieuwe factuur" knop** — Werkende dialog met klant/order selectie
- **Dubbele utility functies** — Verwijderd uit Inbox

### Security
- **Gemini API key uit frontend verwijderd** — Alle AI calls nu via edge function
- **execute_sql RPC verwijderd** — Debug code verwijderd uit Planning
- **tenant_id + RLS op ai_corrections** — Tenant isolatie voor correcties
- **Debug bypass verwijderd** — Geen ongeautoriseerde toegang meer
- **Tenant isolatie dispatch** — RLS + send-follow-up beveiligd
- **.env uit git tracking verwijderd** — Exposed credentials opgelost
- **.env.example template** — Veilig template zonder echte waarden

### Design System
- **Volledige kleurenschaal** — Primary 50-950, semantic + status kleuren
- **Typografie tokens** — Inter UI (body) + Space Grotesk (display/headers)
- **Component classes** — page-container, data-table, badge-status, etc.
- **Herbruikbare components** — StatusBadge, PageHeader, KPIStrip, EmptyState, LoadingState, SearchInput, SortableHeader
- **Toast systeem geunificeerd** — Gemigreerd naar sonner (11 bestanden)
- **Status kleuren gecentraliseerd** — Eenmalig in statusColors.ts
- **PageHeader/LoadingState/EmptyState** — Toegepast op 13 pagina's
- **Mobiele navigatie** — MobileNav bottom sheet

### Automatisering (geschatte impact)
| Item | Impact |
|------|--------|
| Email polling cron (5 min) | +5% inbox automatisering |
| Auto-approve bij >=95% confidence + bekende klant | +10-15% orderverwerking |
| Auto trip-completion bij alle stops klaar | +5% dispatch automatisering |
| Auto concept-factuur bij billing GEREED | +10% facturatie automatisering |
| Planning maakt automatisch trips + stops bij bevestiging | +10% planning automatisering |
| AI corrections feedback loop | +5-10% extractie accuracy over tijd |
| Client extraction templates (na 5+ orders) | +5-8% extractie accuracy per klant |
| 2-opt route optimalisatie | +3-5% route efficiency |
| Geofence aankomstdetectie | +5% dispatch automatisering |
| Rijtijdregistratie EU 561/2006 | Compliance automatisering |
| SLA monitor (pg_cron, 10 min) | Proactieve alerts |
| Auto-extractie bij email selectie | -2 kliks per order |

### Database migraties
- invoices, status constraints, warehouse reception, audit log
- multi-tenant fix, ai_corrections, dispatch-to-delivery, dispatch RLS
- driver tracking, POD/CMR
- 19 ontbrekende tabellen toegevoegd aan Supabase types.ts
