# Teststraat OrderFlow Suite

Dit is het overzicht van alle automatische tests die op deze codebase draaien, waar ze leven, wanneer ze draaien en hoe je een rode pipeline leest.

## Lagen

| Laag | Tool | Locatie | Wanneer |
|---|---|---|---|
| Unit + component | Vitest + Testing Library | `src/__tests__/` | Elke push en PR (`ci.yml` job `test`) |
| Security (statisch + contract) | Vitest | `src/__tests__/security/` | Elke push en PR (`ci.yml` job `security`) |
| Secret-leak scan | Node-script | `scripts/check-secret-leaks.mjs` | Elke push en PR (`ci.yml` job `security`) |
| Dependency audit | `npm audit` | n.v.t. | Elke push en PR (niet-blokkerend) |
| End-to-end | Playwright | `e2e/` | Handmatig via Actions-tab (`e2e.yml`) |
| Algoritmische bench | Vitest bench | `src/__bench__/` | Nightly (`nightly.yml` job `bench`) |
| Lighthouse (LCP/TBT/CLS) | Lighthouse CI | `lighthouserc.json` | Nightly (`nightly.yml` job `lighthouse`) |
| Load-test API v1 | k6 | `tests/load/` | Handmatig + nightly als secrets gezet zijn |
| OWASP ZAP baseline | nog niet ingericht | fase 3 | nog niet |

## Lokaal draaien

```bash
npm run test                # alle vitest unit + component
npm run test:security       # alleen security-suite
npm run test:bench          # vitest benchmarks (algoritmische regressies)
npm run test:perf           # Lighthouse CI tegen production-build (vereist lhci globaal)
npm run test:load           # k6 load-test (vereist API_BASE_URL en API_TOKEN)
npm run test:e2e            # Playwright tegen localhost:8080
npm run check:secret-leaks  # secret-scan op edge functions
npm audit --audit-level=high --omit=dev
```

## Security-suite, wat dekt wat

`src/__tests__/security/` bevat drie soorten tests:

### 1. `webhookHmacContract.test.ts`
Bevriest het signatuur-formaat van outbound webhooks (`X-OrderFlow-Signature: v1=<hex>`). Bevat een vaste test-vector. Als deze test breekt, breekt elke externe abonnee. Pas alleen aan bij een bewuste versie-bump (v2 etc).

### 2. `bearerTokenFormat.test.ts`
Bevriest het API-token formaat (`ofs_` + 40 base64url chars), de hash-stabiliteit (SHA-256, deterministisch) en de bearer-extractie uit de `Authorization`-header. Dekt o.a. case-insensitive scheme, rejecting `Basic` en `Token`, lege waarden.

### 3. `apiV1TenantScoping.test.ts`
Statische analyse van `supabase/functions/api-v1/index.ts`. De gateway gebruikt service-role en omzeilt RLS, dus elke handler MOET expliciet op `token.tenant_id` filteren. Deze test parsed de source en faalt zodra een handler die check mist. Vangt 95% van de cross-tenant lekkage-regressies, goedkoop.

## CI-jobs

In `.github/workflows/ci.yml`:

- `test` — `tsc --noEmit` + volledige Vitest-suite (incl. coverage-thresholds 85/75/65/85)
- `security` — secret-leak scan + `test:security` + `npm audit` (laatste is `continue-on-error: true` totdat de baseline schoon is)

In `.github/workflows/e2e.yml`:

- `e2e` — handmatig via `workflow_dispatch`. Vereist secrets `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`, `VITE_SUPABASE_*`.

## Een rode CI lezen

1. **`test` rood** — bekijk de Vitest-output, fix het symptoom of de testverwachting.
2. **`security/secret-leaks` rood** — er staat een `console.log(password)` in een edge function. Verwijder de credential uit de log.
3. **`security/test:security` rood**:
   - HMAC-contract gefaald: er is iets aan de signatuur-formule veranderd. Dit is breaking voor klanten. Stop en heroverweeg.
   - Token-format gefaald: het publieke token-contract is gewijzigd. Idem breaking, behandel als versie-bump.
   - Tenant-scoping gefaald: een handler in `api-v1/index.ts` mist een `eq("tenant_id", ...)`-filter. Cross-tenant lekkage risico, fix direct.
4. **`security/npm audit` geel** — bekijk het rapport, prioriteer high/critical CVE's, plan een dependency-bump.

### Bekende audit-baseline (april 2026)

`xlsx` toont 5 high severity advisories zonder upstream fix (Prototype Pollution + ReDoS). Vervangen door `exceljs` of `xlsx-populate` is voorzien voor sprint-7. Zolang die migratie niet gedaan is, blijft `npm audit` in CI op `continue-on-error: true`. Zodra de baseline schoon is: zet die flag op `false` zodat nieuwe high-CVE's wél blokkeren.

## Performance-laag

### Vitest bench (`src/__bench__/`)
Microbenchmarks voor pure algoritmes. Detecteert algoritmische regressies (een PR die `optimizeRoute` van O(n²) naar O(n³) duwt valt direct op in de nightly diff). Baseline op een ontwikkelmachine na de matrix-refactor:

| Scenario | Doorzet (ops/s) | Latency p75 |
|---|---|---|
| `optimizeRoute` 10 stops | ~103.000 | 0.01 ms |
| `optimizeRoute` 50 stops | ~5.100 | 0.2 ms |
| `optimizeRoute` 150 stops | ~304 | 3.5 ms |
| `optimizeRoute` 300 stops | ~62 | 18 ms |
| `optimizeRoute` 500 stops | ~30 | 36 ms |
| `twoOptImprove` 150 stops | ~833 | 1.2 ms |
| `twoOptImprove` 300 stops | ~146 | 8 ms |
| `computeRouteStats` 50 stops | ~178.000 | < 0.01 ms |

Eerdere baseline (vóór matrix-refactor): 150 stops kostte ~900ms door full-route hermeten in elke 2-opt swap. De huidige implementatie gebruikt een symmetrische distance-matrix (Float64Array) en O(1) delta-evaluatie per swap, schaalt nu lineair tot 500+ stops zonder UI-jank.

### Lighthouse CI (`lighthouserc.json`)
Draait in nightly tegen `npm run preview`. Budgetten:
- Performance >= 0.85 (warn)
- Accessibility >= 0.9 (warn)
- LCP < 2500ms, TBT < 300ms, CLS < 0.1

### k6 (`tests/load/api-v1-orders.js`)
Load-scenario tegen REST API v1. Drempels: p95 lijst < 600ms, p95 detail < 400ms, error-rate < 1%. Vereist twee secrets in GitHub: `API_BASE_URL` en `API_TOKEN_STAGING` (read-only token tegen een staging-tenant).

## Wat er nog niet in zit (roadmap)

- **Fase 3** — OWASP ZAP baseline tegen preview build, integratietests tegen lokale Supabase-branch met echte RLS-checks (negatieve cases per tenant), webhook-replay protection test.
