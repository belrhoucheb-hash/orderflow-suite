# Sprint 3, Fase 2, Plan van aanpak

Opgesteld 2026-04-19, op basis van goedgekeurd onderzoek (`01-research.md`). User heeft met "ga door" de aannames uit §6 geaccepteerd. Plan bevat nog geen code, alleen ontwerp.

## 0. Beslissingen uit Fase 1

Defaults uit onderzoek §6 zijn leidend totdat Badr anders bepaalt:

1. ~~**V1 schema-check vóór werk.** Eerste commit is een pre-flight migratie (`20260420000000_sprint3_preflight.sql`) die `orders.delivery_date`, `orders.pickup_date`, `orders.vehicle_type_id` idempotent toevoegt als ze ontbreken op remote. Draait `IF NOT EXISTS`, dataverlies-vrij.~~ **DONE** in sprint-2 nawerk via `20260419020000_orders_vehicle_type_and_dates.sql` (commit 711369f). Voegde bovendien `pickup_time_window_start/end` en `delivery_time_window_start/end` toe, dus NewOrder kan nu per pickup en delivery een eigen tijdvenster opslaan.
2. **V2 clustering-granulariteit.** PC2 als default, met per-tenant override via `tenant_settings.planning.cluster_granularity in ('PC2','PC3')`. UI-toggle later.
3. **V3 auto-plan algoritme.** Greedy via bestaande `solveVRP` (Sprint 3 wrapt deze, bouwt hem niet opnieuw).
4. **V4 Nmbrs.** Tussenoplossing: nieuwe kolom `drivers.contract_hours_per_week INTEGER` plus annotatie "Sprint 5 vervangt door Nmbrs-sync".
5. **V5 beladingsgraad.** `max(volume_pct, weight_pct)`. UI toont beide balken.
6. **V6 "needs manual".** Orders die auto-plan niet kan plaatsen blijven op "Open te plannen" lane met rode badge en reason-tag.
7. **V7 docksheet/EDD export.** Nog onduidelijk. CP-01 wordt laatste implementatie-stap; als Badr de template/locatie niet levert, wordt CP-01 doorgeschoven naar Sprint 4 met mitigatie in §7.
8. **V8 parallelle route + feature-flag.** `tenant_settings.planning.v2_enabled = false` default, route `/planning-v2` actief als flag aanstaat, oude `/planning` blijft draaien.

## 1. Datamodel

### 1.1 Hergebruik, niet duplicatie

Onderzoek §7 wijst drie bestaande data-structuren aan die we recyclen in plaats van nieuw bouwen. Dit is de grootste winst van dit plan.

- **`consolidation_groups` + `consolidation_orders`** fungeren als auto-plan-voorstel-laag. Status-enum `VOORSTEL/GOEDGEKEURD/INGEPLAND/VERWORPEN` matcht precies "AI proposes, planner approves". Een groep = één chauffeur+voertuig+datum, met geordende orders.
- **`vehicle_availability`** is de voertuig-helft van de dagsetup (CP-05).
- **`trips` + `trip_stops`** blijven de definitieve uitvoeringslaag. Bevestiging via planner stuurt een cluster-voorstel naar trips (zoals vandaag ook gebeurt via `handleConfirm`).

### 1.2 Nieuwe kolommen op bestaande tabellen

**Orders-kolommen zijn al DONE** via sprint-2 nawerk (commit 711369f). Concreet al aanwezig op remote:
`delivery_date`, `pickup_date`, `vehicle_type_id` FK, plus `pickup_time_window_start/end`, `delivery_time_window_start/end`, plus indexen op `delivery_date`, `vehicle_type_id`, en `(status, delivery_date)`.

Wat sprint-3 nog toevoegt:

```sql
-- Dag-capaciteit en auto-plan audit op bestaande tabellen
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS contract_hours_per_week INTEGER,
  ADD COLUMN IF NOT EXISTS employment_type         TEXT CHECK (employment_type IN ('vast','flex','ingehuurd')) DEFAULT 'vast';

COMMENT ON COLUMN public.drivers.contract_hours_per_week IS
  'Tijdelijk handmatig veld. Wordt in Sprint 5 vervangen door Nmbrs-sync.';

-- Auditabele override op cluster-niveau (CP-04)
ALTER TABLE public.consolidation_groups
  ADD COLUMN IF NOT EXISTS capacity_override_reason TEXT,
  ADD COLUMN IF NOT EXISTS capacity_override_by     UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS capacity_override_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS proposal_source          TEXT CHECK (proposal_source IN ('manual','auto')) DEFAULT 'manual';
```

