# Sprint 4, Fase 1, Onderzoek

Status: **leeg skelet**, aangemaakt 2026-04-21 op basis van doorgeschoven items uit Sprint 3. Nog geen code- of schema-onderzoek gedaan.

## 1. Doorgeschoven vanuit Sprint 3

Uit de tech-debt-tabel aan het einde van Sprint 3 (zie ook `docs/sprint-3/02-plan.md:460`). Niet gebouwd in Sprint 3, expliciet geparkeerd voor Sprint 4 of later.

### 1.1 Kandidaten voor Sprint 4

- **CP-01 docksheet/EDD export** (indien niet meer gehaald in Sprint 3). Mitigatie was al voorzien, zie `docs/sprint-3/02-plan.md:15`. Template en locatie moeten door Badr worden aangeleverd.
- **ML-ETA naar klant** (RouteLogic-feature). Vereist externe route-service. Afhankelijkheid bepalen voor scoping.
- **Barcode scan bij laden**. Mobile/scanner-flow, raakt driver-app. Scope en device-keuze nog open.
- **Auto-plan splitst regio-cluster niet als overladen** (Brussel-case). Ontwerpkeuze, geen quick fix. Vereist design-ronde.
- **Volume-berekening uit `shipments.cargo` L×B×H**. Nu alleen gewicht+pallets; volume zou `max(volume_pct, weight_pct)` in CP-04 completer maken.
- **Route-optimalisatie binnen cluster** (Google Maps of OSRM). Externe afhankelijkheid, kosten en quota nog niet onderzocht.
- **Drag-drop tussen chauffeur-lanes**. Polish op bestaande klik+paneel-flow.

### 1.2 Niet voor Sprint 4

- **Nmbrs-integratie voor contracturen**, geparkeerd voor Sprint 5.
- **Koel-voertuigmatrix te klein voor Fresh Food-orders (6200 kg)**. Configuratie-issue, RCS moet `vehicle_types` aanpassen, geen dev-werk.
- **Migratie-tracking: `list_migrations` toont `20260420xxx` niet**. Herstel via `supabase db pull` of handmatig in `schema_migrations`, operationeel.

## 2. Nog te doen in deze fase

- [ ] Sprint 3 afsluiten (`docs/sprint-3/03-changelog.md`) en vaststellen welke CP's écht zijn doorgeschoven.
- [ ] Prioriteiten-ronde met Badr over §1.1.
- [ ] Per gekozen item: schema-impact, UI-impact, externe afhankelijkheden in kaart brengen.
- [ ] Risico's en mitigaties zoals in Sprint 3-plan.
