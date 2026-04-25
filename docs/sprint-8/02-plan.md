# Sprint 8, Fase 2, Plan: Voorspellende ETA-engine met klant-pushes

**Datum**: 2026-04-25
**Scope**: Serverside ETA-berekening per minuut, klant-SMS bij T-30 en bij significante ETA-shift, voorspellende-vertraging-exception, planner-settings voor drempels.

## 1. Datalaag

- **`20260428000000_predicted_eta.sql`**, voeg `predicted_eta TIMESTAMPTZ` en `predicted_eta_updated_at TIMESTAMPTZ` toe aan `trip_stops`. Nieuwe tabel `trip_stop_eta_notifications` (id, trip_stop_id FK, kind enum `CUSTOMER_LEAD|CUSTOMER_UPDATE|PREDICTED_DELAY`, sent_at, payload JSONB) met UNIQUE (trip_stop_id, kind) als dedupe. Indices op (trip_stop_id) en (kind, sent_at). RLS tenant-scoped via join op `trips`. Pg_cron-schedule die elke minuut `eta-watcher` aanroept.

## 2. Edge function

- **`supabase/functions/eta-watcher/eta.ts`**, pure helpers: `haversineKm(lat1, lng1, lat2, lng2)` en `calculateEtaMinutes(distanceKm, speedKmh, stopBufferMinutes, remainingStops)`. Geen imports van Supabase, volledig unit-testbaar.
- **`supabase/functions/eta-watcher/index.ts`**, cron-handler. Stappen per run:
  1. Laad alle trips met status `ACTIEF` en hun stops + tenant-settings.
  2. Per stop: bereken `predicted_eta` met haversine vanaf laatste GPS-positie.
  3. Schrijf `predicted_eta` en `predicted_eta_updated_at` terug naar `trip_stops`.
  4. Bepaal of T-30 (lead-window) bereikt is voor stops met `recipient_phone`.
  5. Als ja en geen rij in dedupe-tabel met kind `CUSTOMER_LEAD`: roep `send-notification` aan met SMS-template inclusief track-link, schrijf dedupe-rij.
  6. Bepaal of ETA-shift sinds laatste update >= `customer_update_threshold_minutes` is.
  7. Als ja en geen rij in dedupe-tabel met kind `CUSTOMER_UPDATE`: stuur tweede SMS met nieuwe tijd, schrijf dedupe-rij.
  8. Als `predicted_eta` >= bovenkant tijdvenster + `predicted_delay_threshold_minutes`: insert exception type `PREDICTED_DELAY` met severity uit settings, schrijf dedupe-rij met kind `PREDICTED_DELAY`.

## 3. Drempel-config in tenant_settings

Onder `tenant_settings.category='eta_notifications'`:

| Sleutel                                | Default  | Betekenis                                       |
| -------------------------------------- | -------- | ----------------------------------------------- |
| `customer_push_lead_minutes`           | 30       | Aantal minuten vóór ETA voor eerste klant-SMS   |
| `customer_update_threshold_minutes`    | 15       | ETA-shift waarboven tweede klant-SMS gaat       |
| `predicted_delay_threshold_minutes`    | 15       | Aantal minuten boven tijdvenster voor exception |
| `predicted_delay_severity`             | MEDIUM   | LOW / MEDIUM / HIGH                             |
| `eta_min_shift_for_badge_minutes`      | 5        | Drempel voor gele dispatcher-badge              |
| `customer_notifications_enabled`       | true     | Master-switch klant-pushes                      |

## 4. UI, Settings

- **`src/types/notifications.ts`**, `EtaNotificationSettings`-interface plus `DEFAULT_ETA_NOTIFICATION_SETTINGS`-constante.
- **`src/hooks/useEtaSettings.ts`**, load- en save-wrapper rond `useLoadSettings('eta_notifications')` en `useSaveSettings`.
- **`src/components/settings/EtaNotificationSettings.tsx`**, planner-config-card met vier number-inputs, één severity-select, één master-switch.
- **`src/pages/Settings.tsx`**, nieuw nav-item "ETA en klant-meldingen" in groep Communicatie, eigen `TabsContent`.

## 5. UI, Dispatch / Tracking / Exceptions

- **`src/types/dispatch.ts`**, voeg `predicted_eta` en `predicted_eta_updated_at` toe aan `TripStop`.
- **`src/pages/Dispatch.tsx`**, gold-accent ETA-mini-badge in trip-header-row als afwijking >= 5 minuten (hardcoded drempel in v1, settings-koppeling in v2).
- **`src/pages/LiveTracking.tsx`**, marker-popup leest `predicted_eta` uit DB, met fallback op client-side `useTripETA` als kolom leeg is.
- **`src/pages/Exceptions.tsx`**, nieuwe filter-categorie "Voorspelde vertraging" voor `exception_type='PREDICTED_DELAY'`, eigen icoon en kleur.

## 6. Tests

- **`src/__tests__/eta/etaCalculation.test.ts`**, 12 tests op `haversineKm` en `calculateEtaMinutes`: bekende afstanden Amsterdam-Rotterdam, antimeridiaan-edge, 0-distance, snelheid 0, negatieve buffer.
- **`src/__tests__/eta/etaThresholds.test.ts`**, 15 tests op drempel- en dedupe-logica: precies-op-drempel (>=), net eronder (geen actie), tweede run zelfde minuut (dedupe), shift onder threshold (geen update-SMS), boundary `>=` voor PREDICTED_DELAY.

## 7. Documentatie

- **`docs/sprint-8/01-research.md`**, **`02-plan.md`**, **`03-changelog.md`**.
- **`docs/sprint-8/04-klant-testplan.md`**, klant-taal testscenario's voor planner.

## Stappenvolgorde

1. Migratie + types (fundament).
2. Pure ETA-helpers + tests (geen Supabase nodig).
3. Edge function `eta-watcher` orkestratie.
4. Settings-types, hook, settings-card.
5. Dispatch-badge, LiveTracking-popup, Exceptions-filter.
6. Drempel- en dedupe-tests.
7. Klant-testplan + changelog.

## Subagent-verdeling

| Agent              | Scope                                                                |
| ------------------ | -------------------------------------------------------------------- |
| Backend (ikzelf)   | Migratie, dedupe-tabel, pg_cron, edge function `eta-watcher`         |
| Agent A (frontend) | Settings-card, hook, types, nav-item                                 |
| Agent B (frontend) | Dispatch-badge, LiveTracking-popup, Exceptions-filter                |
| Agent C (test)     | `etaCalculation.test.ts` + `etaThresholds.test.ts`                   |
| Agent D (docs)     | Research, plan, changelog, klant-testplan                            |

## Verificatie

- `npx tsc --noEmit` schoon.
- 27 nieuwe tests groen.
- Edge function lokaal aangeroepen met seed-data: ETA gevuld in DB, klant-SMS in `notification_log`, exception in `exceptions`-tabel.
- Settings-card opent en slaat waarden op, master-switch zet klant-SMS daadwerkelijk uit.
- Dispatch-badge verschijnt bij >= 5 min afwijking, verdwijnt eronder.