`orders.vehicle_type_id` wordt gevuld door de tariefmotor zodra die draait. Huidige status: kolom bestaat maar wordt nog niet door `calculate-order-price` of `preview-order-price` teruggeschreven naar `orders`. Sprint-3 CP-04 hoeft hier niet op te wachten, auto-plan skipt orders met `NULL` en plaatst ze op "Open te plannen" met reden-tag (zie R3).

### 1.3 Nieuwe tabel `driver_availability`

Per-dag status per chauffeur. Spiegel van `vehicle_availability`.

```sql
CREATE TABLE public.driver_availability (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  driver_id   UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('werkt','verlof','ziek','rust','afwezig')) DEFAULT 'werkt',
  hours_available INTEGER,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, driver_id, date)
);

CREATE INDEX idx_driver_availability_date ON public.driver_availability (tenant_id, date);
```

RLS: tenant-isolatie via `current_tenant_id()`, service-role bypass. `update_updated_at_column()` trigger.

`hours_available` is optioneel (`NULL` betekent "default full dag"). Gebruikt bij contracturen-check in CP-06.

### 1.4 View `driver_hours_per_week`

Aggregeert geplande uren per chauffeur per ISO-week. Bron is `trips.total_duration_min` plus `planned_date`.

```sql
CREATE OR REPLACE VIEW public.driver_hours_per_week AS
SELECT
  t.tenant_id,
  t.driver_id,
  to_char(t.planned_date, 'IYYY-"W"IW') AS iso_week,
  date_trunc('week', t.planned_date)::date AS week_start,
  SUM(COALESCE(t.total_duration_min, 0)) / 60.0 AS planned_hours,
  (SELECT contract_hours_per_week FROM public.drivers WHERE id = t.driver_id) AS contract_hours
FROM public.trips t
WHERE t.dispatch_status NOT IN ('AFGEBROKEN','GEWEIGERD')
GROUP BY t.tenant_id, t.driver_id, t.planned_date;
```

RLS-security via `SECURITY INVOKER` (default voor views), leunt op onderliggende tabel-RLS.

### 1.5 ER-overzicht (nieuw + aangeraakt)

```
tenants ─── (*) driver_availability [driver_id, date]
tenants ─── (*) vehicle_availability     [bestaand]
tenants ─── (*) consolidation_groups ─ (*) consolidation_orders   [bestaand, uitgebreid]
                    │ (na bevestiging)
                    ▼
tenants ─── (*) trips ─── (*) trip_stops                          [bestaand]

orders [+ delivery_date, pickup_date, vehicle_type_id FK]
drivers [+ contract_hours_per_week, employment_type]
```

### 1.6 Geen `daily_capacity` tabel

Eerder overwogen, maar `vehicle_availability` + `driver_availability` bij elkaar dekken de dagsetup zonder aggregatie-tabel. Queries zijn simpel (`WHERE date = ? AND status = 'beschikbaar'/'werkt'`). Minder tabellen = minder sync-issues.

## 2. Auto-plan engine, pseudocode

### 2.1 Stap voor stap

