# Sprint 7, Fase 1, Research: Rooster-module (chauffeurs inplannen los van orders)

**Datum**: 2026-04-24
**Aanleiding**: Klant pland chauffeurs nu in Excel (kolommen Naam, Rooster, Starttijd, Kenteken). Wil dit in het systeem, onafhankelijk van orders, per dag/week/maand.

## Probleemstelling

Vandaag zit chauffeur + starttijd + voertuig verstopt in de order-planning (`PlanningVehicleCard`): pas als er orders aan een voertuig zijn toegewezen, wordt de combinatie zichtbaar. De Excel-aanpak is andersom: eerst rooster vastleggen, dan pas orders daar tegenaan hangen.

Nadelen van Excel:
- `Rooster` is vrije tekst (Vroeg/Dag/Laat/Hoya), geen default-tijden, geen regels.
- `Kenteken` is vrije tekst, geen koppeling met `vehicles`-tabel, risico op tikfouten en conflicten.
- `-` voor vrij/ziek is ambigu (geen status-enum).
- Geen herhaling: iedere dag opnieuw intypen, terwijl 80% hetzelfde is als vorige week.
- Geen conflict-detectie (twee chauffeurs op één voertuig op dezelfde dag blijft onopgemerkt).
- Niet leesbaar voor de order-planning, dubbel onderhoud.

## Bestaande bouwstenen

- [src/pages/Planning.tsx](../../src/pages/Planning.tsx) heeft al `vehicleStartTimes` en `vehicleDrivers` per datum, opgeslagen als `planning_drafts`. Die zijn echter per-voertuig (niet per-chauffeur) en vereisen order-toewijzingen.
- [src/hooks/useDrivers.ts](../../src/hooks/useDrivers.ts) levert de chauffeurs-lijst, met `current_vehicle_id` als zwak pair-veld (bedoeld als "nu toegewezen", niet als default-rooster).
- [src/hooks/useVehicles.ts](../../src/hooks/useVehicles.ts) levert voertuigen met kenteken.
- [src/pages/Settings.tsx](../../src/pages/Settings.tsx) heeft al tabs-structuur voor stamgegevens-CRUD, geschikt voor shift-templates.
- [src/components/planning/PlanningVehicleCard.tsx:60-61](../../src/components/planning/PlanningVehicleCard.tsx#L60) heeft al `startTime`/`onStartTimeChange` + `driverId`/`onDriverChange` props, kan prefill vanuit rooster krijgen.

## Beslissingen

1. **Nieuwe tabellen, geen misbruik van `planning_drafts`**. Drafts zijn scratch-data per order-planning, rooster is autoritatief en langer geldig.
2. **Shift-templates zijn tenant-configureerbaar**. Vroeg/Dag/Laat/Hoya zijn namen uit één klant, niet hardcoded. Iedere tenant definieert eigen roosters met default start- en eindtijd.
3. **Driver-defaults op de `drivers`-tabel**: `default_shift_template_id` en `default_vehicle_id`. Zo is "Andreas rijdt altijd Caddy35 in dagdienst" één veld in zijn profiel, niet iedere dag opnieuw.
4. **Status-enum** op rooster-rij: `werkt` / `vrij` / `ziek` / `verlof` / `feestdag`. Vervangt het Excel-streepje.
5. **`driver_schedules` is de bron van waarheid** voor "wie werkt wanneer met welk voertuig". `PlanningVehicleCard` leest hieruit als prefill, blijft overschrijfbaar per ordertoewijzing.
6. **Drie views onder één tab "Rooster"** binnen bestaande Planning-pagina, conform de voorkeur om features onder bestaande tabs te plaatsen.
7. **Uniek per (tenant, driver, date)**: één chauffeur heeft per dag één rooster-rij. Nachtdiensten over middernacht worden opgelost via `end_time < start_time` semantiek, niet via twee rijen.
8. **Voertuig-conflict is waarschuwing, geen blok**: twee chauffeurs op één voertuig op dezelfde dag mag, maar UI toont waarschuwing (denk aan wissel-diensten).

## Scope

**In scope sprint 7:**
- Schema + hooks
- Shift-templates CRUD in Settings
- Rooster-tab in Planning met Dag- en Week-view
- Bulk-acties: kopieer-vorige-week, pas-standaardrooster-toe
- PDF-export dagrooster (ochtendbriefing)
- Prefill in `PlanningVehicleCard` vanuit `driver_schedules`
- Voertuig-conflict-waarschuwing in UI
- Klant-testplan uitbreiden

**Buiten scope (sprint 8+):**
- Maandweergave
- Verlof-aanvraag-workflow via chauffeurs-app
- Capaciteit-waarschuwingen ("je hebt maandag 2 chauffeurs te weinig")
- Automatische rooster-generatie op basis van order-voorspelling
- Urenverantwoording / tijdregistratie

## Acceptatiecriteria

- Klant kan een week-rooster invullen zonder één order te hoeven aanmaken.
- "Kopieer vorige week" vult 80% van de week in één klik.
- Dagrooster is printbaar als PDF met alle info uit de Excel (naam, rooster, starttijd, kenteken) plus status en notitie.
- Als er morgen een rooster-rij staat voor Andreas+Caddy35+10:00, is die prefill zichtbaar zodra Andreas orders op Caddy35 krijgt in de order-planning.
- Twee chauffeurs op één voertuig op dezelfde dag geeft een zichtbare waarschuwing, maar blokkeert niet.
- Shift-templates zijn per tenant configureerbaar, niet hardcoded.
