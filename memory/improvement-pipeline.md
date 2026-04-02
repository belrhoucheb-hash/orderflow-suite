# Improvement Pipeline

Alle geidentificeerde verbeteringen met status.

## Status legenda
- **Nieuw** — geidentificeerd, nog niet beoordeeld
- **Beoordeeld** — manager heeft het beoordeeld
- **Goedgekeurd** — CEO heeft goedgekeurd
- **In ontwikkeling** — developer werkt eraan
- **Opgeleverd** — gebouwd en gereviewd
- **Geparkeerd** — bewust uitgesteld
- **Afgewezen** — niet doen

---

## Pipeline

| # | Titel | Type | Prioriteit | Status | Bron | Manager | Datum |
|---|-------|------|-----------|--------|------|---------|-------|
| 1 | Dispatch to Delivery UI bouwen | Feature | P1 | Opgeleverd | Schema analyse | Engineering | 2026-04-02 |
| 2 | AI Corrections feedback loop activeren | Feature | P1 | Opgeleverd | Schema analyse | Engineering | 2026-04-02 |
| 3 | Email parsing accuracy verbeteren | Verbetering | P1 | Opgeleverd | AI pipeline review | AI Systems | 2026-04-02 |
| 4 | Security: debug bypass verwijderd | Bugfix | P0 | Opgeleverd | Productreview | Engineering | 2026-04-02 |
| 5 | Security: tenant isolatie dispatch RLS + send-follow-up | Bugfix | P0 | Opgeleverd | Productreview | Engineering | 2026-04-02 |
| 6 | Status-systeem geunificeerd (DB-statussen als single source) | Refactor | P0 | Opgeleverd | Productreview | Engineering | 2026-04-02 |
| 7 | Security: Gemini API key uit frontend verwijderd | Bugfix | P0 | Opgeleverd | Productreview | Engineering | 2026-04-02 |
| 8 | Security: execute_sql RPC verwijderd | Bugfix | P0 | Opgeleverd | Productreview | Engineering | 2026-04-02 |
| 9 | Security: tenant_id + RLS op ai_corrections | Bugfix | P0 | Opgeleverd | Productreview | Engineering | 2026-04-02 |
| 10 | Inbox refactor (926 -> 344 regels) | Refactor | P1 | Opgeleverd | Code review | Engineering | 2026-04-02 |
| 11 | Server-side paginering Orders | Verbetering | P1 | Opgeleverd | Performance review | Engineering | 2026-04-02 |
| 12 | NewOrder formuliervalidatie | Verbetering | P1 | Opgeleverd | UX review | Product | 2026-04-02 |
| 13 | Auto-approve orders (>=95% + bekende klant) | Feature | P1 | Opgeleverd | Automatisering | Operations | 2026-04-02 |
| 14 | Auto trip-completion + concept-factuur | Feature | P1 | Opgeleverd | Automatisering | Operations | 2026-04-02 |
| 15 | SLA monitor via pg_cron | Feature | P1 | Opgeleverd | Operations review | Operations | 2026-04-02 |
| 16 | Design system (kleuren, typografie, components) | Feature | P1 | Opgeleverd | UX audit | UX Designer | 2026-04-02 |
| 17 | Toast systeem geunificeerd naar sonner | Refactor | P1 | Opgeleverd | UX audit | UX Designer | 2026-04-02 |
| 18 | Status kleuren gecentraliseerd | Refactor | P1 | Opgeleverd | UX audit | UX Designer | 2026-04-02 |
| 19 | PDF factuur generatie | Feature | P1 | Opgeleverd | Facturatie review | Engineering | 2026-04-02 |
| 20 | Offline POD opslag + sync | Feature | P1 | Opgeleverd | Chauffeur app review | Engineering | 2026-04-02 |
| 21 | Geofence aankomstdetectie | Feature | P1 | Opgeleverd | Operations review | Operations | 2026-04-02 |
| 22 | Rijtijdregistratie EU 561/2006 | Feature | P1 | Opgeleverd | Compliance review | Operations | 2026-04-02 |
| 23 | 2-opt route optimalisatie | Feature | P1 | Opgeleverd | Planning review | AI Systems | 2026-04-02 |
| 24 | Client extraction templates | Feature | P1 | Opgeleverd | AI pipeline review | AI Systems | 2026-04-02 |
| 25 | Drawbridge bugs #18-#23 opgelost | Bugfix | P1 | Opgeleverd | QA/Drawbridge | Engineering | 2026-04-02 |
| 26 | PageHeader/LoadingState/EmptyState op 13 pagina's | Verbetering | P1 | Opgeleverd | UX audit | UX Designer | 2026-04-02 |

---

## Open items (P2)

| # | Titel | Type | Prioriteit | Status | Bron | Manager | Datum |
|---|-------|------|-----------|--------|------|---------|-------|
| 27 | E2E tests voor kritieke flows (order aanmaken, dispatch, facturatie) | Test | P2 | Nieuw | QA review | Engineering | 2026-04-02 |
| 28 | Webhook integratie voor externe systemen | Feature | P2 | Nieuw | Integratie review | Engineering | 2026-04-02 |
| 29 | Bulk order import (CSV/Excel) | Feature | P2 | Nieuw | Gebruikersfeedback | Product | 2026-04-02 |
| 30 | Dark mode ondersteuning | Feature | P2 | Nieuw | UX audit | UX Designer | 2026-04-02 |
| 31 | Multi-language ondersteuning (NL/EN/DE/FR) | Feature | P2 | Nieuw | Marktanalyse | Product | 2026-04-02 |
| 32 | Geavanceerde rapportage exports (PDF/Excel) | Feature | P2 | Nieuw | Gebruikersfeedback | Product | 2026-04-02 |
| 33 | Real-time notificaties via WebSocket | Verbetering | P2 | Nieuw | Performance review | Engineering | 2026-04-02 |
| 34 | AI model fine-tuning per tenant | Feature | P2 | Nieuw | AI pipeline review | AI Systems | 2026-04-02 |

---

## Toevoegen

Gebruik dit format:
```
| [#] | [titel] | [type] | [P0-P3] | [status] | [bron worker/analyse] | [verantwoordelijke manager] | [datum] |
```
