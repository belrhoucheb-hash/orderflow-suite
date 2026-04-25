# Sprint 5, Fase 1, Research

**Datum**: 2026-04-23
**Focus**: Eerste stap richting een open TMS. Beslissing: outbound webhooks, niet publieke API of extra export-laag.

## Aanleiding

De vraag "zijn wij al een open TMS?" leidde tot een audit. Conclusie:

- **Inbound is open**: orders komen binnen via e-mail-parsing, WhatsApp, KvK- en Google-lookups.
- **Klantportaal bestaat**: eigen orders, tracking, facturen, rapportage, documenten.
- **Export is grotendeels aanwezig**: CSV/Excel/PDF voor orders, ritten, facturen, klanten, rapportage. UBL-XML voor facturen. Klanten kunnen hun eigen rapportage uit de portal trekken.
- **Wat mist**: programmatische data-push naar externen, outbound webhooks, publieke REST API met tokens.

De grootste gat richting "open" is outbound: een partner/klant die zijn eigen systeem (ERP, BI, eigen dashboard) wil voeden uit OrderFlow moet nu polleren of handmatig exporteren. Een push-model via webhooks lost dat in één keer op.

## Scope v1 (bewust klein)

- **Wie beheert**: alleen tenant-admin via Settings.
- **Events**: status-wijzigingen op orders, ritten en facturen. Geen driver-, document- of master-data-events.
- **Transport**: outbox-pattern met retry/backoff. Geen fire-and-forget.
- **Auth subscriber-kant**: HMAC-SHA256 signing met per-subscription secret. Geen OAuth in v1.
- **UI**: CRUD op subscriptions, delivery-log per subscription, replay-knop.

## Buiten scope v1

- Klantportaal-subscriptions (klanten abonneren op hun eigen events).
- Volledige tenant-data-dump (GDPR-portability) als self-service.
- Publieke REST API met tokens.
- Circuit-breaker: automatisch subscription pauzeren na N DEAD-deliveries.
- Wildcard event-patronen (`order.*`).
- Backfill van historische events naar nieuwe subscriptions.

## Bestaande fundamenten die we hergebruiken

- **Triggers**: `pipeline-trigger` (orders, trips, invoices status-changes), `financial-trigger` (trip COMPLETED, invoice-create). Beide zijn al service-role-only webhooks. We hangen de emit-call hieraan vast.
- **Auth**: `isTrustedCaller` in `_shared/auth.ts` accepteert service-role JWT en CRON_SECRET, past voor de dispatcher.
- **RLS-patroon**: tenant-scoped via `public.current_tenant_id()` plus `tenant_members`-lookup voor admin-only tabellen.
- **Audit-precedent**: `rate_card_audit_log` laat zien hoe we append-only logs met triggers bouwen. Webhook-deliveries volgen hetzelfde RLS-principe (admin leest, service_role schrijft).
- **HMAC-precedent**: `whatsapp-webhook` doet inbound Twilio SHA-1. Outbound pakt SHA-256.

## Risico's en mitigaties

| Risico                                       | Mitigatie                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| Subscriber hangt / 10s timeout blokkeert rij | Per-delivery timeout van 10s, parallel fetch in batch                    |
| Dubbele delivery bij subscriber-timeout      | `X-OrderFlow-Delivery-Id` voor idempotentie, gedocumenteerd              |
| Secret leakt via response-body-log           | Response getrunceerd op 2KB, headers niet gelogd                         |
| Falende emit blokkeert statuschange          | Emit is fire-and-forget in edge function, errors gelogd maar niet re-thrown |
| Replay-attacks                               | Timestamp in signature-input, subscriber-advies om ±5min te accepteren   |
| Slow consumer stapelt deliveries op          | Geen queue-limit in v1. Max 6 retry-pogingen dan DEAD. Niet geschikt voor hoge-volume trader die 1000en/s doet |

## Alternatieven die we verworpen hebben

- **Fire-and-forget vanuit triggers zonder outbox**: simpel, maar verliest deliveries bij tijdelijke subscriber-outage. Retry zou dan per trigger opnieuw uitgevonden moeten worden.
- **Externe queue (Redis/RabbitMQ)**: overkill voor MVP. Supabase + Postgres als queue is voldoende voor verwachte volumes.
- **Polling-API in plaats van push**: lost het probleem niet op, laat de klant het werk doen.