```
Input:  tenant_id, date D
Output: consolidation_groups met status='VOORSTEL', proposal_source='auto'

1. Pre-flight check:
   - Als orders van die dag zonder vehicle_type_id bestaan:
     return warning "N orders hebben geen voertuigtype, los eerst op"
   - Als er geen driver_availability of vehicle_availability voor D bestaat:
     return error "Stel eerst dagsetup in voor D (CP-05)"

2. Haal input-set op:
   orders      = SELECT FROM orders
                 WHERE tenant_id=T AND delivery_date=D
                   AND status='PENDING' AND vehicle_id IS NULL
                   AND id NOT IN (SELECT order_id FROM consolidation_orders
                                  JOIN consolidation_groups ON id=group_id
                                  WHERE planned_date=D AND status<>'VERWORPEN')
   vehicles    = SELECT FROM vehicles v
                 JOIN vehicle_availability va ON va.vehicle_id=v.id AND va.date=D
                 WHERE v.tenant_id=T AND v.is_active
                   AND COALESCE(va.status,'beschikbaar')='beschikbaar'
   drivers     = SELECT FROM drivers d
                 JOIN driver_availability da ON da.driver_id=d.id AND da.date=D
                 WHERE d.tenant_id=T AND d.is_active
                   AND COALESCE(da.status,'werkt')='werkt'

3. Idempotentie: reset alleen AUTO-voorstellen van D die NIET bevestigd zijn:
   UPDATE consolidation_groups
   SET status='VERWORPEN', updated_at=now()
   WHERE planned_date=D AND proposal_source='auto' AND status='VOORSTEL';
   (Bevestigde groups GOEDGEKEURD/INGEPLAND blijven intact.)

4. Cluster op regio:
   - Per order: region = getPostcodeRegion(delivery_address)  (PC2 default, PC3 als tenant-instelling)
   - Groepeer orders per region, sorteer op urgency.

5. Voor elk regio-cluster:
   a. Filter vehicles op vehicle_type_id-match (of compatibel: voertuig met gelijke of hogere capaciteit)
   b. Filter op features (ADR, Koeling, Klep als gevraagd door cargo)
   c. Wijs cluster toe aan eerstbeste voertuig waar weight+volume passen
   d. Binnen cluster: sorteer stops via optimizeRoute() (nearest-neighbor bestaand in planningUtils)
   e. Wijs chauffeur uit available-pool, bij voorkeur met certificaten-match en met laagste planned_hours deze ISO-week (CP-06)
   f. Bewaak per voertuig: lopende som weight_kg + volume (cargo L×B×H)
      Bij dreigende overschrijding: split cluster of laat order achter in "needs manual"
   g. Bewaak per chauffeur: planned_hours + geschatte trip-duration vs contract_hours_per_week
      Bij overschrijding: probeer andere chauffeur, anders "needs manual"

6. Voor elk cluster dat past:
   INSERT consolidation_groups (tenant_id, planned_date=D, status='VOORSTEL',
                                vehicle_id, total_weight_kg, total_pallets,
                                estimated_duration_min, utilization_pct,
                                proposal_source='auto', created_by=auth.uid())
   INSERT consolidation_orders (group_id, order_id, stop_sequence)
   Link chauffeur via trips (pas NA bevestiging) OR in nieuwe kolom consolidation_groups.driver_id
   (Nota: groep heeft nu al vehicle_id, we voegen driver_id toe, zie §1.2 uitbreiding.)

7. Orders die niet geplaatst konden worden:
   INSERT pipeline_events (event_type='auto_plan_unplaced', payload={order_id, reason})
   UI toont deze op "Open te plannen" met rode badge.

8. Log run:
   INSERT pipeline_events (event_type='auto_plan_run',
                           payload={date, placed_count, unplaced_count, groups_created, duration_ms})
```

### 2.2 Hergebruik van `solveVRP`

`src/lib/vrpSolver.ts:94` accepteert al `unassignedOrders`, `vehicles`, `coordMap`, `existingAssignments`. We wrappen hem:

```ts
// supabase/functions/_shared/autoPlanner.ts
import { solveVRP } from "./vrpSolver.ts";  // verhuisd of herimporteerd
export async function autoPlanDay(tenantId: string, date: string) { ... }
```

`solveVRP` verhuist óf naar `_shared/` (gelijk aan Sprint 2 pattern voor pricingEngine) óf blijft in `src/lib/` met een Deno-compat shim. Keuze in Fase 3 eerste commit, identiek aan R2 uit Sprint 2.

Uitbreidingen op solveVRP (geen rewrite):

- Accepteer optioneel `driverPool: Driver[]` met `plannedHoursThisWeek` en `contractHours`.
- Accepteer optioneel `vehicleTypeIdFilter: (order) => vehicleTypeId | null`.
- Return ook `unplaced: PlanOrder[]` met reason-tags, niet alleen assignments.

Deze uitbreidingen zijn additief: huidig `handleAutoPlan` in oude Planning.tsx blijft werken.

### 2.3 Locatie en trigger

Edge Function `supabase/functions/auto-plan-day/index.ts`. Input `{ date: 'YYYY-MM-DD' }`. Service-role. Aangeroepen vanuit planbord-UI via knop "Auto-plan". Niet automatisch bij orderaanmaak (te storend voor de planner-flow).

