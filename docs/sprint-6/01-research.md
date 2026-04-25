# Sprint 6, Fase 1, Research

**Datum**: 2026-04-23
**Focus**: Publieke REST API v1 als tweede stap richting open TMS (na outbound webhooks in sprint 5).

## Aanleiding

Sprint 5 leverde push (outbound webhooks): OrderFlow stuurt events naar een URL naar keuze. Wat nog ontbrak is **pull**: een extern systeem dat data bij OrderFlow komt halen, of zelf orders aanmaakt.

## Gekozen scope

- **Read + POST /orders** , meest waardevolle use-case: externe systemen (klantportalen, ERP, boekingspagina's) maken orders aan, OrderFlow doet de rest (parsing, planning, facturering, push terug via webhook).
- **Tenant-tokens én klant-tokens** , backoffice-integraties vs klant-self-service.
- **Simpele rate-limit** , 300 req/min per token via postgres count-in-window.

Full CRUD is buiten scope: status-mutaties van buitenaf introduceren race-conditions met interne flows (pipeline-trigger, autonomy). Eerst zien hoe klanten read + create gebruiken, dan beslissen.

## Architectuur-keuzes

**Gateway boven Postgrest, niet Postgrest direct.**
Supabase's auto-REST over tabellen is al bruikbaar, maar:
- Exposeert interne kolommen (tenant_id, interne IDs).
- Geen stabiele response-shape (breekt bij elke kolom-rename).
- Geen API-tokens; vereist JWT's of anon-key met RLS.
- Geen rate-limiting per klant-integratie.

Een eigen edge function als gateway lost dit op met één indirectielaag. Kosten: we moeten elke resource expliciet shapen. Baten: stabiel contract, duidelijke scope, één plek voor rate-limit en logging.

**Service-role onder de motorkap, scoping in code.**
Gateway gebruikt `SUPABASE_SERVICE_ROLE_KEY` om RLS te omzeilen, doet dan *in code* de filters `tenant_id = token.tenant_id AND (token.client_id IS NULL OR client_id = token.client_id)`. Risico: code-bug lekt data. Mitigatie: shapers strippen `tenant_id`, explicit `.eq("client_id", ...)` in elke query bij klant-tokens, test-coverage op shape.

**Token opslag: SHA-256 hash + 8-char prefix.**
Plaintext verlaat de server alleen bij aanmaak. Prefix in clear voor UI-herkenning. Unieke index op `token_hash` voor O(log n) lookup per request. Geen pepper in v1 (keuze: simpel vs extra bescherming bij DB-dump; acceptabel omdat tokens kort-levend kunnen zijn via expires_at).

**Rate-limit als SELECT count.**
Niet atomic, kleine overshoot mogelijk. Acceptabel voor v1. Stap naar postgres advisory-lock of Redis in v2 als dat nodig blijkt.

## Risico's

| Risico                                  | Mitigatie                                                   |
| --------------------------------------- | ----------------------------------------------------------- |
| Token-leak in logs                      | Alleen `token_id` + `token_prefix` loggen, nooit plaintext  |
| Per-klant data-leak door query-fout     | Shaper strip-t tenant_id, test-coverage, explicit .eq's     |
| Rate-limit overshoot onder concurrency  | Acceptabel in v1, documenteren, naar atomic in v2 als nodig |
| Dubbele POST /orders                    | Documenteren, advies `reference`-veld, Idempotency-Key in v2 |
| POST omzeilt interne validatie          | Gateway bouwt orderData met whitelist van velden            |
| Status-mutaties via gateway             | Niet toegestaan in v1, alleen INSERT, geen UPDATE           |
| Breaking changes                        | URL bevat `v1`, schema-wijziging → nieuwe `/api-v2`         |

## Alternatieven die we verworpen hebben

- **Supabase Postgrest direct openstellen**: te veel internals lekken, geen stabiel contract.
- **GraphQL**: overkill voor deze use-case, extra client-side complexity, minder bekend bij doelgroep.
- **OAuth2**: complex voor een eenvoudige B2B-API. Bearer-tokens zijn genoeg.
- **Atomic rate-limit met advisory-lock**: v1 doet count-in-window, genoeg tot eerste schaal-probleem.

## Volgende stappen

- Eerste klant-integratie bouwen en monitoren.
- Evalueer of read-only voor trips/invoices volstaat, of dat update-endpoints gewenst zijn.
- Overweeg `POST /webhook-subscriptions` om zelfservice volledig te maken (nu nog alleen UI).
