# Sprint 6, Fase 3, Changelog

**Datum**: 2026-04-23
**Focus**: Publieke REST API v1, tweede stap richting open TMS.

## 1. Geleverde functionaliteit

### 1.1 REST API v1

- **Bearer-token auth**: tokens beginnen met `ofs_`, SHA-256 gehashed opgeslagen, plaintext eenmaal getoond bij aanmaak, 8-char prefix in clear voor UI-herkenning.
- **Tenant-tokens én klant-tokens** via één tabel: `client_id` NULL voor tenant-scope, UUID voor klant-scope. Klant-tokens zien alleen eigen orders/invoices/clients.
- **Scopes** per token: `orders:read`, `orders:write`, `trips:read`, `invoices:read`, `clients:read`. Gateway weigert requests zonder de juiste scope met 403.
- **Endpoints**: `GET /orders(:id)`, `POST /orders`, `GET /trips(:id)`, `GET /invoices(:id)`, `GET /clients(:id)`. Pagination via `?limit=&offset=`, max 200.
- **POST /orders** hergebruikt de whitelist van `create-order`, forceert `client_id` bij klant-tokens, default status DRAFT.
- **Rate-limit**: 300 requests per minuut per token (sliding window via postgres count). 429-response met `X-RateLimit-{Limit,Remaining,Reset}` headers.
- **Stabiele response-shape**: shapers strippen `tenant_id` en interne velden, zodat de interne schema kan refactoren zonder de publieke contract te breken.
- **Uniforme error-shape**: `{error: {code, message, details?}}` voor alle fouten.
- **Request-log**: elke call wordt gelogd in `api_request_log` (token_id, method, path, status, duration). Gebruikt voor rate-limiting en audit. Retentie 7 dagen via `prune_api_request_log()` functie (cron).

### 1.2 UI

- **Settings > API-tokens** (tenant-admin): lijst actief + ingetrokken, nieuwe token aanmaken met scope-checkboxes en expires (nooit/30d/90d/1y), plaintext eenmaal tonen na aanmaak, revoke-knop.
- **Klantportaal > Instellingen > API-tokens** (klant-admin): zelfde component, gescopet op `portalUser.client_id`. Trips-scope verborgen omdat die alleen voor tenant-tokens werkt in v1.

### 1.3 Database

- `api_tokens` met tenant-admin én client_portal_users RLS voor CRUD, service_role full. Unieke index op `token_hash` voor snelle verify.
- `api_request_log` met index op `(token_id, created_at DESC)` voor rate-limit-query en `(tenant_id, created_at DESC)` voor audit. Prune-functie retentie 7 dagen.

### 1.4 Documentatie

- **`docs/api/rest.md`** , publieke doc met curl-voorbeelden, scope-tabel, error-codes, rate-limit-advies, klant-vs-tenant matrix, idempotentie-advies.
- **`docs/api/openapi.yaml`** , OpenAPI 3.0.3 spec, importeerbaar in Postman/Insomnia/codegen.
- **`docs/sprint-6/01-research.md`**, **`02-plan.md`** en dit document.
- **`docs/klant-testplan.md`** , admin- en klant-scenario bijgewerkt.

### 1.5 Tests

- **`src/__tests__/apiTokens.test.ts`** , 15 tests. SHA-256 vector-test, token-generator formaat, prefix-extractie, bearer-parse varianten, scope-check, shapers strippen tenant_id, shapers defaults.

## 2. Wat er nog moet gebeuren bij deploy

- Edge function `api-v1` deployen via `supabase functions deploy api-v1`.
- Env vars `SUPABASE_URL` en `SUPABASE_SERVICE_ROLE_KEY` moeten al gezet zijn (standaard Supabase).
- Optioneel cron op `public.prune_api_request_log()` zodat de tabel niet oneindig groeit.
- Optioneel custom domain voor de openbare URL.

## 3. Buiten scope

- Full CRUD (PUT/PATCH/DELETE) op orders, trips, invoices. Alleen GET + POST /orders in v1.
- `Idempotency-Key`-header. Klant moet zelf deduperen op `reference`-veld.
- Cursor-pagination. Offset/limit is genoeg voor v1.
- Webhook-subscription-beheer via API (blijft in Settings-UI).
- Bulk-endpoints.
- OAuth2 / scoped tokens zoals Stripe.
- Trips-endpoint voor klant-tokens (vereist join via trip_orders, v2).

## 4. Wat het commercieel oplevert

- **Concreet "open TMS"-verhaal**: naast push (sprint 5) nu ook pull. Klanten kunnen OrderFlow koppelen aan eigen ERP, BI-tool of portaal.
- **Klant-self-service**: klanten kunnen hun eigen orders programmatisch aanmaken zonder tussenkomst van de backoffice. Dit is een directe omzet-enabler: een webshop kan orders rechtstreeks in OrderFlow dumpen.
- **Betere lock-in-alternatief**: concurrenten die data opsluiten vallen af. Klanten die bang zijn voor "vendor lock-in" hebben nu een tegenargument.