RPC `confirm_consolidation_group(group_id)` zet status='GOEDGEKEURD' en creëert trips + trip_stops op identieke wijze aan bestaande `handleConfirm`.

## 3. Backend

### 3.1 Edge functions

- `supabase/functions/auto-plan-day/index.ts`, hoofdroute.
- `supabase/functions/_shared/autoPlanner.ts`, pure TS-logica (testbaar zonder Supabase).
- `supabase/functions/_shared/vrpAdapter.ts`, adapter die `solveVRP` uit `src/lib` importeert óf een Deno-compatible kopie, plus de CP-06 extensies.

### 3.2 Database functies

- `public.confirm_consolidation_group(p_group_id UUID)`, `SECURITY DEFINER`, creëert trip + trip_stops, zet group status='INGEPLAND', update orders (status='PLANNED', vehicle_id, driver_id, stop_sequence). Transactioneel.
- `public.reject_consolidation_group(p_group_id UUID, p_reason TEXT)`, status='VERWORPEN', orders blijven ongepland.
- `public.record_capacity_override(p_group_id UUID, p_reason TEXT)`, zet override-velden, logt in `pipeline_events`.

### 3.3 RLS-policies

Pattern identiek aan `vehicle_availability`:

```sql
ALTER TABLE public.driver_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation: driver_availability ALL"
  ON public.driver_availability FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "Service role: driver_availability"
  ON public.driver_availability TO service_role
  USING (true) WITH CHECK (true);
```

`consolidation_groups` en `consolidation_orders` hebben al RLS, geen nieuwe policies nodig voor de nieuwe kolommen.

### 3.4 Feature-flag

Conform Sprint 2-pattern. In `tenant_settings` een rij `category='planning'` met JSON `{"v2_enabled": false, "cluster_granularity": "PC2"}`. Helper:

```sql
CREATE OR REPLACE FUNCTION public.is_planning_v2_enabled(p_tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT (settings->>'v2_enabled')::boolean FROM public.tenant_settings
     WHERE tenant_id = p_tenant_id AND category = 'planning' LIMIT 1),
    false
  );
$$;
```

Frontend hook `useIsPlanningV2Enabled()` gebruikt deze helper.

## 4. Frontend

### 4.1 Parallelle route

- `/planning` blijft ongewijzigd werken. RCS gebruikt dit dagelijks.
- `/planning-v2` nieuw, zichtbaar in sidebar als feature-flag aanstaat.
- Switchen tussen beide via bovenaan-knop "Terug naar oude planbord" in v2 en "Probeer nieuw planbord" in oud. Beide versies lezen/schrijven dezelfde tabellen, er is geen migratie-moment.

Conform memory-rule "Check bestaande UI eerst": nieuwe features zoals dagsetup worden **onder bestaande tabs** toegevoegd, niet als losse sidebar-items. Dagsetup komt in `/planning-v2` boven de swim-lanes als collapsible panel.

### 4.2 Componenten, nieuw en aangepast

| Component | Mutatie | Scope |
|---|---|---|
| `src/pages/Planning.tsx` | Ongewijzigd | Oud planbord blijft |
| `src/pages/PlanningV2.tsx` | Nieuw | Nieuwe pagina, lijstvorm swim-lanes |
| `src/components/planning/v2/PlanningDriverLane.tsx` | Nieuw | Swim-lane per chauffeur, toont toegewezen cluster(s) |
| `src/components/planning/v2/DaySetupDialog.tsx` | Nieuw | CP-05. Voertuigen + chauffeurs selecteren per dag |
| `src/components/planning/v2/AutoPlanButton.tsx` | Nieuw | CP-03. Roept Edge Function aan |
| `src/components/planning/v2/ClusterProposalCard.tsx` | Nieuw | CP-02/CP-03. Gestreepte rand bij VOORSTEL |
| `src/components/planning/v2/LoadCapacityBar.tsx` | Nieuw | CP-04. Progress bars weight + volume, kleurcodering |
| `src/components/planning/v2/CapacityOverrideDialog.tsx` | Nieuw | CP-04. Verplicht reden-veld |
| `src/components/planning/v2/AvailabilityCalendar.tsx` | Nieuw | CP-07. Week-overzicht chauffeur-statuses |
| `src/components/planning/v2/UnplacedOrdersLane.tsx` | Nieuw | CP-02 "Open te plannen" met rode badges |
| `src/components/planning/PlanningUnassignedSidebar.tsx` | Hergebruikt | Basis voor UnplacedOrdersLane, evt. gekopieerd |
| `src/components/planning/PlanningVehicleCard.tsx` | Ongewijzigd | Blijft alleen in v1 |
| `src/hooks/useDriverAvailability.ts` | Nieuw | CRUD voor driver_availability |
| `src/hooks/useVehicleAvailability.ts` | Nieuw/uitgebreid | CRUD voor vehicle_availability |
| `src/hooks/useConsolidation.ts` | Hergebruikt | Al aanwezig, volledige CRUD |
| `src/hooks/useAutoPlan.ts` | Nieuw | Edge Function aanroep + toast |
| `src/hooks/useDriverHours.ts` | Nieuw | View driver_hours_per_week |
| `src/hooks/useIsPlanningV2Enabled.ts` | Nieuw | Feature-flag |
| `src/components/settings/PlanningV2Toggle.tsx` | Nieuw | Stamgegevens-tab "Planbord" |

