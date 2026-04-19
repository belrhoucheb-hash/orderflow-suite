# Sprint 3, Fase 1, Onderzoek

Opgeleverd 2026-04-19. READ-ONLY rapport. Geen code- of schema-wijzigingen. Op basis van huidige `main` (laatste commit `eb987c2 sprint-2(engine): fix Edge Function schema-mismatch`).

De leidende conclusie: het planbord is al vér doorontwikkeld (DndContext, VRP-solver, postcode-clustering in sidebar, draft-opslag, week-view). Sprint 3 is vooral een **upgrade** van de bestaande flow, niet een greenfield bouw. Hergebruik loont. Twee dingen ontbreken op datamodel-niveau en die bepalen of we groen of rood staan: zie §4.

## 1. Supabase schema-inventarisatie

### 1.1 Tabellen direct relevant voor planning

**`orders`** (baseline regel 1561-1638). Relevante velden: `id`, `status`, `driver_id`, `vehicle_id`, `stop_sequence`, `priority`, `transport_type`, `pickup_address`, `delivery_address`, `quantity`, `weight_kg`, `is_weight_per_unit`, `requirements[]`, `time_window_start`, `time_window_end`, `geocoded_pickup_lat/lng`, `geocoded_delivery_lat/lng`, `department_id` NOT NULL, `shipment_id`, `leg_number`, `leg_role`, `client_id`, `info_status`.

Toewijzing chauffeur+voertuig is dus **direct op `orders`** (`driver_id`, `vehicle_id`, `stop_sequence`), plus parallel op `trips`. Er is geen aparte `assignments`-tabel.

**`trips`** (baseline regel 2200-2223). De facto assignment-tabel. Velden: `trip_number`, `vehicle_id` NOT NULL, `driver_id`, `dispatch_status` enum, `planned_date` NOT NULL, `planned_start_time`, `actual_start_time/end_time`, `total_distance_km`, `total_duration_min`, `dispatcher_id`, `notes`. `dispatch_status` enum: `CONCEPT, VERZENDKLAAR, VERZONDEN, ONTVANGEN, GEACCEPTEERD, GEWEIGERD, ACTIEF, VOLTOOID, AFGEBROKEN`. Géén `proposed`-staat voor auto-plan, wel `CONCEPT`.

**`trip_stops`** (baseline regel 2169-2194). Per stop: `trip_id`, `order_id`, `stop_type` (PICKUP, DELIVERY, DEPOT), `stop_sequence`, `stop_status`, `planned_address`, `planned_time`, `planned_window_start/end`, `window_status`. Fijnmazig genoeg voor routeplanning.

**`drivers`** (baseline regel 1309-1328). Velden: `name`, `email`, `phone`, `license_number`, `certifications[]`, `status` enum (beschikbaar, onderweg, rust, ziek), `current_vehicle_id`, `is_active`, `hourly_cost`, `km_allowance`, PIN-velden. **Ontbreekt: contracturen, per-dag beschikbaarheid, rooster, verlof.**

**`vehicles`** (baseline regel 2383-2404). Velden: `code`, `name`, `plate`, `type`, `capacity_kg`, `capacity_pallets`, `features[]`, `cargo_length_cm`, `cargo_width_cm`, `cargo_height_cm`, `is_active`, `status`, `assigned_driver`, `fuel_consumption`. **Geen directe `vehicle_type_id` FK op vehicles** ondanks dat Sprint 2-plan dit voorzag (check §4).

**`vehicle_types`** (baseline regel 2522-2532 + ALTER via `20260419000050_vehicle_types_extend.sql`). Uiteindelijk: `code`, `name`, `sort_order`, `default_capacity_kg`, `default_capacity_pallets`, `max_length_cm`, `max_width_cm`, `max_height_cm`, `max_weight_kg`, `max_volume_m3`, `max_pallets`, `has_tailgate`, `has_cooling`, `adr_capable`, `is_active`. **Bevat alles wat CP-04 nodig heeft voor laadvermogen-check.**

**`vehicle_availability`** (baseline regel 2255-2263). `vehicle_id`, `date`, `status`, `reason`, `tenant_id`. Bestaat al, kan basis zijn voor CP-05 dagsetup.

