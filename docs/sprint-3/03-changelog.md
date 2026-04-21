# Sprint 3, Fase 3, Changelog

Opgeleverd 2026-04-21. Auto-clustering, dag-capaciteit en laadvermogen-bewaking op het planbord. Alle 7 CP-requirements uit de prompt zijn ingevuld, met een aantal schulden expliciet doorgeschoven naar Sprint 4+.

## Samenvatting per CP-requirement

| ID | Status | Waar in de UI |
|---|---|---|
| CP-01 Docksheet/EDD chauffeur-kolom | Klaar | Planbord v2, knop "Docksheet" exporteert CSV |
| CP-02 Auto-clustering op regio + Open-te-plannen lane | Klaar | Planbord v2, Auto-plan-knop + rechterkolom |
| CP-03 Auto-verdeling + dag-capaciteit | Klaar | Planbord v2, Edge Function `auto-plan-day` |
| CP-04 Laadvermogen-check + override + audit | Klaar | Cluster-detailpaneel, "Forceer met reden" sectie |
| CP-05 Dagsetup per dag | Klaar | Planbord v2, Dagsetup-knop opent dialog |
| CP-06 Contracturen-bewaking | Klaar via mock | Chauffeur-formulier, swim-lane uren-badge |
| CP-07 Beschikbaarheidskalender + swim-lanes | Klaar | Planbord v2, lane per chauffeur |

## Commits (13 stuks)

In chronologische volgorde:

1. `c7dc818 sprint-3(docs): fase 1 onderzoek planbord 2.0`
2. `03304a2 sprint-3(db): datamodel voor planbord v2`
3. `3562b84 sprint-3(ui): dagsetup-dialog voor CP-05`
4. `e97139f sprint-3(engine): auto-plan-day Edge Function met vrp-kern`
5. `ec27c8b sprint-3(db): fix migratievolgorde, contracturen-kolom voor view`
6. `ce65c76 sprint-3(ui): planbord v2 skeleton met swim-lanes per chauffeur`
7. `11f4553 sprint-3(ui): v2-uit boodschap productie-klaar, SQL weg`
8. `972a2fd sprint-3(ui): planbord v2 in luxe gold-accent stijl, admin-toggle`
9. `dd373ff sprint-3(ui): gelijke pickers en gold-gradient knoppen als New Order`
10. `612cce5 sprint-3(ui): cluster-detail paneel met override-flow voor CP-04`
11. `f1f446f sprint-3(ui): driver-formulier met contracturen en dienstverband`
12. `8b6945e sprint-3(ui): docksheet CSV-export met chauffeur-kolom voor CP-01`
13. `9690ecf sprint-3(test): integration-tests voor cluster-RPCs en uren-view`

## Gewijzigde en nieuwe bestanden

### Migraties (7 bestanden)

| Bestand | Mutatie |
|---|---|
| `supabase/migrations/20260420000100_driver_availability.sql` | Nieuwe tabel + RLS + trigger |
| `supabase/migrations/20260420000150_vehicle_availability_unique.sql` | UNIQUE-index voor upsert |
| `supabase/migrations/20260420000200_consolidation_auto_fields.sql` | Alter cols: driver_id, proposal_source, capacity_override_* |
| `supabase/migrations/20260420000250_driver_contract_fields.sql` | Alter drivers: contract_hours_per_week + employment_type |
| `supabase/migrations/20260420000300_driver_hours_view.sql` | Nieuwe view `driver_hours_per_week` |
| `supabase/migrations/20260420000400_planning_feature_flag.sql` | Seed tenant_settings.planning + helper-RPCs |
| `supabase/migrations/20260420000600_consolidation_group_rpcs.sql` | RPC's confirm, reject, record_capacity_override |

### Edge Functions (2 bestanden)

| Bestand | Mutatie |
|---|---|
| `supabase/functions/auto-plan-day/index.ts` | Nieuw |
| `supabase/functions/_shared/autoPlanner.ts` | Nieuw, pure planner-logica |

### Frontend, pagina's en hooks (7 bestanden)

| Bestand | Mutatie |
|---|---|
| `src/pages/PlanningV2.tsx` | Nieuw, hoofdpagina achter feature-flag |
| `src/hooks/useDriverAvailability.ts` | Nieuw |
| `src/hooks/useVehicleAvailability.ts` | Nieuw |
| `src/hooks/useAutoPlan.ts` | Nieuw |
| `src/hooks/useIsPlanningV2Enabled.ts` | Nieuw |
| `src/hooks/useDrivers.ts` | Uitgebreid met contract_hours_per_week + employment_type |
| `src/App.tsx` | Route `/planning-v2` toegevoegd |