### 4.3 Swim-lane layout

```
┌─────────────────────────────────────────────────────────┐
│  [Datum-nav]   [Dagsetup]   [Auto-plan]                 │
├─────────────────────────────────────────────────────────┤
│  Open te plannen  (per postcode-regio gegroepeerd)      │
│  ─ Regio 30 (Rotterdam)   3 orders                       │
│  ─ Regio 10 (Amsterdam)   5 orders                       │
│  ─ Niet-plaatsbaar        1 order [rode badge]           │
├─────────────────────────────────────────────────────────┤
│  Chauffeur: Jan van der Berg  [32u/week, 28u gepland]   │
│  └─ VOORSTEL Regio 30   [weight 65%|volume 80%]         │
│       Order #234, #236, #238  [bevestigen][verwerpen]   │
│  └─ Regio 25              [60%|55%]                      │
├─────────────────────────────────────────────────────────┤
│  Chauffeur: Peter Smit  [40u/week, 38u gepland]         │
│  └─ INGEPLAND Regio 10   [weight 90%|volume 75%]        │
└─────────────────────────────────────────────────────────┘
```

Voorstel-clusters: gestreepte rand, gedimde kleur. Bevestigde clusters: volle rand. Overload-poging op vol voertuig: `CapacityOverrideDialog` opent met verplicht reden-veld.

### 4.4 Docksheet en EDD-export (CP-01)

Status-afhankelijk van V7 in onderzoek. Twee mogelijke paden:

- **A. Template bestaat en is Excel, RCS downloadt + vult handmatig.** We voegen kolom "Chauffeur" toe aan de export-generator zodra we die vinden. Geen visueel werk voor de UI.
- **B. Template is niet in repo.** Dan bouwt Sprint 3 een eenvoudige CSV-export vanuit de Planning V2 pagina, kolommen: Order, Klant, Losadres, Chauffeur, Voertuig, Tijdvenster, Opmerking. Knop "Exporteer docksheet" per dag.

Beslissing in Fase 3 na Badr-input. Als onduidelijk op week 2: optie B standaard en Badr mag template aanleveren later.

### 4.5 Stamgegevens

Toevoegingen onder `MasterDataSection.tsx` (memory-rule: geen losse sidebar-items):

- Nieuw tabblad **"Planbord"**: toggle `v2_enabled`, select `cluster_granularity` (PC2/PC3).
- Bestaand tabblad **"Chauffeurs"**: nieuwe velden per driver: `contract_hours_per_week`, `employment_type`.

## 5. Testplan

### 5.1 Unit tests (auto-plan engine)

`src/__tests__/autoPlanner.test.ts`, nieuwe testfile:

| Scenario | Verwachte output |
|---|---|
| 60 orders, 5 drivers werkt, 10 vehicles beschikbaar | Alle 60 geplaatst in ≤ 2s, ≥ 5 cluster-voorstellen |
| 60 orders, 3 drivers werkt, 10 vehicles | Max 3 clusters, overschot in unplaced |
| Order zonder `vehicle_type_id` | Skipped met warning, rest wordt wel gepland |
| Order met `ADR` requirement, geen `adr_capable` voertuig | In unplaced met reason='no_matching_vehicle' |
| Cluster Rotterdam (PC2=30) + Den Haag (PC2=25), beide klein | Worden niet samengevoegd (verschillende PC2) |
| Chauffeur met 32u contract, al 30u ingepland deze week | Krijgt geen rit van 8u, schuift naar andere chauffeur |
| Chauffeur met `driver_availability.status='verlof'` | Niet in pool |
| Auto-plan tweede keer op zelfde dag | Bestaande VOORSTEL's worden gerefreshed, GOEDGEKEURD/INGEPLAND blijven |

