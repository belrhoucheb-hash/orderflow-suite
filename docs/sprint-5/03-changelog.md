# Sprint 5, Fase 3, Changelog

**Datum**: 2026-04-23
**Focus**: Eerste stap richting open TMS, outbound webhooks.

## 1. Geleverde functionaliteit

### 1.1 Outbound webhooks

- **Webhook-subscriptions per tenant**, beheerd door tenant-admins onder **Settings > Webhooks**. Per subscription een naam, HTTPS target-URL, set events en omschrijving. Secret wordt eenmaal getoond bij aanmaak en daarna nooit meer.
- **Negen v1-events**: `order.created`, `order.confirmed`, `order.status_changed`, `trip.planned`, `trip.dispatched`, `trip.completed`, `invoice.created`, `invoice.sent`, `invoice.paid`, plus `webhook.test` voor handmatige test vanuit de UI.
- **HMAC-SHA256 signing** via header `X-OrderFlow-Signature` (`v1=` + hex). Signature-input is `{timestamp}.{raw body}` om replay-attacks te voorkomen. Timestamp staat in header `X-OrderFlow-Timestamp`. Delivery-id in `X-OrderFlow-Delivery-Id` voor idempotentie aan subscriber-kant.
- **Outbox-pattern**: elk event wordt als rij in `webhook_deliveries` gezet, een dispatcher-edge-function pikt PENDING op en doet de POST. Retry met exponential backoff (1m, 5m, 30m, 2u, 12u), na 6 pogingen DEAD.
- **Dispatcher** accepteert twee triggers: DB-webhook bij insert op `webhook_deliveries` (lage latency) en cron elke minuut (voor delayed retries). Parallel verwerking per batch, 10s timeout per delivery.
- **Delivery-log per subscription** onder een sheet-drawer. Laatste 50 deliveries met status, attempt-count, next-attempt, expand naar payload en alle pogingen met response-code + response-body (eerste 2KB) + duur.
- **Replay-knop** per delivery zet hem terug op PENDING met `next_attempt_at=now`. Werkt op DELIVERED, FAILED en DEAD.
- **Consecutive-failures counter** per subscription, zichtbaar als rode badge op de subscription-rij. Reset bij eerste geslaagde delivery.

### 1.2 Bestaande triggers uitgebreid

- **`pipeline-trigger`** emit nu vóór de autonomy-gate een specifiek event én een generiek `<entity>.status_changed` (v1 alleen voor order). Externe subscribers ontvangen events ongeacht of interne autonomie actief is.
- **`financial-trigger`** emit `trip.completed` direct bij entry en `invoice.created` per klant-factuur die uit de auto-invoice-flow rolt. Emit is fire-and-forget: een falende subscriber blokkeert nooit de facturering.

### 1.3 Database

- `webhook_subscriptions` met URL-https check, min-secret-lengte 32, events-niet-leeg check, tenant-admin RLS (owner/admin uit `tenant_members`).
- `webhook_deliveries` (outbox) en `webhook_delivery_attempts` (append-only log). Partial index op `(next_attempt_at) WHERE status='PENDING'` voor snelle dispatcher-picks. Admin mag deliveries SELECT en UPDATE (voor replay); attempts alleen SELECT. Subscriptions GRANT SELECT/INSERT/UPDATE/DELETE aan authenticated, CASCADE op subscription-delete verwijdert ook de log.
- `public.emit_webhook_event(tenant_id, event_type, payload)` SECURITY DEFINER, EXECUTE alleen voor service_role. Returnt aantal geschreven delivery-rijen. Enige manier om nieuwe deliveries te maken.

### 1.4 Documentatie

- **`docs/api/webhooks.md`** , publieke API-doc met events-tabel, payload-shape, headers, Node- en PHP-voorbeelden voor signature-verificatie, retry-schema en idempotentie-advies.
- **`docs/sprint-5/01-research.md`** , audit van hoe open OrderFlow nu al is en waarom webhooks de eerste stap richting open zijn.
- **`docs/sprint-5/02-plan.md`** , stappenplan met bestand-per-bestand scope.
- **`docs/klant-testplan.md`** , admin-scenario voor het aanmaken en testen van een webhook-subscription.

### 1.5 Tests

- **`src/__tests__/webhookSigner.test.ts`** , 13 tests: HMAC-determinisme, verschillende secrets/bodies/timestamps leveren verschillende signatures, header-bouwer levert alle velden, secret-generator is uniek en base64url, complete status-to-event mapping voor order/trip/invoice, contract-test dat `KNOWN_EVENT_TYPES` alle v1-events bevat.

## 2. Wat er nog moet gebeuren bij deploy

- DB-webhook configureren op Supabase: bij INSERT op `webhook_deliveries` de `webhook-dispatcher` edge function aanroepen.
- Cron job instellen die elke 60 seconden `webhook-dispatcher` hit met `x-cron-secret` header.
- `CRON_SECRET` env var moet gezet zijn op de Supabase-project.

## 3. Buiten scope

- Klantportaal-subscriptions (klant abonneert zich op eigen events).
- Publieke REST API met tokens.
- Circuit-breaker: automatisch subscription pauzeren bij N opeenvolgende DEAD-events (v1 toont alleen de teller).
- Wildcard event-patterns (`order.*`).
- Backfill van historische events naar nieuwe subscriptions.

## 4. Volgende stappen (voorstel)

- Na de eerste echte klant-integratie de limieten en schema evalueren: zijn er events die ontbreken, is de payload-shape voldoende?
- Publieke REST API bouwen als tweede stap richting "open TMS", zodra we weten welke resources klanten echt willen ophalen.