**`consolidation_groups`** en **`consolidation_orders`** (baseline regel 1162-1194). Volledig dataschema voor clusters (naam, planned_date, status enum VOORSTEL/GOEDGEKEURD/INGEPLAND/VERWORPEN, vehicle_id, total_weight_kg, utilization_pct). Join-tabel met stop_sequence. **Niet gebruikt door huidige Planning-UI**, maar concept klopt perfect met CP-02/CP-03. Sterk kandidaat voor hergebruik in plaats van nieuwe tabel.

**`delivery_exceptions`** (baseline regel 1215-1233). Bestaat, kan later gebruikt worden voor "needs manual" bucket als we dat niet liever in consolidation_groups als status doen.

### 1.2 Wat er NIET is

Geen tabel `daily_capacity`, `driver_availability`, `driver_schedule`, `assignments` (in Sprint 3-zin), `driver_leave`, `routes`.

### 1.3 RLS, helpers, triggers

- Alle tabellen hebben RLS ENABLED met pattern `tenant_id = public.current_tenant_id()` (geldt voor `authenticated` rol) en een service-role policy die alles toestaat.
- Helper-functies: `current_tenant_id()`, `get_user_tenant_id()`, `is_pricing_engine_enabled()` (uit Sprint 2). Zelfde pattern voor nieuwe tabellen te kopiëren.
- `update_updated_at_column()` trigger bestaat, gebruikt door vehicle_types en anderen.
- `order_events` (audit-log) en `pipeline_events` (event-pipeline) bestaan, geschikt voor audit-trail van override-acties (CP-04) en voor het kicken van auto-plan als je dat async wil.

### 1.4 Edge functions

Aanwezig in `supabase/functions/`: `dispatch-scheduler`, `planning-trigger`, `pipeline-trigger`, `calculate-order-price` (Sprint 2), `_shared/pricingEngine.ts`. **`_shared/` folder is al beschikbaar als locatie voor shared TypeScript-logica.**

## 2. Frontend-inventarisatie, bestaand planbord

Het bestaande planbord is significant meer ontwikkeld dan de prompt suggereert. Waardevol, want dit is onze vertrek-stack.

### 2.1 Hoofdcomponent `src/pages/Planning.tsx`

926 regels. Bevat:

- DndContext (dnd-kit Core) met PointerSensor (5px activation) en closestCenter collision, regel 713.
- `DragOverlay` voor drag-preview, regel 850-853.
- Datumselectie via `PlanningDateNav` met dag- en week-modus (regel 95-96, 758-763).
- State: `assignments: Record<vehicleId, PlanOrder[]>` in memory, plus Supabase draft-persistence via `usePlanningDrafts` hook.
- Ongeplande orders fetch (TanStack Query) met filter op `status = PENDING` en `delivery_date` matching (regel 237-290).
- `handleDragEnd` (regel 405-474): validatie van ADR/Koeling features, haversine distance-warning (> 150 km), capaciteit-check.
- `handleConfirm` (regel 595-705): schrijft orders (status PLANNED, vehicle_id, stop_sequence) en creëert trips + trip_stops met stop_type onderscheid PICKUP/DELIVERY.
- `handleAutoPlan` (regel 502-520): roept `solveVRP` aan (VRP-solver bestaat!) en merged met bestaande assignments.
- `handleCombineTrips` (regel 527-593): heuristiek om kleine routes samen te voegen bij postcode-verschil ≤ 15.
- Draft-autosave debounced 2s, realtime refresh via Supabase channels.

### 2.2 Planning-subcomponenten (`src/components/planning/`)