### 5.2 Integration tests (DB)

`src/__tests__/integration/planningV2.test.ts`:

- `confirm_consolidation_group` creëert trip + trip_stops transactioneel.
- `reject_consolidation_group` verandert geen orders.
- View `driver_hours_per_week` returnt correct som over week-grens.
- RLS: andere tenant kan geen `driver_availability` lezen.

### 5.3 Handmatig testplan (klant-testplan bijwerken)

Conform memory-rule "klant-testplan uitbreiden in klant-taal" krijgt `docs/klant-testplan.md` een sprint-3 blok:

1. Stel dagsetup in voor morgen (kies 4 chauffeurs + 5 voertuigen).
2. Kies een chauffeur met verlof morgen: markeer als "verlof".
3. Klik "Auto-plan".
4. Verwacht: voorstellen verschijnen per chauffeur in swim-lanes.
5. Sleep een order van chauffeur A naar chauffeur B: check dat voertuig van B dat aankan.
6. Probeer een order te slepen op een vol voertuig: verwacht dialog met reden-veld.
7. Klik "Bevestig alles": voorstellen worden ritten, verschijnen in dagoverzicht.
8. Controleer docksheet-export: chauffeur-kolom is ingevuld.

## 6. Migratie en backfill

### 6.1 Migratie-bestanden

Strikte volgorde, elk los deploybaar. Pre-flight migratie voor orders is al in sprint-2 nawerk gedaan (`20260419020000_orders_vehicle_type_and_dates.sql`), dus niet herhalen.

1. `20260420000100_driver_availability.sql`: tabel + RLS + trigger.
2. `20260420000200_consolidation_auto_fields.sql`: `proposal_source`, `capacity_override_*`, `driver_id`, FK.
3. `20260420000300_driver_hours_view.sql`: view.
4. `20260420000400_planning_feature_flag.sql`: seed `tenant_settings.planning` rijen.
5. `20260420000500_driver_contract_fields.sql`: `drivers.contract_hours_per_week`, `employment_type`.
6. `20260420000600_consolidation_group_rpcs.sql`: confirm/reject/override RPC's.

### 6.2 Backfill

- Bestaande `trips` (handmatig gemaakt) blijven gewoon. Geen migratie nodig.
- `driver_availability` start leeg. Helper in UI: "Kopieer van gisteren" of "Standaard werkdag ma-vrij" om initiele setup snel te doen.
- `drivers.contract_hours_per_week`: default `NULL`. UI laat veld leeg, auto-plan skipt contracturen-check als `NULL`.
- Seed `tenant_settings.planning` voor alle bestaande tenants met `v2_enabled=false`.

### 6.3 Rollback

Elke migratie heeft `-- ROLLBACK` comment onderaan. Omdat alle nieuwe data leeg start, rollback is dataverlies-vrij. Feature-flag uit betekent effectief rollback zonder migratie-terugdraai.

## 7. Migratievolgorde en risico

### 7.1 Implementatievolgorde

Implementatie-volgorde per prompt-regel (Fase 3):

1. **Datamodel** (§6.1 migraties 1-6). Orders pre-flight is al gedaan in sprint-2 nawerk.
2. **Dagsetup-UI** (CP-05), `driver_availability` + `vehicle_availability` CRUD-UI. Los testbaar.
3. **Auto-plan engine** (CP-03), Edge Function + `autoPlanner.ts`. Testbaar via curl zonder UI.
4. **Planboard V2 skeleton** met swim-lanes (CP-02, CP-07). Leest alleen, nog geen bevestig-knop.
5. **Laadvermogen + override** (CP-04).
6. **Bevestig-flow**, RPC `confirm_consolidation_group` koppelen aan knop. Nu kan de planner echt werken in V2.
7. **Contracturen-bewaking** (CP-06), kolommen + view integratie.
8. **Docksheet/EDD chauffeur-kolom** (CP-01), afhankelijk van V7-antwoord.

### 7.2 Parallel of sequentieel

