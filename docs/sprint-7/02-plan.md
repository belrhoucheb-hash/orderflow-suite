# Sprint 7, Fase 2, Plan: Rooster-module

**Datum**: 2026-04-24
**Scope**: Shift-templates, driver_schedules, Rooster-tab (Dag + Week), defaults op drivers, PDF-export, prefill in Planning.

## 1. Datalaag

- **`20260426000000_shift_templates.sql`**, tabel `shift_templates` (id, tenant_id, name, default_start_time, default_end_time, color, sort_order, is_active). RLS tenant-scoped. Seed geen standaard-rooster, tenant voegt zelf toe.
- **`20260426010000_driver_schedules.sql`**, tabel `driver_schedules` (id, tenant_id, driver_id FK, date, shift_template_id FK nullable, start_time nullable, end_time nullable, vehicle_id FK nullable, status enum, notitie). UNIQUE op (tenant_id, driver_id, date). Indices op (tenant_id, date) en (tenant_id, vehicle_id, date). RLS tenant-scoped.
- **`20260426020000_drivers_default_shift_vehicle.sql`**, voeg `default_shift_template_id` en `default_vehicle_id` toe aan `drivers`-tabel.

## 2. Hooks

- **`src/hooks/useShiftTemplates.ts`**, list/create/update/delete, tenant-scoped.
- **`src/hooks/useDriverSchedules.ts`**, list per date-range, upsert per (driver, date), bulk-upsert voor kopieer-week en pas-standaard-toe. Realtime-subscription optioneel.
- **`src/hooks/useDriverScheduleForDate.ts`**, enkele (driver, date) lookup voor `PlanningVehicleCard` prefill.

## 3. UI, Settings

- **`src/components/settings/ShiftTemplateSettings.tsx`**, tabel met inline-edit, kleurpicker, sort-order drag. Onder bestaande Stamgegevens-groep.
- **`src/pages/Settings.tsx`**, nieuwe tab "Rooster-types" onder stamgegevens-groep.

## 4. UI, Rooster-tab in Planning

- **`src/components/planning/rooster/RoosterTab.tsx`**, wrapper met view-switcher (Dag/Week), datum-navigatie, bulk-actie-knoppen.
- **`src/components/planning/rooster/RoosterDayView.tsx`**, tabel Naam/Rooster/Starttijd/Voertuig/Status/Notitie, inline bewerkbaar. Voert upsert uit per cel-blur.
- **`src/components/planning/rooster/RoosterWeekView.tsx`**, matrix chauffeurs × 7 dagen, cellen gekleurd op rooster-type, klik = snel-bewerken-popover, slepen = kopiëren naar andere dag.
- **`src/components/planning/rooster/RoosterCellEditor.tsx`**, popover-editor met rooster-select, starttijd-input, voertuig-select, status-select, notitie.
- **`src/components/planning/rooster/RoosterBulkActions.tsx`**, knoppen: "Kopieer vorige week", "Pas standaardrooster toe", "Wis week".
- **`src/components/planning/rooster/RoosterPdfExport.tsx`**, genereer PDF via bestaande PDF-helper (checken welke lib in gebruik is, anders `@react-pdf/renderer` of `jspdf`).
- **`src/pages/Planning.tsx`**, voeg "Rooster" toe aan view-mode-switcher naast "Dag/Week/Map".

## 5. UI, Chauffeur-profiel defaults

- **`src/components/chauffeurs/DriverProfileForm.tsx`** (bestaand), voeg velden toe: Standaardrooster (select uit shift_templates), Standaardvoertuig (select uit vehicles).

## 6. Integratie met Planning

- **`src/components/planning/PlanningVehicleCard.tsx`**, uitbreiden zodat bij mount per (vehicle, date) gecheckt wordt welke chauffeur in `driver_schedules` ingepland staat, en `driverId` + `startTime` daaruit prefillen als user nog niets heeft ingevuld. Handmatige override blijft mogelijk.
- **`src/lib/roosterConflicts.ts`**, helper `findVehicleConflicts(schedules, date)` voor UI-waarschuwing als twee chauffeurs op één voertuig staan.

## 7. Tests

- **`src/__tests__/roosterConflicts.test.ts`**, conflict-detectie: zelfde voertuig zelfde dag, zelfde voertuig verschillende dagen (ok), geen voertuig (ok).
- **`src/__tests__/hooks/useDriverSchedules.test.ts`**, upsert-merge, bulk-copy-week, range-query.
- **`src/__tests__/components/RoosterDayView.test.tsx`**, inline edit, status-switch verbergt starttijd+voertuig.

## 8. Docs

- **`docs/sprint-7/01-research.md`**, **`02-plan.md`**, **`03-changelog.md`**.
- **`docs/klant-testplan.md`**, bijwerken met rooster-scenarios in klant-taal.

## Stappenvolgorde

1. Migraties + hooks + types (fundament, blokkeert UI).
2. Parallel: Shift-templates Settings, Rooster Day/Week views, PDF-export, Planning-integratie.
3. Chauffeur-profiel defaults-velden.
4. Conflict-detectie helper + UI-waarschuwing.
5. Tests.
6. Klant-testplan + changelog.

## Subagent-verdeling

| Agent | Scope |
|---|---|
| Foundation (ikzelf) | Migraties, hooks, types, validatie-schemas |
| Agent A | Settings-tab Rooster-types + chauffeur-profiel defaults |
| Agent B | RoosterTab + RoosterDayView + PDF-export |
| Agent C | RoosterWeekView + bulk-acties (kopieer-week, pas-standaard-toe) |
| Agent D | Planning-integratie (prefill PlanningVehicleCard) + conflict-helper + tests |
