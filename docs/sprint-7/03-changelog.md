# Sprint 7, Fase 3, Changelog: Rooster-module

**Datum**: 2026-04-24
**Scope**: Chauffeurs inplannen per dag/week los van orders, met shift-templates en koppeling naar order-planning.

## Wat is er opgeleverd

### Datalaag (3 migraties)

- `supabase/migrations/20260426000000_shift_templates.sql`, tabel `shift_templates` (id, tenant_id, name, default_start_time, default_end_time, color, sort_order, is_active) met RLS tenant-scoped, CHECK op hex-kleur en naam-lengte, UNIQUE op (tenant_id, name), updated_at-trigger. Geen seed, iedere tenant beheert zelf.
- `supabase/migrations/20260426010000_driver_schedules.sql`, tabel `driver_schedules` (tenant_id, driver_id FK, date, shift_template_id FK, start_time, end_time, vehicle_id FK, status, notitie) met UNIQUE (tenant_id, driver_id, date), status-CHECK (werkt|vrij|ziek|verlof|feestdag), indices op (tenant_id, date), (tenant_id, vehicle_id, date) en (driver_id, date), RLS tenant-scoped, updated_at-trigger.
- `supabase/migrations/20260426020000_drivers_default_shift_vehicle.sql`, twee nieuwe kolommen op `drivers`: `default_shift_template_id` en `default_vehicle_id`, beide FK met `ON DELETE SET NULL`, partial-index voor non-null waarden.

### Types en validatie

- `src/types/rooster.ts`, `ShiftTemplate`, `DriverSchedule`, `DriverScheduleStatus`, `DriverScheduleUpsert`, constanten `DRIVER_SCHEDULE_STATUSES` en `DRIVER_SCHEDULE_STATUS_LABELS`, hulpfunctie `resolveSchedule()` die effectieve start- en eindtijd berekent uit schedule + template.
- `src/lib/validation/shiftTemplateSchema.ts`, Zod-schema voor shift-templates met hex-kleur-regex en time-regex.
- `src/lib/validation/driverScheduleSchema.ts`, Zod-schema voor rooster-rijen met transform die lege strings naar null normaliseert.

### Hooks

- `src/hooks/useShiftTemplates.ts`, `templates`, `createTemplate`, `updateTemplate`, `deleteTemplate`, optie `includeInactive`.
- `src/hooks/useDriverSchedules.ts`, range-query met `schedules`, `upsertSchedule`, `bulkUpsert`, `deleteSchedule`, `deleteRange`. `bulkUpsert` heeft fast-path voor lege array.
- `src/hooks/useDriverScheduleForDate.ts`, `useDriverScheduleForDate` (single) en `useDriverSchedulesForDate` (hele datum) voor Planning-prefill.
- `src/hooks/useVehiclesRaw.ts`, voertuigen met echte DB-UUID naast code, nodig omdat `useVehicles()` id→code mapt en `driver_schedules.vehicle_id` een UUID verwacht.
- `src/hooks/useDrivers.ts`, `Driver`-type uitgebreid met `default_shift_template_id` en `default_vehicle_id`.

### UI, Settings

- `src/components/settings/ShiftTemplateSettings.tsx`, tabel-view met Zod-gevalideerde dialog voor aanmaken en bewerken, kleurpicker, sort-order, is_active-toggle, AlertDialog voor verwijderen.
- `src/pages/Settings.tsx`, nieuwe nav-item "Rooster-types" in de data-groep, route-detectie in `getActiveTab`, eigen `TabsContent`.
- `src/components/drivers/NewDriverDialog.tsx`, "Planning"-subsectie met Selects voor Standaardrooster en Standaardvoertuig, zowel in create- als edit-mode.

### UI, Rooster-tab

