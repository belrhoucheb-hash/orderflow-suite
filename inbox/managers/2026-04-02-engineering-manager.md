# Engineering Manager Update — 2026-04-02

## Ontvangen van
- QA Reviewer: 7 bevindingen (risico: middel)
- Monitoring Analyst: 12 signalen (status: aandacht — 2 kritiek, 4 waarschuwing, 6 info)

## Technische risicobeoordeling

### KRITIEK — Direct fixen

1. **Multi-tenant isolatie create-order edge function** — impact: orders via externe API krijgen geen tenant_id, doorbreekt data-isolatie volledig — actie: App Developer, vandaag fixen. `tenant_id` toevoegen aan allowedFields in `supabase/functions/create-order/index.ts` of afleiden uit API key config.

2. **Driver PIN plaintext opslag** — impact: security breach bij database-compromittering, alle PINs direct leesbaar — actie: App Developer, vandaag fixen. Implementeer pgcrypto `crypt()` hashing in `supabase/migrations/20260402_driver_pin.sql`, verwijder plaintext default.

3. **ClientPortal order insert zonder server-side validatie** (QA #5) — impact: kwaadwillende gebruiker kan orders aanmaken voor andere klanten, RLS-omzeiling — actie: App Developer, verplaats order-creatie naar Edge Function of database function met auth.uid() validatie.

4. **Bulk import client insert zonder tenant_id** (QA #1) — impact: orphan clients buiten tenant-scope, RLS-violations — actie: App Developer, voeg `tenant_id` toe aan client insert in `BulkImportDialog.tsx:238`, verwijder `as any` cast.

### HOOG — Deze sprint

1. **Planning query mist time_window velden** (QA #2) — impact: hele tijdvenster-feature is effectief dood, VRP solver ontvangt nooit tijdvensters — actie: App Developer, voeg `time_window_start, time_window_end` toe aan `.select()` in `Planning.tsx:271`. Snelle fix, grote impact.

2. **Status state machine mismatch frontend vs DB** (Monitoring #1) — impact: verwarrende fouten voor gebruikers, geannuleerde orders niet heropenbaar via UI terwijl DB het toestaat — actie: App Developer, synchroniseer `VALID_TRANSITIONS` in `useOrders.ts` met de DB trigger. DB is single source of truth.

3. **poll-inbox client lookup zonder tenant-isolatie** (Monitoring #11) — impact: bij multi-tenant worden emails verkeerd geclassificeerd — actie: App Developer, voeg `.eq("tenant_id", tenantId)` toe in `poll-inbox/index.ts:181-186`.

4. **ai_corrections order_id is TEXT i.p.v. UUID** (Monitoring #8) — impact: geen referentiele integriteit, wees-records, trage joins — actie: App Developer, migratie schrijven: `ALTER COLUMN order_id TYPE uuid USING order_id::uuid`, FK constraint toevoegen.

### MIDDEL — Plannen

1. **UTC-offset datumfout in PlanningDateNav** (QA #4) — kan datumsfouten veroorzaken bij laat werken. Lokale datumformatting implementeren.
2. **Dubbele SLA-monitoring browser + pg_cron** (Monitoring #2) — dubbele notificaties, onnodige load. Browser polling verwijderen, pg_cron behouden + realtime subscription.
3. **Query zonder limit in useSLAMonitor** (Monitoring #3) — performance degradatie bij schaling. Limit toevoegen of oplossen via signaal 2.
4. **Confidence normalisatie op drie plekken** (Monitoring #9) — fragiele code-duplicatie. Normaliseer uitsluitend in parse-order.
5. **import-email mist AI-extractie** (Monitoring #7) — inconsistente workflow. parse-order aanroepen vanuit import-email.

### LAAG — Backlog

1. PlanningWeekView pendingNoDate filter matcht nooit (QA #3)
2. Bulk import sequentiele inserts, geen batching (QA #6)
3. useMemo dependency instabiel in PlanningWeekView (QA #7)
4. useClients active order count zonder limit (Monitoring #4)
5. useTrips query zonder limit bij ontbrekende date filter (Monitoring #12)
6. RLS "allow all" tijdelijk patroon in migraties (Monitoring #10) — geen actief risico, wel lesgeleerd voor toekomst

## Overlap QA + Monitoring
- **tenant_id ontbreekt bij inserts**: QA vond het in BulkImportDialog (client insert), Monitoring in create-order edge function en poll-inbox. Dit is een systematisch patroon — multi-tenant isolatie is niet consistent doorgevoerd in nieuwe code.
- **ClientPortal security**: QA rapporteerde client-side validatie, Monitoring bevestigt dat RLS-policies weliswaar bestaan maar edge functions ze soms omzeilen.
- **Data-integriteit type mismatches**: QA vond `as any` casts die types omzeilen, Monitoring vond order_id als TEXT i.p.v. UUID. Beide wijzen op onvoldoende type-discipline in recent toegevoegde code.

## Aanbeveling aan CEO

De codebase compileert schoon en de kernarchitectuur (RLS, VRP solver, UBL export) is solide, maar er zijn vier multi-tenant isolatie-gaten gevonden die voor productie gedicht moeten worden — dit is de rode draad door beide rapporten. De driver PIN plaintext-opslag is een directe security-liability. Ik stel voor dat de App Developer vandaag start met de 4 kritieke items (geschatte effort: 2-4 uur totaal) en de 4 hoge items deze sprint afrondt. Geen blocker voor de huidige single-tenant pilot, maar wel voor multi-tenant rollout.
