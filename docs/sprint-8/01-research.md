# Sprint 8, Fase 1, Research: Voorspellende ETA-engine met klant-pushes

**Datum**: 2026-04-25
**Aanleiding**: Vertragingen worden nu pas zichtbaar nadat het tijdvenster gebroken is. Klanten ontvangen geen vooraankondiging en de planner ziet pas reactief dat het misgaat. We willen serverside voorspellen wanneer een stop bereikt wordt, en daarop pushen vóórdat de SLA stuk is.

## Probleemstelling

Vandaag leeft de ETA-berekening alleen in React-state op het tracking-scherm. Zodra niemand naar de pagina kijkt, is er geen voorspelling, geen historie, en geen trigger naar buiten. Daarmee is de klant pas op de hoogte als de chauffeur op de stoep staat (of te laat), en is de planner pas in actie als de tracking-status `delayed` of `critical` is.

Nadelen van de huidige situatie:
- Geen serverside ETA: hooks als `useTripETA` rekenen client-side, niets wordt opgeslagen.
- Geen klant-vooraankondiging: orders met `recipient_phone` krijgen niets vóór levering.
- Geen voorspellende exception: pas wanneer het venster overschreden is, ziet de planner het signaal.
- Geen audit op verstuurde klant-meldingen specifiek voor ETA, dus geen dedupe en geen herstuur-veiligheid.
- Drempels (T-30, ETA-shift, vertraging-grens) zijn gewenst configureerbaar per tenant, niet hardcoded.

## Bestaande bouwstenen

- [src/hooks/useTracking.ts:562-615](../../src/hooks/useTracking.ts#L562), `useTripETA` rekent haversine + 25 min/stop, niet gepersisteerd.
- [src/hooks/useTracking.ts:496-557](../../src/hooks/useTracking.ts#L496), `useTripTrackingStatuses` levert reactief `on_time / delayed / critical` per stop.
- `supabase/functions/send-notification`, edge function met SMS via Twilio en email via SMTP, schrijft `notification_log` als audit.
- `supabase/functions/notify-expiring-certificates`, bestaand template voor cron-edge-function met dedupe-tabel.
- `tenant_settings`-pattern via `useLoadSettings` / `useSaveSettings`, JSONB per categorie.
- `/track?q=order_number`, publieke trackingpagina die als deeplink in klant-SMS gebruikt kan worden.
- `orders.recipient_phone`, `orders.recipient_email` en `orders.notification_preferences` zijn al gevuld in de orderflow.

## Beslissingen

1. **Serverside ETA op `trip_stops`, niet in React-state**. Twee kolommen `predicted_eta` en `predicted_eta_updated_at`, geschreven door een cron-edge-function elke minuut. Frontend leest dezelfde waarde, geen dubbele bron van waarheid.
2. **Dedupe-tabel `trip_stop_eta_notifications`**, één rij per (trip_stop_id, kind), zodat dezelfde klant niet twee keer een T-30 SMS krijgt en exception-aanmaak idempotent is.
3. **Drempels in `tenant_settings.category='eta_notifications'`**, geen hardcoded constanten in code, planner kan zelf bijstellen vanuit Settings.
4. **Master-switch `customer_notifications_enabled`**, voor demo en bij invoering kan de tenant klant-pushes uit zetten zonder de exception-laag te verliezen.
5. **Hergebruik van `send-notification`**, geen eigen Twilio-client in de ETA-watcher. Twee nieuwe template-types `CUSTOMER_LEAD` (T-30) en `CUSTOMER_UPDATE` (ETA-shift), uniforme audit in `notification_log`.
6. **Voorspellende vertraging is een eigen exception-type**, `PREDICTED_DELAY` in plaats van een variant op `DELAYED`. Zo blijft de bestaande exceptions-flow ongewijzigd en is de "vóórspellend"-categorie filterbaar in de UI.
7. **Alleen pure functies in `eta.ts`**, `haversineKm` en `calculateEtaMinutes`. Edge function `index.ts` is de orkestrator. Pure logica is unit-testbaar zonder Supabase-mocks.
8. **Pg_cron elke minuut**, geen polling vanuit frontend. Frontend leest periodiek de waarde via subscription/poll, maar drijft geen berekening aan.

## Scope

**In scope sprint 8:**
- Schema-migratie met kolommen, dedupe-tabel en pg_cron-job.
- Edge function `eta-watcher` met pure ETA-helpers en orkestratie.
- Drempel-config in `tenant_settings` plus settings-UI.
- Klant-SMS bij T-30 en bij ETA-shift via `send-notification`.
- Voorspellende-vertraging als eigen exception-categorie.
- Dispatch-mini-badge bij significante ETA-shift.
- LiveTracking-popup leest serverside ETA met fallback.
- Klant-testplan uitbreiden.

**Buiten scope (sprint 9+):**
- Auto-herplanning bij voorspelde overschrijding.
- Leerlus per klantadres (historische gemiddelde stoptijd).
- Externe routing-API met verkeer-realtime (HERE, TomTom, Google).
- Per-klant notification-preferences-respect bij ETA-pushes (nu alleen `recipient_phone` aanwezigheid).
- Multi-channel: alleen SMS in v1, geen WhatsApp of email-variant van CUSTOMER_LEAD/UPDATE.
- Settings-koppeling van Dispatch-badge-drempel (UI gebruikt voorlopig hardcoded 5 min).

## Acceptatiecriteria

- Iedere ACTIEF trip krijgt elke minuut een verse `predicted_eta` per niet-afgeronde stop.
- Klant met `recipient_phone` ontvangt precies één T-30 SMS, met track-link, vóór de aankomst.
- Verschuift de ETA na T-30 met meer dan de drempel, dan ontvangt de klant precies één extra SMS met de nieuwe tijd.
- Komt de voorspelde aankomst meer dan de drempel boven het tijdvenster, dan staat er een `PREDICTED_DELAY`-exception klaar in Exceptions-tab, met severity uit settings.
- Zet de planner `customer_notifications_enabled` op uit, dan stoppen klant-SMS direct, exception-laag blijft draaien.
- Drempels zijn aanpasbaar zonder code-deploy, via Settings > "ETA en klant-meldingen".
- Geen duplicate SMS bij re-run van de cron, dedupe op (trip_stop_id, kind).