- **`PlanningVehicleCard.tsx`** (339 regels). Droppable zone per voertuig. Twee tabs: ROUTE (sortable drag-lijst met ETA's) en INGEPLAND (samenvatting). Capaciteits-progress bar voor gewicht + pallets (regel 152-180). Chauffeur-selector (regel 124-137), start-tijd input (regel 140-146), route-stats (totale tijd, km, utilization %), optimize-knop (nearest-neighbor). **Hergebruikbaar als swim-lane basis**, maar concept is vehicle-first, niet driver-first.
- **`PlanningUnassignedSidebar.tsx`**. Ongeplande orders gegroepeerd per postcode-regio. **Dit IS al de "Open te plannen" lane uit CP-02**, alleen als sidebar gerenderd.
- **`PlanningWeekView.tsx`** (291 regels). 7-kolom × voertuigen tabel. Per cel: stops-teller, totaal gewicht, status-kleur (amber voor CONCEPT, groen voor PLANNED). Klikbaar naar dagweergave. Basis voor CP-07, maar per voertuig niet per chauffeur.
- **`PlanningMap.tsx`**. Leaflet-kaart met OSM tiles, markers per order (kleur per vehicle), warehouse-marker, polylines per route.
- **`PlanningDateNav.tsx`**. Dag- en week-modus switcher.
- **`PlanningOrderCard.tsx`**, **`PlanningOrderRow.tsx`**. Presentational.

### 2.3 State, data, hooks

- TanStack Query overal. Geen Redux.
- `useDrivers`, `useVehicles`, `usePlanningDrafts`, `useSavePlanningDraft`, `useLoadPlanningDraft`, `usePlanningDraftsRealtime` zijn voorbeelden van het hook-patroon.
- Draft-persistence: Supabase-tabel plus localStorage fallback.

## 3. Routing, clustering, postcode

### 3.1 Postcode-extractie

Geen aparte `postcode` kolom op `orders`. Postcode wordt uit de adres-string geëxtraheerd via `getPostcodeRegion(address)` in `src/lib/geoData.ts` (regel 193-225):

- Regex `/(\d{4})\s*[A-Za-z]{2}/` pakt 4 cijfers + 2 letters.
- Fallback: hardcoded mapping stad naar PC2 (Amsterdam → "10", Rotterdam → "30", etc.).
- Returned PC2-prefix (eerste 2 cijfers).

**Consequentie voor CP-02**: PC2-clustering werkt nu al out-of-the-box. PC3 of PC4 vereist aanpassing van de helper.

### 3.2 Geocoding

- `resolveCoordinates()` met session-cache, via PDOK (Nederland) + Nominatim fallback.
- `haversineKm()` voor grote-cirkel-afstand. **Geen OSRM, geen Google Maps, geen Mapbox.** Afstand is great-circle, dus sub-optimaal voor volgorde-binnen-cluster. Voor Sprint 3 acceptabel.

### 3.3 VRP-solver

`src/lib/vrpSolver.ts` (via `solveVRP`) bestaat al. Volgens gebruik in `Planning.tsx:502-520` ondersteunt hij capacity + time-window + feature-constraints. **Dit is onze auto-plan engine**, mits hij dag-capaciteit en driver-contracturen aankan. Controle in Fase 2.

### 3.4 Warehouse-marker

Hardcoded Schiphol-coördinaten in `src/types.ts:32`. Niet relevant voor Sprint 3 (conflict met memory-rule over configureerbare warehouses, maar raakt deze sprint niet).

## 4. Afhankelijkheden Sprint 1 en 2 (BLOCKER check)

| Dependency | Status | Bewijs |
|---|---|---|
| `orders.department_id` NOT NULL (Sprint 1) | AANWEZIG | baseline regel 1629 |
| `orders.shipment_id`, `leg_number`, `leg_role` (Sprint 1 traject) | AANWEZIG | baseline regel 1628-1631 |
| `vehicle_types` met dimensies + flags (Sprint 2) | AANWEZIG | `20260419000050_vehicle_types_extend.sql`, kolommen `max_length_cm`, `max_width_cm`, `max_height_cm`, `max_weight_kg`, `max_volume_m3`, `max_pallets`, `has_tailgate`, `has_cooling`, `adr_capable` |
| `vehicle_types` seed voor bestaande tenants | AANWEZIG | `20260419000500_seed_defaults.sql` roept `seed_default_vehicle_types` aan in een DO-block |
| `orders.vehicle_type_id` (gekozen voertuigtype per order uit tariefmotor) | **ONTBREEKT** | Niet in baseline regel 1561-1638. In Sprint 2-plan staat deze FK wel bedoeld, maar `ALTER TABLE public.orders ADD vehicle_type_id` staat niet in de actieve migraties. `rate_rules.vehicle_type_id` bestaat wel (regel 1856), `shipments.pricing` JSONB bevat het kennelijk op snapshot-niveau. |
| `vehicles.vehicle_type_id` FK (Sprint 2-plan §1.2) | **ONTBREEKT** | Niet aanwezig in baseline regel 2383-2404. Zelfde issue als hierboven. |
| `orders.delivery_date` en `orders.pickup_date` | **ONTBREEKT in migrations/ MAAR code gebruikt ze** | Migratie staat in `migrations_archive/20260402_add_delivery_date.sql`. Planning.tsx:243 en PlanningWeekView.tsx:46 queryën deze kolommen actief. Drie mogelijkheden: 1) remote DB heeft ze nog maar de baseline-dump is incompleet, 2) baseline is nog niet gedeployed, 3) deze kolommen zijn onterecht weggevallen bij de archivering. **Status verifiëren bij Badr.** |

