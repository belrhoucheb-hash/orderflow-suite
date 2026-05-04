# Deploy-verify: AANGEKOMEN dubbel-fire check

**Doel**: na deploy van `notify-customer-stop-status` plus migratie `20260504130000_trip_stops_last_notified.sql` verifieren dat een AANGEKOMEN-overgang exact 1 klantnotificatie oplevert, en beslissen of de legacy DB-trigger `trg_notify_driver_arrived` weg kan.

Werkvolgorde: kies een test-stop, trigger AANGEKOMEN, controleer notifications-tabel, controleer `last_notified_status`, hertrigger en verifieer dat geen tweede notificatie wordt aangemaakt. Pas dan beslissen over de drop.

## 1. Voorwaarden

- Migratie `20260504130000_trip_stops_last_notified.sql` is toegepast (kolom `trip_stops.last_notified_status` bestaat).
- Edge function `notify-customer-stop-status` is gedeployed met de dedup-check op `last_notified_status`.
- Hook `useUpdateStopStatus` (frontend) of een test-call roept de edge function aan na de stop-update.
- Test-tenant met minstens 1 actieve `client_portal_users`-rij voor de klant van de test-order, anders worden er broadcast-fallback rows met `user_id = NULL` aangemaakt en is dedup nog steeds zichtbaar.

## 2. Test-stop kiezen

```sql
-- Pak een willekeurige stop in GEPLAND of ONDERWEG met een echte order
SELECT s.id AS trip_stop_id, s.trip_id, s.order_id, s.stop_status,
       s.last_notified_status, t.tenant_id, o.order_number
FROM public.trip_stops s
JOIN public.trips t ON t.id = s.trip_id
JOIN public.orders o ON o.id = s.order_id
WHERE s.stop_status IN ('GEPLAND','ONDERWEG')
  AND t.tenant_id = '<TEST_TENANT_ID>'
ORDER BY s.created_at DESC
LIMIT 5;
```

Noteer `trip_stop_id`, `tenant_id` en `order_id`.

## 3. AANGEKOMEN triggeren

Twee paden om te dekken:

### 3a. Via de chauffeursportaal (realistisch pad)

1. Log in op `/chauffeur` als de chauffeur op de test-trip.
2. Swipe de stop naar AANGEKOMEN (of laat de geofence het doen).
3. De hook `useUpdateStopStatus` doet de update én `supabase.functions.invoke("notify-customer-stop-status", ...)`.

### 3b. Direct via SQL plus edge call (snel, zonder UI)

```sql
UPDATE public.trip_stops
SET stop_status = 'AANGEKOMEN', actual_arrival_time = now()
WHERE id = '<TRIP_STOP_ID>';
```

Dit triggert de legacy `trg_notify_driver_arrived` (DB-trigger) maar **niet** de Edge Function. Roep daarna handmatig aan om beide paden te dekken:

```bash
curl -X POST \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"trip_stop_id":"<TRIP_STOP_ID>","status":"AANGEKOMEN"}' \
  https://<PROJECT>.functions.supabase.co/notify-customer-stop-status
```

## 4. Verifieer notifications-tabel

Maximaal 1 notificatie per portal-user (of 1 broadcast-row met `user_id IS NULL` als er geen portal-user is):

```sql
SELECT id, user_id, type, title, created_at,
       metadata->>'trip_stop_id' AS stop_id,
       metadata->>'status' AS status
FROM public.notifications
WHERE metadata->>'trip_stop_id' = '<TRIP_STOP_ID>'
  AND metadata->>'status' = 'AANGEKOMEN'
ORDER BY created_at;
```

**Verwachting**: aantal rijen = `count(distinct client_portal_users.user_id)` voor de klant, of 1 als die telling 0 is. Niet meer.

Als er meer rijen zijn met dezelfde `(stop_id, status)` en dezelfde of NULL `user_id`: dedup heeft niet gewerkt, of de legacy DB-trigger heeft een eigen pad (`dispatch_notification`) dat ook in de notifications-tabel schrijft. Check dan paragraaf 6.

