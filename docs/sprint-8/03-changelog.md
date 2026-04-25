# Sprint 8, Fase 3, Changelog: Voorspellende ETA-engine met klant-pushes

**Datum**: 2026-04-25
**Scope**: Serverside ETA-berekening, klant-SMS bij T-30 en bij significante ETA-shift, voorspellende-vertraging-exception, planner-settings.

## Wat is er opgeleverd

### Datalaag (1 migratie)

- `supabase/migrations/20260428000000_predicted_eta.sql`, kolommen `predicted_eta TIMESTAMPTZ` en `predicted_eta_updated_at TIMESTAMPTZ` op `trip_stops`. Nieuwe tabel `trip_stop_eta_notifications` met UNIQUE-constraint (trip_stop_id, kind) als dedupe, kind-enum `CUSTOMER_LEAD|CUSTOMER_UPDATE|PREDICTED_DELAY`, indices op (trip_stop_id) en (kind, sent_at), RLS tenant-scoped via join op `trips`. Pg_cron-schedule die elke minuut `eta-watcher` aanroept.

### Edge function

- `supabase/functions/eta-watcher/eta.ts`, pure helpers `haversineKm()` en `calculateEtaMinutes()`. Geen Supabase-imports, volledig unit-testbaar.
- `supabase/functions/eta-watcher/index.ts`, cron-handler die elke minuut alle ACTIEF trips loopt, ETA berekent en opslaat, klant-SMS triggert via `send-notification` (kind `CUSTOMER_LEAD` bij T-30 en `CUSTOMER_UPDATE` bij ETA-shift) en `PREDICTED_DELAY`-exception aanmaakt bij overrun >= drempel.

### Types en validatie

- `src/types/notifications.ts`, `EtaNotificationSettings`-interface en `DEFAULT_ETA_NOTIFICATION_SETTINGS`-constante.
- `src/types/dispatch.ts`, `predicted_eta` en `predicted_eta_updated_at` toegevoegd aan `TripStop`.

### Hooks

- `src/hooks/useEtaSettings.ts`, load- en save-wrapper rond `useLoadSettings('eta_notifications')` en `useSaveSettings`.

### UI, Settings

- `src/components/settings/EtaNotificationSettings.tsx`, planner-config-card met vier number-inputs (`customer_push_lead_minutes`, `customer_update_threshold_minutes`, `predicted_delay_threshold_minutes`, `eta_min_shift_for_badge_minutes`), één severity-select (`predicted_delay_severity`) en master-switch (`customer_notifications_enabled`).
- `src/pages/Settings.tsx`, nieuw nav-item "ETA en klant-meldingen" in de groep Communicatie, eigen `TabsContent` met `<EtaNotificationSettings />`.

### UI, Dispatch / Tracking / Exceptions

- `src/pages/Dispatch.tsx`, gold-accent ETA-mini-badge in trip-header-row als afwijking >= 5 minuten.
- `src/pages/LiveTracking.tsx`, marker-popup leest `predicted_eta` uit DB met fallback op client-side ETA-hook.
- `src/pages/Exceptions.tsx`, nieuwe filter-categorie "Voorspelde vertraging" voor `exception_type='PREDICTED_DELAY'`.

### Tests

- `src/__tests__/eta/etaCalculation.test.ts`, 12 tests op haversine en ETA-formule.
- `src/__tests__/eta/etaThresholds.test.ts`, 15 tests op drempel- en dedupe-logica.

**Verificatie**: `npx tsc --noEmit` schoon, alle 27 nieuwe tests groen.

## Bekende afwijkingen ten opzichte van plan

- Dispatch-badge gebruikt voorlopig hardcoded drempel 5 minuten in plaats van de settings-sleutel `eta_min_shift_for_badge_minutes`. Settings-koppeling staat op de lijst voor een volgende sprint.
- De `/dispatch?trip={id}`-deep-link uit de Exceptions-tab wordt door `Dispatch.tsx` nog niet gehonoreerd: het query-param wordt niet uitgelezen om de juiste trip te focussen.

## Productiecode-fix tijdens review

- `supabase/functions/eta-watcher/index.ts:425`, boundary aangepast van `>` naar `>=` voor de `PREDICTED_DELAY`-trigger, zodat de drempel consistent is met de `CUSTOMER_LEAD`- en `CUSTOMER_UPDATE`-drempels (alle drie inclusief).

## Operationele acties (nog uit te voeren)

- Migratie `20260428000000_predicted_eta.sql` toepassen op Supabase (productie en staging).
- Edge function `eta-watcher` deployen.
- Pg_cron-schedule activeren: elke minuut `eta-watcher` aanroepen.
- Tenant-defaults voor `eta_notifications` seeden of via Settings-card laten invullen.

## Niet in deze sprint

- Auto-herplanning bij voorspelde overschrijding (sprint 9+).
- Leerlus per klantadres (historische gemiddelde stoptijd per locatie).
- Externe routing-API met live-verkeer (HERE, TomTom, Google).
- Per-klant notification-preferences-respect bij ETA-pushes.
- Multi-channel: alleen SMS in v1, geen WhatsApp- of email-variant.
- Settings-koppeling van Dispatch-badge-drempel.
- Honoreren van `?trip={id}`-deep-link in Dispatch-tab.