**Conclusie:** Sprint 1 klaar. Sprint 2 mogelijk niet 100% af: `orders.vehicle_type_id` ontbreekt op tabel-niveau, mogelijk alleen op snapshot-niveau in `shipments.pricing`. Dat raakt CP-04 direct, want zonder gekozen voertuigtype per order kan auto-plan niet filteren op passend voertuig.

**Harde BLOCKER status:** niet volledig vrijgegeven. Één vraag aan Badr beslist (zie §6).

## 5. Gap-analyse per requirement

**CP-01, chauffeur-kolom op docksheet en EDD-export**
- Status: ONTBREEKT.
- Wat er is: orders hebben `driver_id`; chauffeur-naam is via join `drivers.name` op te halen.
- Wat ontbreekt: geen docksheet-generator of EDD-export gevonden in `src/`. Handmatig kolom G na export suggereert een externe Excel-template; source onbekend. Moet Badr aanleveren of locatie aanwijzen.
- Risico: zonder weten welke export gebruikt wordt, kunnen we de kolom niet toevoegen.

**CP-02, auto-clustering op regio met "Open te plannen" lane**
- Status: DEELS.
- Wat er is: `getPostcodeRegion` (PC2), `PlanningUnassignedSidebar` groepeert al op regio, `consolidation_groups` tabel bestaat als data-model voor clusters.
- Wat ontbreekt: expliciete cluster-generatie in de flow (nu gebeurt het impliciet bij groeperen van sidebar). Cluster als draggable eenheid. Visuele scheiding tussen "cluster-voorstel" en "individuele order".
- Gotcha: PC2 is grof (Rotterdam heel groot gebied). PC3 of PC4 hergebruik vereist helper aanpassing. Keuze-vraag voor Badr.

**CP-03, automatische verdeling over voertuigen en chauffeurs, met dag-capaciteit**
- Status: DEELS.
- Wat er is: `solveVRP` is de auto-planner en werkt, incluis drag-override na afloop. UI toont al capacity-check tijdens drag.
- Wat ontbreekt: `daily_capacity` concept (aantal beschikbare voertuigen, welke chauffeurs), status-onderscheid `proposed` vs `confirmed` op trips (`dispatch_status=CONCEPT` komt dicht, maar is óók de status van handmatig-aangemaakte maar niet-verzonden trips, dus semantiek is gedeeld en loopt dooreen). Aparte `assignment_status` enum of subtype is veiliger.
- Gotcha: `solveVRP` input-contract verifiëren. Accepteert hij een driver-pool apart van vehicle-pool? Contracturen-signaal? Zo niet, dan wrap of uitbreiden.

**CP-04, laadvermogen-bewaking met override en audit-trail**
- Status: DEELS.
- Wat er is: `vehicle_types` met max_weight_kg, max_volume_m3, max_pallets. `PlanningVehicleCard` toont progress bars voor gewicht en pallets. `handleDragEnd` doet al een weight-check.
- Wat ontbreekt: volume-berekening vanuit cargo L×B×H (nu alleen gewicht en pallet-count). Override-modal met verplicht reden-veld. Audit-rij in `pipeline_events` of `order_events` bij override. Rode/oranje/groene kleurcodering op progress bar.
- Risico: volume vereist dat we per order de cargo-dimensies kennen. `orders.dimensions` is een `text` veld (regel 1576), niet structureel. Mogelijk beter via `shipments` of cargo-regels.

**CP-05, dagsetup per datum**
- Status: ONTBREEKT.
- Wat er is: `vehicle_availability` tabel (per vehicle per dag status + reason). Dit kan gerecycled worden voor "welke voertuigen zijn vandaag niet inzetbaar". Geen equivalent voor drivers.
- Wat ontbreekt: UI-modal/sheet voor dagsetup, `driver_availability` tabel, "kopieer van gisteren"/standaard-template flow.