Stap 2, 3, 4 kunnen los van elkaar in commits, maar stap 3 wordt pas zichtbaar in V2 na stap 4+6. Geen blokkerende dependencies tussen stap 5, 7, 8.

### 7.3 Risico's en mitigaties

**R1. Idempotentie auto-plan.** Twee aanroepen op dezelfde dag mogen bevestigde clusters NOOIT overschrijven. Mitigatie: §2.1 stap 3 reset alleen `proposal_source='auto' AND status='VOORSTEL'`. Test in §5.1.

**R2. `solveVRP` API is vehicle-centric, sprint-3 is driver-centric.** Mitigatie: adapter wrap, niet rewrite. `vrpAdapter.ts` ontvangt driver-pool, kiest eerst voertuig via bestaande logica, koppelt daarna chauffeur op basis van certificaten + resterende uren.

**R3. `orders.vehicle_type_id` is `NULL` voor oude orders.** Mitigatie: auto-plan skipt deze met warning, plaatst op unplaced met reason='no_vehicle_type'. Planner ziet het en klikt "Herbereken tarief" (Sprint 2 UI) om het veld te vullen.

**R4. Bestaand planbord breekt door gedeelde types.** Mitigatie: V2-componenten in aparte folder `src/components/planning/v2/`. Gedeelde types blijven additief. `src/components/planning/types.ts` krijgt geen breaking changes.

**R5. Planner kiest ongeldige dagsetup (0 chauffeurs).** Mitigatie: auto-plan returnt error "geen chauffeurs beschikbaar voor D". UI toont melding.

**R6. Edge Function timeout bij 100+ orders.** Mitigatie: solveVRP is O(n*m), 100 × 10 = triviaal (<100ms). Timeout staat op 30s default, ruim voldoende. Test in §5.1.

**R7. RLS-gat bij nieuwe tabel.** Mitigatie: PR-check op `grep "ENABLE ROW LEVEL SECURITY"` in elke nieuwe migratie. Plus twee policies (tenant isolation + service role).

**R8. Race bij parallelle auto-plan runs.** Mitigatie: Edge Function neemt advisory lock per `(tenant_id, date)` via `pg_advisory_xact_lock`. Tweede aanroep wacht of skipt.

**R9. Contracturen-view loopt traag bij veel trips.** Mitigatie: view is per `planned_date`, filtert vroeg op `WHERE planned_date >= date_trunc('week', now())`. Index bestaat al op `trips(tenant_id, planned_date)`.

**R10. Docksheet-template onbekend (V7).** Mitigatie: fallback CSV-export (§4.4 optie B). Scope wordt gedocumenteerd in `03-changelog.md` als schuld als Badr later een andere template oplevert.

**R11. Cluster-granulariteit te grof voor een bepaalde tenant.** Mitigatie: `tenant_settings.planning.cluster_granularity` configureerbaar.

**R12. Feature-flag aan terwijl datamodel incompleet.** Mitigatie: V2-pagina checkt bij mount of `driver_availability` bestaat voor `date` en toont anders "Dagsetup nodig"-banner. Geen crash.

**R13. Luxe design-laag (memory-rule).** Nieuwe componenten gebruiken gold-accent tokens uit `index.css`. Lint-check: class `lux-accent` of `border-gold-500` aanwezig in minstens cluster-card en auto-plan-knop.

**R14. Driver_id FK op consolidation_groups breekt bestaande rijen.** Mitigatie: kolom is `NULL`-toestaand. Bestaande rijen hebben `NULL`, geen update nodig.

## 8. Definitie van klaar

Fase 3 is af als:

- [ ] Alle 7 migratie-bestanden committed in losse commits (`sprint-3(db): ...`)
- [ ] Unit tests groen, inclusief `autoPlanner.test.ts`
- [ ] Integration-tests groen voor RPC's + view + RLS
- [ ] Handmatig testplan (§5.3) doorlopen met screenshots
- [ ] Klant-testplan (`docs/klant-testplan.md`) uitgebreid in klant-taal
- [ ] Alle 14 risico-mitigaties geverifieerd
- [ ] Feature-flag op `false` voor alle tenants, RCS krijgt losse mail voor activering
- [ ] `03-changelog.md` opgeleverd met gewijzigde bestanden, schulden, Sprint 4+ doorschuiven
- [ ] Oude planbord werkt nog op `/planning` (handmatige rooktest)

