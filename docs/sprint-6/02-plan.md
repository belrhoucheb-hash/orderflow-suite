# Sprint 6, Fase 2, Plan

**Datum**: 2026-04-23
**Scope**: Publieke REST API v1 met bearer-tokens, read + POST /orders, rate-limit, klant-scope.

## 1. Datalaag

- **`20260425000000_api_tokens.sql`** , tabel `api_tokens` (id, tenant_id, client_id nullable, name, token_hash, token_prefix, scopes[], expires_at, revoked_at), CHECK-constraints, admin-RLS én klant-portal-RLS, unieke index op `token_hash`.
- **`20260425010000_api_request_log.sql`** , log per request (token_id, method, path, status, duration), indices op `(token_id, created_at DESC)` voor rate-limit-query, RLS idem. Prune-functie `public.prune_api_request_log()` voor 7-dagen retentie.

## 2. Shared API-helpers

- **`_shared/api/tokens.ts`** , `hashToken`, `generateTokenPlaintext`, `extractBearer`, `verifyToken`, `touchTokenLastUsed`, `hasScope`.
- **`_shared/api/rate-limit.ts`** , `checkRateLimit` via count-in-window, default 300/min.
- **`_shared/api/response.ts`** , `jsonResponse`, `errorResponse`, standaard error-helpers, rate-limit-headers.
- **`_shared/api/shapers.ts`** , `shapeOrder`, `shapeTrip`, `shapeInvoice`, `shapeClient`. Strippen `tenant_id` en alle interne velden.

## 3. Gateway

- **`supabase/functions/api-v1/index.ts`** , path-routing, auth, scope-check, rate-limit, query met service-role + scope-filters, shape, respond, async log.
- Endpoints: GET /orders, /orders/:id, POST /orders, GET /trips(:id), GET /invoices(:id), GET /clients(:id).
- Klant-tokens: trips geven 403 in v1; clients zien alleen zichzelf; orders en invoices worden altijd `eq(client_id)` gefilterd.
- POST /orders: whitelist van velden, status default DRAFT, forceer client_id bij klant-tokens.

## 4. OpenAPI-spec

- **`docs/api/openapi.yaml`** , 3.0.3, alle endpoints, request/response-schemas, security-scheme, rate-limit-headers. Importeerbaar in Postman, Insomnia, codegeneratoren.

## 5. UI

- **`src/hooks/useApiTokens.ts`** , list/create/revoke, plaintext-generatie en SHA-256 hashing aan clientkant.
- **`src/components/settings/ApiTokenSettings.tsx`** , herbruikbare component met scope-selectie, expires (nooit/30d/90d/1y), lijst actief + ingetrokken, reveal-dialog eenmalig, revoke-flow.
- **`src/pages/Settings.tsx`** , nieuwe tab "API-tokens" onder Communicatie-groep, tenant-scope (`clientId={null}`).
- **`src/pages/portal/PortalSettings.tsx`** , zelfde component gescopet op `portalUser.client_id`, alleen admin-role, met `hideTenantOnlyScopes` om trips-scope te verbergen.

## 6. Tests

- **`src/__tests__/apiTokens.test.ts`** , 15 tests: hashToken-vectors, generateToken-formaat, tokenPrefix, extractBearer-paden, hasScope, shapers-strippen-tenant_id, shapers-defaults.

## 7. Docs

- **`docs/api/rest.md`** , publieke doc met curl-voorbeelden, scope-tabel, error-codes, rate-limit-headers, klant-vs-tenant-matrix.
- **`docs/api/openapi.yaml`** , machine-leesbaar.
- **`docs/sprint-6/01-research.md`**, **`02-plan.md`**, **`03-changelog.md`**.
- **`docs/klant-testplan.md`** , admin- én klant-scenario voor token aanmaken en curl-call.

## Stappenvolgorde

1. Migraties.
2. Shared helpers.
3. Gateway met routing en endpoints.
4. OpenAPI-spec.
5. UI-hook + component + Settings + PortalSettings.
6. Tests draaien.
7. Docs en changelog.

## Deploy-punten buiten code

- Edge function `api-v1` deployen.
- Cron op `prune_api_request_log()` dagelijks (optioneel, tabel blijft anders groeien).
- Eventueel custom domain (bijv. `api.orderflow.nl`) voor de openbare URL.