**CP-06, contracturen-bewaking**
- Status: ONTBREEKT.
- Wat er is: niets. Drivers hebben geen `contract_hours`, geen uren-opbouw-tabel.
- Wat ontbreekt: kolom op drivers (of aparte tabel) met `contract_hours_per_week`, `employment_type`. Som van geplande uren per week per chauffeur. View `driver_hours_per_week`. Nmbrs-integratie is Sprint 5 scope, dus tussenoplossing met handmatige velden is conform prompt.
- Gotcha: "uren" niet eenduidig. Planned_start_time + totaal_duration_min op trips? Of per trip_stop som? Nu weet het systeem wel `total_duration_min` op trips (regel 2212), dus som per chauffeur per week is afleidbaar.

**CP-07, beschikbaarheidskalender per chauffeur met swim-lanes**
- Status: DEELS.
- Wat er is: `PlanningWeekView` toont een week-overzicht per voertuig. Drivers.status (beschikbaar/onderweg/rust/ziek) is globaal maar niet per dag.
- Wat ontbreekt: swim-lane per chauffeur (nu per voertuig), per-dag status werkt/verlof/ziek, visuele integratie boven het planboard in plaats van aparte tab.
- Concept-overweging: vehicle-first versus driver-first is een structurele keuze. Sprint 3 duwt richting driver-first (swim-lane per chauffeur). Dat maakt `PlanningVehicleCard` ongeschikt als directe basis voor de lane. Overweeg een nieuwe `PlanningDriverLane` die één of meer voertuig-tabs bevat (chauffeur rijdt soms wisselend voertuig).

## 6. Aannames en vragen aan Badr

Vragen met hoogste prioriteit eerst. Voor elk is een redelijke default meegegeven waarmee we verder kunnen als antwoord uitblijft.

**V1, dependency check (blockerend).** Heeft het remote Supabase-schema op dit moment `orders.delivery_date`, `orders.pickup_date`, `orders.vehicle_type_id` (of is vehicle_type_id alleen via `shipments.pricing` JSON beschikbaar)? Zo niet, dan zetten we deze drie kolommen eerst in een "nul-commit migratie" vóór Sprint 3 echt start. Default: aannemen dat delivery_date/pickup_date er zijn (code leunt erop), vehicle_type_id toevoegen als expliciete FK.

**V2, clustering-granulariteit.** PC2 (bestaand, grof, Rotterdam = één cluster), PC3 (fijner, Rotterdam-centrum apart van Rotterdam-Zuid), of PC4 (te fijn voor 60 orders per dag)? Default: PC2 met optie tot PC3 per tenant-instelling.

**V3, auto-plan algoritme.** Greedy (per chauffeur volstoppen tot vol, dan volgende) of balanced (alle chauffeurs gelijkwaardig)? `solveVRP` doet vermoedelijk een variant van savings/greedy; verificatie nodig in Fase 2. Default: greedy conform RCS-context ("route-efficiëntie boven spreiding").

**V4, Nmbrs-koppeling timing (CP-06).** Nu meebouwen of mock met handmatige velden tot Sprint 5 (IN-01)? Default: handmatige velden op drivers (`contract_hours`), expliciet gemarkeerd als tijdelijk. Geen Nmbrs-integratie in Sprint 3.

**V5, beladingsgraad (CP-04) definitie.** Volume, gewicht, of max van beide? Default: max van beide; UI toont beide bars en whichever eerste 100% haalt triggert de rem.

**V6, "needs manual" bucket.** Aparte staat `consolidation_groups.status = 'NIET_INPASBAAR'` of gewoon op de "Open te plannen" lane laten staan? Default: op lane laten staan met een rode badge "auto-plan kon niet plaatsen, reden X".

**V7, docksheet/EDD export locatie (CP-01).** Geen export-code gevonden in `src/`. Is dit een externe Excel-template die RCS handmatig invult met data uit de UI, of staat er code elders in de repo? Kan niet beginnen aan CP-01 zonder dit. Default: vragen aan Badr, geen aanname.

**V8, parallelle route of feature-flag.** Bestaand planbord niet stukmaken is harde regel. Mijn voorkeur: feature-flag `planning_v2_enabled` per tenant, parallelle route `/planning` (oud) en `/planning-v2` (nieuw) tot stabiel. Alternatief is één route met render-schakel. Default: feature-flag met parallelle route, conform het Sprint 2-pattern voor `engine_enabled`.

## 7. Hergebruik-opportuniteiten (wat we willen recyclen)

