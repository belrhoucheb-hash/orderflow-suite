# Security Audit, OrderFlow Suite

**Oorspronkelijke audit:** 2026-04-06
**Hercheck:** 2026-04-23
**Fixes uitgerold:** 2026-04-23
**Status:** ALLE CRITICAL ITEMS GEADRESSEERD, wacht op deploy

## Original CRITICAL Issues, status

| # | Issue | Status | Fix |
|---|---|---|---|
| 1 | RLS policies met `USING (true)` | GEFIXT | Twee nieuwe migraties, zie onder |
| 2 | Chauffeur PIN default "0000" en client-side lockout | GEFIXT | PBKDF2 hash, server-side lockout, geen default-PIN |
| 3 | CORS wildcard op edge functions | GEFIXT | Centrale `_shared/cors.ts`, 18 functions gemigreerd, 0 wildcards |
| 4 | Edge functions zonder JWT validatie | GEFIXT | Centrale `_shared/auth.ts`, 10 onbeschermde functions beveiligd |
| 5 | chauffeur_mode via localStorage role-bypass | GEFIXT | Vereist ook `drivers.user_id`-link in DB |
| 6 | `.env` credentials in git history | GEFIXT | .env verwijderd in `6c13e5d`, exposed key was anon, geen rotatie nodig |

## Fixes Applied

### [x] Item 1, RLS hardening

Twee nieuwe migraties, wijzigen geen bestaande migraties.

**[supabase/migrations/20260423210000_rls_tenant_scope_authenticated.sql](supabase/migrations/20260423210000_rls_tenant_scope_authenticated.sql)**, authenticated-policies tenant-gescoped:

| Tabel | Operaties | Nieuwe USING |
|---|---|---|
| `ai_decisions`, `anomalies`, `confidence_metrics`, `disruptions`, `order_events`, `replan_suggestions` | SELECT + UPDATE | `tenant_id = current_tenant_id()` |
| `vehicle_positions` | SELECT | `tenant_id = current_tenant_id()` |
| `vehicle_check_retention_log` | SELECT | restrictie tot owner/admin via `tenant_members` (geen tenant_id op tabel) |
| `user_roles` | SELECT | `user_id = auth.uid()` (legacy app_role-tabel, geen tenant_id) |

**[supabase/migrations/20260423220000_rls_service_role_explicit.sql](supabase/migrations/20260423220000_rls_service_role_explicit.sql)**, 46 service_role-policies expliciet gemaakt met `USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role')`. Tabellen: `tenants`, `activity_log`, `ai_usage_log`, `clients`, `cost_types`, `drivers`, `invoices`, `orders`, `notifications`, `vehicles`, `client_contacts`, `driver_availability`, `order_charges`, plus 33 andere.

**Deploy-actie nodig:** `supabase db push` na merge.

### [x] Item 2, PIN security