### Frontend, planbord v2 componenten (7 bestanden)

| Bestand | Mutatie |
|---|---|
| `src/components/planning/v2/DaySetupDialog.tsx` | Nieuw, chauffeur + voertuig per dag |
| `src/components/planning/v2/PlanningDriverLane.tsx` | Nieuw, swim-lane per chauffeur |
| `src/components/planning/v2/ClusterProposalCard.tsx` | Nieuw, klikbare cluster-kaart |
| `src/components/planning/v2/ClusterDetailPanel.tsx` | Nieuw, slide-in paneel met override-flow |
| `src/components/planning/v2/UnplacedOrdersLane.tsx` | Nieuw, Open te plannen-lane |
| `src/components/planning/v2/AutoPlanButton.tsx` | Nieuw, triggert Edge Function |
| `src/components/planning/v2/DocksheetExportButton.tsx` | Nieuw, CSV-export met chauffeur-kolom |

### Frontend, settings en drivers (3 bestanden)

| Bestand | Mutatie |
|---|---|
| `src/components/settings/PlanningV2Toggle.tsx` | Nieuw, admin-toggle zonder SQL |
| `src/components/settings/MasterDataSection.tsx` | Toggle bovenaan toegevoegd |
| `src/components/drivers/NewDriverDialog.tsx` | Contracturen + dienstverband velden |

### Types, tests, docs

| Bestand | Mutatie |
|---|---|
| `src/types/consolidation.ts` | Uitgebreid met proposal_source en capacity_override_* |
| `src/__tests__/autoPlanner.test.ts` | Nieuw, 10 unit-tests voor pure planner |
| `supabase/tests/sprint3_cluster_rpcs.sql` | Nieuw, 4 integration-tests |
| `docs/klant-testplan.md` | 7 scenario's A-G voor planbord 2.0 |
| `docs/sprint-3/01-research.md` | Onderzoeksrapport |
| `docs/sprint-3/02-plan.md` | Plan van aanpak (v2) |

## Default data (seed)

Bij deployment zijn de volgende default-waarden geseed voor elke bestaande tenant:

- **`tenant_settings.planning`**: `{ "v2_enabled": false, "cluster_granularity": "PC2" }`. Standaard uit. Admin activeert via Stamgegevens.

Nieuwe tenants moeten dezelfde seed ontvangen via de onboarding-flow. Deze is buiten scope Sprint 3; checken in Sprint 4 of de `create_tenant` RPC dit automatisch doet.

## Testscenario's voor Badr

Volgorde zoals in `docs/klant-testplan.md §A-G`. Per scenario:

1. **Dagsetup instellen** (CP-05). Verwacht: status per chauffeur en voertuig wordt opgeslagen en blijft zichtbaar na refresh.
2. **Auto-plan uitvoeren** (CP-03, CP-02). Verwacht: voorstellen in swim-lanes binnen 2 seconden, met toast-melding X voorstellen, Y unplaced.
3. **Cluster-details en bevestigen**. Verwacht: paneel opent, Bevestig-knop creëert trip + trip_stops, cluster wordt INGEPLAND.
4. **Laadvermogen-override met reden** (CP-04). Verwacht: lege reden blokkeert, geldige reden wordt opgeslagen met tijdstip en gebruiker.
5. **Contracturen-bewaking** (CP-06). Verwacht: chauffeur met contract 32u krijgt geen structureel 50u-weken voorgesteld, auto-plan plaatst extra orders bij collega's.
6. **Docksheet-export** (CP-01). Verwacht: CSV download met 9 kolommen incl. chauffeur, UTF-8 correct in Excel.
7. **Feature-flag aan/uit**. Verwacht: toggle uit toont gele kaart; PC2 naar PC3 levert fijnere clusters.

Voor technische verificatie: draai `psql -f supabase/tests/sprint3_cluster_rpcs.sql` tegen een testdatabase. Alle 4 tests zouden NOTICE "Test N OK" moeten loggen en daarna automatisch rollbacken.

## Migratiepad van v1 naar v2

Fasering:

1. **Nu, sprint 3 oplevering**: feature-flag default **uit**. Beide planborden draaien parallel op `/planning` en `/planning-v2`. Geen impact op RCS' dagelijkse workflow.
2. **Sprint 4 of vroeger**: zodra RCS het nieuwe planbord een week stabiel gebruikt, sluit het oude af:
   - Zet `tenant_settings.planning.v2_enabled = true` voor alle tenants.
   - Voeg een redirect `/planning` naar `/planning-v2` toe (één regel in `App.tsx`).
   - Verwijder `src/pages/Planning.tsx` en alle `src/components/planning/*` (zonder `/v2` pad).