- `consolidation_groups` + `consolidation_orders` als data-model voor CP-02/CP-03 cluster-voorstellen. Status-enum bevat al VOORSTEL/GOEDGEKEURD/INGEPLAND/VERWORPEN, aligned met "proposed/confirmed"-principe. Scheelt een nieuwe tabel.
- `vehicle_availability` als half-gevuld model voor CP-05 (vehicle-zijde). Alleen spiegelen voor drivers.
- `PlanningUnassignedSidebar` met postcode-groepering: past naadloos op CP-02 "Open te plannen" lane, mogelijk iets anders gelayout.
- `solveVRP`, `getPostcodeRegion`, `haversineKm`, geocoding-laag: volledig herbruikbaar.
- `PlanningVehicleCard` progress-bar pattern: direct recyclebaar voor CP-04 beladingsgraad-UI.
- `trips` + `trip_stops` + `dispatch_status` enum: al het model voor bevestigde assignments. Voorstellen kunnen op `dispatch_status=CONCEPT` plus een nieuwe vlag `is_auto_proposal BOOLEAN`, óf op consolidation_groups. Kiezen in Fase 2.
- `pipeline_events` + `order_events`: ready voor audit-trail (CP-04 override, CP-03 auto-plan runs).
- Sprint 2 `tenant_settings` feature-flag pattern (`is_pricing_engine_enabled`): 1-op-1 kopiëren voor `is_planning_v2_enabled`.
- `_shared/` folder voor shared TypeScript tussen Edge Function en frontend: Sprint 2 heeft het voorbeeld, auto-plan engine volgt hetzelfde pattern.

## 8. Ruwe schets van wat echt nieuw is (wordt uitgewerkt in Fase 2)

- Tabel `driver_availability (driver_id, date, status, hours_available, contract_hours)`.
- Tabel `daily_capacity (tenant_id, date, available_vehicle_ids[], available_driver_ids[], notes)` OF bestaande `vehicle_availability` + nieuwe `driver_availability` als bron, zonder aparte aggregatie-tabel. Tweede is goedkoper.
- Kolom `drivers.contract_hours_per_week` (tijdelijk, tot Nmbrs).
- Kolom op orders of shipments: `vehicle_type_id` als nog ontbrekend (V1).
- Kolom `trips.capacity_override_reason TEXT`, of nieuwe `trip_overrides` tabel voor auditbaarheid.
- View `driver_hours_per_week (driver_id, iso_week, planned_hours, contract_hours)`.
- Edge Function `auto_plan_day(date)` die `solveVRP` wrapt met daily_capacity-input en consolidation_groups als output.
- Component `PlanningDriverLane` (swim-lane per chauffeur).
- Component `DaySetupDialog` (CP-05).
- Component `LoadCapacityBar` (CP-04 progress bar, recyclebaar vanuit PlanningVehicleCard).
- Component `CapacityOverrideDialog` (CP-04 override met reden-veld).

## 9. Bevindingen en advies

1. **Fundament is stevig.** Planbord, drag-drop, VRP, postcode-clustering, Leaflet-kaart, week-view en draft-persistence bestaan al. Sprint 3 bouwt hierop verder, niet vanuit nul.
2. **Consolidation_groups is onze vriend.** Bestaand data-model past precies op CP-02/CP-03 cluster-voorstellen. Hergebruik levert dagen op.
3. **Eén echte blocker om te helderen**: status van `orders.vehicle_type_id` en `orders.delivery_date`/`pickup_date` in remote schema (V1). Zonder dat kan auto-plan niet filteren op passend voertuig en kan delivery_date-match niet werken zoals Planning.tsx veronderstelt.
4. **CP-01 kan nog niet starten** zonder wetenschap van de export-template (V7).
5. **Swim-lane per chauffeur is een structurele verschuiving** tegenover het huidige vehicle-first model. Niet gratis, wel belangrijk om tijdig te besluiten (V8 koppeling).
6. **Contracturen-bewaking is bewust een tussenoplossing.** Conform prompt-regel: handmatige velden nu, Nmbrs in Sprint 5.

## 10. Wachten op goedkeuring

Dit rapport is conform prompt-regel 1 en 2. Geen code- of schema-wijzigingen. Wachten op feedback van Badr op §6 (vragen) voordat ik aan Fase 2 (plan van aanpak) begin.