- `src/components/planning/rooster/RoosterTab.tsx`, wrapper met datum-nav (chevrons + datepicker + "Vandaag") en Dag/Week-switch. `RoosterWeekView` en `RoosterBulkActions` lazy-geïmporteerd met fallback zodat de tab niet crasht als een sub-view nog laadt.
- `src/components/planning/rooster/RoosterDayView.tsx`, tabel per actieve chauffeur met inline-edit voor Rooster/Start/Eind/Voertuig/Status/Notitie. Status-wijziging direct upsert, andere velden debounced 500ms. Status != "werkt" toont "n.v.t." in plaats van voertuig en tijd. Kleur-dot bij rooster-naam, effectieve starttijd als placeholder via `resolveSchedule`. Print-knop + checkbox "toon vrije dagen in PDF".
- `src/components/planning/rooster/RoosterPdfExport.tsx`, `exportDayRosterPdf()` via `jsPDF` (al aanwezig in repo), A4 liggend, kolommen Naam/Rooster/Starttijd/Voertuig/Status/Notitie.
- `src/components/planning/rooster/RoosterWeekView.tsx`, matrix chauffeurs × 7 dagen, cellen met rooster-kleur als linker-strookje + tint, afkorting van template-naam, starttijd, voertuig-code. Weekend lichter. Klik op cel opent `RoosterCellEditor`. Drag-drop tussen cellen kopieert (dnd-kit), plus "Kopieer naar"-menu per cel.
- `src/components/planning/rooster/RoosterCellEditor.tsx`, popover met Rooster, Start, Eind, Voertuig, Status, Notitie. "Opslaan" upsert, "Wis rooster" deleteSchedule.
- `src/components/planning/rooster/RoosterBulkActions.tsx`, drie knoppen met bevestiging: "Kopieer vorige week", "Pas standaardrooster toe" (met keuze "alleen lege dagen" vs "alles overschrijven"), "Wis week" (dubbele bevestiging). Toast-feedback via sonner.
- `src/components/planning/PlanningDateNav.tsx`, `ViewMode` uitgebreid met `"rooster"`, extra toggle-knop.
- `src/pages/Planning.tsx`, branch voor `viewMode === "rooster"` rendert `<RoosterTab />`.

### Integratie met order-planning

- `src/components/planning/PlanningVehicleCard.tsx`, nieuwe props `selectedDate` en `vehicleDbId`. Roept `useDriverSchedulesForDate` aan, prefilt `driverId` en `startTime` via `useEffect` als velden leeg of op hard-coded default staan (`"07:00"`). Dedupe via `useRef` op `${vehicle.id}|${date}|${schedule.id}`. Toont conflict-badge in de kaart-header bij meerdere chauffeurs op één voertuig.
- `src/pages/Planning.tsx`, `useVehiclesRaw` hook, `Map<code, uuid>` voor mapping, props doorgegeven aan elke `PlanningVehicleCard`.
- `src/lib/roosterConflicts.ts`, `findVehicleConflictsOnDate()` (map van vehicle_id → conflicterende schedules) en `hasConflict()` (bool per schedule). Negeert schedules zonder vehicle_id of met status != werkt.

### Tests

- `src/__tests__/roosterConflicts.test.ts`, 12 tests op conflict-helpers.
- `src/__tests__/hooks/useDriverSchedules.test.ts`, 4 tests op upsert-logica en lege-array-fast-path.
- `src/__tests__/components/PlanningVehicleCardPrefill.test.tsx`, 6 tests op prefill-gedrag en conflict-badge.
- `src/__tests__/components/planning-components.test.tsx`, bestaande `baseProps` uitgebreid met `selectedDate` en `vehicleDbId` zodat 63 bestaande tests groen blijven.

**Verificatie**: `npx tsc --noEmit` schoon, 22 nieuwe tests groen, 63 bestaande planning-tests + 52 Planning-page-tests blijven groen.

## Keuzes

- **`useVehiclesRaw` als aparte hook** in plaats van aanpassen van `useVehicles()`, omdat de bestaande drag-and-drop-flow de `code` als id gebruikt en die kapot zou gaan bij een mapping-wijziging. De Rooster-module werkt native met UUIDs via de nieuwe hook; `Planning.tsx` mapt code↔UUID voor de prefill-integratie.
- **Eén `driver_schedules`-rij per (driver, date)**, geen multi-shift-rijen. Nachtdiensten via `end_time < start_time`. Houdt de matrix-weergave simpel.
- **Lazy-import van WeekView en BulkActions** met fallback zodat de agents parallel konden werken zonder blokkerende volgorde.
- **Dubbele bevestiging bij "Wis week"** om accidentele clicks af te vangen; "Pas standaardrooster toe" geeft keuze tussen "alleen lege dagen" (default, veilig) en "alles overschrijven".
- **Prefill-dedupe via `useRef`** in plaats van conditional-effect, zodat user-overrides nooit overschreven worden en re-renders geen dubbele writes triggeren.

## Niet in deze sprint

- Maandweergave (sprint 8).
- Verlof-aanvraag-workflow via chauffeurs-app.
- Capaciteit-waarschuwingen ("te weinig chauffeurs op dag X").
- Automatische rooster-generatie op basis van order-voorspelling.
- Urenregistratie en -verantwoording vanuit rooster-data.