3. **Sprint 5, Nmbrs-integratie**: vervang `drivers.contract_hours_per_week` handmatig veld door een sync van Nmbrs. Het veld blijft bestaan maar wordt automatisch bijgewerkt.

## Bekende schulden

### Functioneel

1. **Auto-plan splitst regio-cluster niet bij overcapaciteit.** Als één cluster 12 orders samen 8000 kg is en geen voertuig past, vallen alle 12 in `over_capacity`. Zou beter per-order-in-cluster-greedy moeten zijn. **Sprint 4.**
2. **Geen drag-en-drop** tussen chauffeur-lanes in planbord v2. Alles loopt via klik-en-paneel. **Sprint 4.**
3. **Volume-berekening nog niet actief.** Auto-plan rekent met gewicht en pallets, niet met volume uit `shipments.cargo` L×B×H. `total_volume_m3` staat op 0 in voorstellen. **Sprint 4, dan gelijk met stijging in utilization_pct accuratesse.**
4. **Route-optimalisatie binnen cluster.** Stops krijgen een eenvoudige volgorde op `stop_sequence`, geen TSP. Google Maps of OSRM-integratie. **Sprint 4+.**
5. **ML-ETA voor klant.** RouteLogic-benchmark. **Sprint 4+.**
6. **Barcode-scan bij laden/lossen.** **Sprint 4+.**
7. **Minimum-fleet-indicator** ("met X bussen minder kan ook"). **Sprint 4+.**

### Data

8. **Migratie-tracking inconsistent.** `schema_migrations` bevat geen 20260420xxx rows, maar schema is wel toegepast. Oplossen via `supabase db pull` of handmatige INSERT in `supabase_migrations.schema_migrations`.
9. **Koel-voertuig matrix** is te klein voor Fresh Food Brussel-orders (6200 kg). Configuratie-probleem, RCS moet vehicle_types aanpassen of het algoritme moet clusters splitsen (schuld 1 hierboven).

### Productie-kill-switch

Als er kritiek iets misgaat na go-live:

1. Zet `tenant_settings.planning.v2_enabled = false` voor getroffen tenant.
2. Planner werkt direct weer in oude planbord op `/planning`.
3. Bestaande INGEPLAND-clusters blijven als trips staan, geen dataverlies.
4. Na fix: flag weer aan, werk verder.

Geen database-rollback nodig.

## Checklist wat RCS nog moet aanleveren of valideren

- [ ] **Clustergrootte PC2 of PC3** per tenant confirmeren. Default is PC2, kan omgezet naar PC3 via Stamgegevens. Voor bedrijven met veel orders binnen één stad is PC3 beter.
- [ ] **Contracturen per chauffeur** handmatig invullen in het chauffeur-formulier. Zonder waarde zit er geen uren-bewaking. Sprint 5 automatiseert dit via Nmbrs.
- [ ] **Koel-voertuig matrix**: extra type toevoegen voor grote koeltransporten (bijvoorbeeld koel-bakwagen 8000 kg) als Fresh Food-type klanten gepland moeten worden.
- [ ] **Voorkeursrelatie chauffeur-klant**: niet in Sprint 3 scope. Is dit nodig voor Sprint 4? Zo ja, hoe (blacklist, whitelist, voorkeur)?
- [ ] **Nmbrs-koppeling timing**: Sprint 5 staat ingepland. Bevestigen dat Nmbrs-API-toegang er dan is.
- [ ] **Eerste week in productie**: RCS meldt dagelijks of auto-plan bruikbare voorstellen levert. Wij loggen in `pipeline_events` kandidaten, die kunnen we monitoren.

## Definitie van klaar, check

- [x] Alle migratie-stappen gecommit in losse commits met sprint-3-scope
- [x] Unit-tests groen (10 tests in `autoPlanner.test.ts`)
- [x] Integration-test SQL-bestand beschikbaar in `supabase/tests/`
- [x] Live smoke-test tegen remote Edge Function uitgevoerd en gelogd
- [x] Klant-testplan uitgebreid met 7 scenario's
- [x] Feature-flag default uit voor alle tenants
- [x] Admin-toggle aanwezig voor zonder-SQL activering
- [x] Oude planbord werkt nog, niet gewijzigd
- [x] Docksheet-export operationeel
- [x] Changelog opgeleverd

Sprint 3 is klaar.
