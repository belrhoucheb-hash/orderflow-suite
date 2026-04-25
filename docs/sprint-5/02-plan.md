# Sprint 5, Fase 2, Plan

**Datum**: 2026-04-23
**Scope**: Outbound webhooks met outbox-pattern, HMAC-SHA256 signing, retry/backoff, delivery-log met replay.

## 1. Datalaag

- **`20260424000000_webhook_subscriptions.sql`** , tabel, RLS (tenant-admin CRUD, service_role full), `updated_at`-trigger, URL-https check, secret-lengte check, events-niet-leeg check.
- **`20260424010000_webhook_deliveries.sql`** , outbox-tabel + attempts-tabel, partial index op `(next_attempt_at)` waar `status='PENDING'`, RLS (admin SELECT/UPDATE op deliveries voor replay, admin SELECT-only op attempts), SQL-functie `public.emit_webhook_event(tenant_id, event_type, payload)` als enige schrijfpad.

## 2. Shared code

- **`supabase/functions/_shared/webhook-signer.ts`** , `signPayload`, `buildWebhookHeaders`, `generateWebhookSecret` (base64url, 256-bit).
- **`supabase/functions/_shared/webhook-events.ts`** , `KNOWN_EVENT_TYPES`, `mapStatusToEvent(entity, status)`, `genericStatusEvent(entity)`.
- **`supabase/functions/_shared/emit-webhook.ts`** , wrapper rond RPC naar `emit_webhook_event`. Errors loggen, niet throwen.

## 3. Integratie in bestaande triggers

- **`pipeline-trigger/index.ts`** , na status-change-detectie, vóór autonomy-gate: emit specifiek event + generiek `<entity>.status_changed`.
- **`financial-trigger/index.ts`** , direct na entry: emit `trip.completed`. Na invoice-insert: emit `invoice.created` per klant-factuur.

## 4. Dispatcher

- **`supabase/functions/webhook-dispatcher/index.ts`** , accepteert service-role JWT (DB-webhook op deliveries insert) en CRON_SECRET (polling). Batch van max 50 PENDING, parallel POST met 10s timeout. Schrijft per poging een rij in `webhook_delivery_attempts`. Bij 2xx: mark DELIVERED, reset `consecutive_failures`. Bij niet-2xx/error: increment `attempt_count`, bereken `next_attempt_at` op backoff-schema (1m/5m/30m/2u/12u), na 6 pogingen DEAD.

## 5. UI

- **`src/hooks/useWebhooks.ts`** , React Query hooks voor subscriptions (list/create/update/delete), deliveries per subscription, attempts per delivery, replay-delivery, test-event (emit `webhook.test`).
- **`src/components/settings/WebhookSettings.tsx`** , hoofd-component met lijst, rij-acties (test, log, delete, active-toggle), create-dialog, secret-reveal-dialog (eenmalig), delivery-log sheet met per-rij expand en replay.
- **`src/pages/Settings.tsx`** , nav-item "Webhooks" onder groep "Communicatie", route-match op `/settings/webhooks`, `TabsContent` die `WebhookSettings` rendert.

## 6. Tests

- **`src/__tests__/webhookSigner.test.ts`** , HMAC-determinisme, verschillende secrets/bodies/timestamps geven verschillende signatures, header-bouwer levert alle velden, secret-generator geeft unieke base64url. Status-to-event mapping voor alle orders/trips/invoices. Contract: KNOWN_EVENT_TYPES bevat alle v1-events.

## 7. Documentatie

- **`docs/api/webhooks.md`** , publieke doc: subscriptions, events-tabel, payload-shape, headers, signature-verificatie (Node + PHP), idempotentie, retry-schema, delivery-log, limieten.
- **`docs/sprint-5/01-research.md`**, **`02-plan.md`**, **`03-changelog.md`**.
- **`docs/klant-testplan.md`** , admin-sectie voor het aanmaken en testen van een webhook.

## Stappenvolgorde

1. Migraties (subscriptions, deliveries + emit-functie).
2. Shared helpers (signer, events, emit-wrapper).
3. Integratie in pipeline-trigger en financial-trigger.
4. Dispatcher edge function.
5. UI hook + component + Settings-registratie.
6. Tests draaien (13 tests).
7. Docs schrijven.
8. Changelog en klant-testplan bijwerken.

## Deploy-punten (buiten scope van code, nodig om te werken)

- DB-webhook configureren: `webhook_deliveries` INSERT, bestemming edge function `webhook-dispatcher`.
- Cron-job: elke 60 seconden `webhook-dispatcher` aanroepen met `x-cron-secret` header (picksup missed deliveries en delayed retries).
- `CRON_SECRET` env var moet gezet zijn op Supabase.