## 9. Geschatte changelog

| Bestand | Mutatie |
|---|---|
| `supabase/migrations/20260420000100_driver_availability.sql` | Nieuw, tabel + RLS + trigger |
| `supabase/migrations/20260420000200_consolidation_auto_fields.sql` | Alter, auto + override + driver_id kolommen |
| `supabase/migrations/20260420000300_driver_hours_view.sql` | Nieuw, view |
| `supabase/migrations/20260420000400_planning_feature_flag.sql` | Seed tenant_settings.planning |
| `supabase/migrations/20260420000500_driver_contract_fields.sql` | Alter drivers contract-kolommen |
| `supabase/migrations/20260420000600_consolidation_group_rpcs.sql` | Nieuw, confirm/reject/override RPC's |
| `supabase/functions/auto-plan-day/index.ts` | Nieuw, Edge Function |
| `supabase/functions/_shared/autoPlanner.ts` | Nieuw, pure TS engine |
| `supabase/functions/_shared/vrpAdapter.ts` | Nieuw, wrap rond solveVRP |
| `src/lib/vrpSolver.ts` | Uitgebreid met driver-pool en vehicle-type-filter |
| `src/pages/PlanningV2.tsx` | Nieuw, hoofdpagina |
| `src/components/planning/v2/PlanningDriverLane.tsx` | Nieuw, swim-lane per chauffeur |
| `src/components/planning/v2/DaySetupDialog.tsx` | Nieuw, CP-05 |
| `src/components/planning/v2/AutoPlanButton.tsx` | Nieuw, CP-03 |
| `src/components/planning/v2/ClusterProposalCard.tsx` | Nieuw, CP-02/03 card |
| `src/components/planning/v2/LoadCapacityBar.tsx` | Nieuw, CP-04 |
| `src/components/planning/v2/CapacityOverrideDialog.tsx` | Nieuw, CP-04 override |
| `src/components/planning/v2/AvailabilityCalendar.tsx` | Nieuw, CP-07 week-kalender |
| `src/components/planning/v2/UnplacedOrdersLane.tsx` | Nieuw, CP-02 open-te-plannen |
| `src/hooks/useDriverAvailability.ts` | Nieuw |
| `src/hooks/useVehicleAvailability.ts` | Nieuw of uitgebreid |
| `src/hooks/useAutoPlan.ts` | Nieuw |
| `src/hooks/useDriverHours.ts` | Nieuw |
| `src/hooks/useIsPlanningV2Enabled.ts` | Nieuw |
| `src/components/settings/PlanningV2Toggle.tsx` | Nieuw, stamgegevens |
| `src/components/settings/MasterDataSection.tsx` | Uitbreiden met planbord-tab |
| `src/components/drivers/DriverForm.tsx` | Uitbreiden met contract_hours_per_week veld |
| `src/App.tsx` of router-config | Route `/planning-v2` toevoegen |
| `src/integrations/supabase/types.ts` | Handmatige update nieuwe tabellen + kolommen |
| `src/__tests__/autoPlanner.test.ts` | Nieuw |
| `src/__tests__/integration/planningV2.test.ts` | Nieuw |
| `docs/klant-testplan.md` | Uitbreiden met sprint-3 scenario's |
| `docs/sprint-3/03-changelog.md` | Bij oplevering |

Schatting: ongeveer 17 logische commits in formaat `sprint-3(scope): wat` (pre-flight migratie is al gedaan in sprint-2 nawerk).

## 10. Wachten op approval

Dit plan is conform prompt-regel 2. Geen code-wijzigingen in deze fase. Wachten op "ga door" / "akkoord" / "approved" van Badr voor start Fase 3.

Open voor Badr om te beantwoorden vóór Fase 3 begint of tijdens Fase 3 commit 1:

- ~~**V1 pre-check**: draaien we eerst de SQL uit mijn vorige bericht om te zien welke kolommen werkelijk ontbreken op remote? Of gaan we blind met `IF NOT EXISTS`?~~ **Beantwoord**: remote is geverifieerd, ontbrekende kolommen zijn toegevoegd in sprint-2 nawerk.
- **V7 docksheet**: template bestaat of bouwen we een CSV-export (optie B)?

Als V7 onbeantwoord: CSV-fallback is veilig genoeg om mee te starten.