- PBKDF2-SHA256, 100k iteraties, per-driver salt, client-side hashing.
  - [src/components/chauffeur/ChauffeurApp.tsx:32-48](src/components/chauffeur/ChauffeurApp.tsx#L32-L48)
- Server-side lockout: `failed_pin_attempts`, `pin_locked_until` (3 fout = 5 min, 6 = 30 min, 10+ = permanent).
  - [supabase/migrations/20260419000000_baseline.sql:1324-1327](supabase/migrations/20260419000000_baseline.sql#L1324-L1327)
- Geen default-PIN, nieuwe drivers hebben `pin_hash IS NULL` + `must_change_pin = true`.

### [x] Item 3, CORS

Nieuwe [supabase/functions/_shared/cors.ts](supabase/functions/_shared/cors.ts) helper:
- `corsFor(req, options?)` en `handleOptions(req, options?)`.
- Whitelist via `ALLOWED_ORIGINS` env var (CSV), default `orderflow-suite.vercel.app`, `localhost:5173`, `localhost:8080`.
- Backward-compat leest ook oude `ALLOWED_ORIGIN` singular.
- Nooit `*`, altijd `Vary: Origin`.

18 edge functions gemigreerd, 0 wildcards over. Grep-verificatie: `grep -rn 'Access-Control-Allow-Origin.*\*' supabase/functions/` levert alleen een comment in de helper zelf op.

### [x] Item 4, JWT-validatie

Nieuwe [supabase/functions/_shared/auth.ts](supabase/functions/_shared/auth.ts) met drie auth-routes:
- `getUserAuth`, user-JWT + tenant-match via app_metadata (403 bij mismatch).
- `isServiceRoleToken`, voor pg_cron en DB-webhooks.
- `isCronSecret`, voor externe cron-callers via `CRON_SECRET` env var in `x-cron-secret` header.
- `isTrustedCaller`, service-role OF cron-secret.

Keuze per function:

| Function | Route |
|---|---|
| `calculate-order-price`, `dispatch-scheduler`, `financial-trigger`, `notify-expiring-certificates`, `pipeline-trigger`, `planning-trigger` | trusted-caller only |
| `preview-order-price`, `extract-certificate` | user-JWT + tenant-match |
| `check-info-requests`, `prune-vehicle-check-photos` | user-JWT OF trusted-caller |

Publiek-by-design (eigen auth, niet aangeraakt): `create-order` (x-api-key), `whatsapp-webhook` (Twilio HMAC), `google-places`, `google-places-business`, `kvk-lookup`.

**Deploy-actie nodig:** `CRON_SECRET` env var zetten in Supabase project settings. Huidige pg_cron setup blijft werken zonder, omdat die via service-role JWT calt.

### [x] Item 5, chauffeur_mode

Hybride check: `chauffeur`-rol alleen als (a) `drivers.user_id`-koppeling bestaat EN (b) `localStorage.chauffeur_mode === "true"`.
- [src/contexts/AuthContext.tsx:104-115](src/contexts/AuthContext.tsx#L104-L115)
- Test [src/__tests__/AuthContext.test.tsx:182-198](src/__tests__/AuthContext.test.tsx#L182-L198) dekt de localStorage-only-bypass.

### [x] Item 6, secrets in git history

- `.gitignore` regel 28-31 dekt `.env`, `.env.local`, `.env.production`, `.env.*.local`.
- `.env` verwijderd in commit `6c13e5d`.
- Gelekte key was `VITE_SUPABASE_PUBLISHABLE_KEY` (anon, publiek-by-design), geen rotatie nodig.
- `npm run check:secret-leaks` passeert.

## Gewijzigde en nieuwe bestanden

**Nieuw:**
- [supabase/functions/_shared/auth.ts](supabase/functions/_shared/auth.ts)
- [supabase/functions/_shared/cors.ts](supabase/functions/_shared/cors.ts)
- [supabase/migrations/20260423210000_rls_tenant_scope_authenticated.sql](supabase/migrations/20260423210000_rls_tenant_scope_authenticated.sql)
- [supabase/migrations/20260423220000_rls_service_role_explicit.sql](supabase/migrations/20260423220000_rls_service_role_explicit.sql)

**Gewijzigd (25 edge functions):**
`analyze-vehicle-photo`, `auto-plan-day`, `calculate-order-price`, `check-info-requests`, `create-order`, `dispatch-scheduler`, `extract-certificate`, `financial-trigger`, `google-places`, `google-places-business`, `import-email`, `kvk-lookup`, `notify-expiring-certificates`, `parse-order`, `pipeline-trigger`, `planning-trigger`, `poll-inbox`, `preview-order-price`, `prune-vehicle-check-photos`, `send-approval`, `send-confirmation`, `send-follow-up`, `send-notification`, `test-inbox-connection`.

## Vóór deploy

1. Merge naar main.
2. `supabase db push` voor de twee nieuwe migraties.
3. Zet `CRON_SECRET` en controleer `ALLOWED_ORIGINS` in Supabase project settings.
4. Smoke-test: minstens één function per auth-route, en één tabel per nieuwe RLS-policy.

## Nog aandacht (lager risico, hygiene)

- `dev_rls_bypass.sql` en `combined_setup.sql` in repo-root horen daar niet, verplaatsen naar `scripts/` of verwijderen.
- Rate-limit-functie (`increment_rate_limit()` in archived migration) wordt niet gebruikt voor PIN of edge-functions, overweeg toepassing.
- 36k pre-existing lint-warnings (meeste `no-explicit-any`), buiten scope van deze audit.