## 5. `last_notified_status` gevuld

```sql
SELECT id, stop_status, last_notified_status, updated_at
FROM public.trip_stops
WHERE id = '<TRIP_STOP_ID>';
```

**Verwachting**: `last_notified_status = 'AANGEKOMEN'`. Als NULL: de Edge Function is niet aangeroepen, of de update na insert is gefaald (check `notify-customer-stop-status` logs).

## 6. Hertrigger en verifieer dedup

Roep de Edge Function nogmaals aan met dezelfde body:

```bash
curl -X POST \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"trip_stop_id":"<TRIP_STOP_ID>","status":"AANGEKOMEN"}' \
  https://<PROJECT>.functions.supabase.co/notify-customer-stop-status
```

Response moet zijn: `{"skipped":true,"reason":"already_notified"}`.

Tel daarna nogmaals de notifications-rijen voor dit stop. Aantal moet **gelijk** zijn aan stap 4.

## 7. Beslis-moment: drop legacy DB-trigger?

De legacy trigger `trg_notify_driver_arrived` roept `dispatch_notification('DRIVER_ARRIVED', ...)` aan. Die functie heeft een eigen pad (vermoedelijk `notification_dispatch_log` of direct `send-notification`-aanroep) en is **niet** geintegreerd met `last_notified_status`. Dat geeft het risico op een dubbele AANGEKOMEN-broadcast: 1 via Edge Function, 1 via DB-trigger.

Check eerst of de legacy trigger nog daadwerkelijk een klantnotificatie oplevert die bij de klant aankomt (email/SMS via `send-notification`-template `DRIVER_ARRIVED`):

```sql
-- Recente DRIVER_ARRIVED-dispatches
SELECT id, trigger_event, tenant_id, order_id, created_at, status
FROM public.notification_dispatch_log
WHERE trigger_event = 'DRIVER_ARRIVED'
  AND tenant_id = '<TEST_TENANT_ID>'
ORDER BY created_at DESC
LIMIT 20;
```

Als de Edge Function al de email/SMS-flow afdekt (zie `notify-customer-stop-status` regel `if (message.triggerEvent)` → `send-notification`-call), dan dupliceert de DB-trigger.

**Drop-criterium**: alle drie waar?

- [ ] Edge Function staat live en is gekoppeld aan de hook (zichtbaar in `useUpdateStopStatus`).
- [ ] Klant ontvangt 1 email/SMS bij AANGEKOMEN (niet 2).
- [ ] `notifications`-tabel toont 1 rij per portal-user per AANGEKOMEN-overgang.

Als ja: drop de trigger.

```sql
-- Drop alleen de trigger op trip_stops, niet de functie zelf,
-- zodat we hem kunnen herstellen door 'm opnieuw te koppelen
-- als de Edge Function-pad onverhoopt regresseert.
DROP TRIGGER IF EXISTS trg_notify_driver_arrived ON public.trip_stops;

-- Sanity-check: trigger is weg
SELECT tgname
FROM pg_trigger
WHERE tgrelid = 'public.trip_stops'::regclass
  AND tgname = 'trg_notify_driver_arrived';
-- Verwacht: 0 rijen.
```

**Rollback** (als de Edge Function alsnog faalt en we de trigger terug willen):

```sql
CREATE TRIGGER trg_notify_driver_arrived
  AFTER UPDATE OF stop_status ON public.trip_stops
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notify_driver_arrived();
```

De functie zelf (`public.trg_notify_driver_arrived()`) blijft staan in de baseline, dus deze rollback is altijd mogelijk zonder migratie.

## 8. Smoke-test in productie

Na de drop, herhaal stappen 2-6 op een productie-stop met een echte klant. Tel klant-emails/SMS in `notification_dispatch_log` met `trigger_event = 'DRIVER_ARRIVED'`: exact 1 per AANGEKOMEN-overgang.
