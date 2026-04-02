# QA Review — Recente wijzigingen
**Datum:** 2026-04-02
**Scope:** laatste 5 commits
**Risico-niveau:** middel

## Bevindingen

### 1. `as any` cast bij client insert maskeert ontbrekende tenant_id
- **Ernst:** middel
- **Type:** data-integriteit
- **Locatie:** src/components/orders/BulkImportDialog.tsx:238
- **Beschrijving:** Bij het aanmaken van een nieuwe client via bulk import wordt `{ name: clientName } as any` gebruikt. Dit omzeilt de TypeScript-types voor de `clients` tabel. De `tenant_id` ontbreekt in dit insert-statement, terwijl het verderop (regel 272-274) wel aan de order wordt meegegeven. Als RLS-policies een tenant_id vereisen op clients, faalt de insert stilletjes of maakt een client zonder tenant_id aan.
- **Reproductie:** Upload een CSV met een nieuwe klantnaam die niet in de database bestaat. De client wordt aangemaakt zonder tenant_id.
- **Impact:** Orphan clients die niet zichtbaar zijn voor de juiste tenant; mogelijke RLS-violations.
- **Voorstel:** Voeg `tenant_id` toe aan het client insert-statement: `{ name: clientName, tenant_id: tenant?.id }` en verwijder de `as any` cast.
- **Confidence:** hoog

### 2. `as any` cast bij time_window velden in Planning query
- **Ernst:** laag
- **Type:** inconsistentie
- **Locatie:** src/pages/Planning.tsx:284-285
- **Beschrijving:** De planning query haalt `time_window_start` en `time_window_end` niet op in de `.select()` clause (regel 271), maar castt het resultaat via `(o as any).time_window_start`. Hierdoor zijn deze velden altijd `null` in de planning, zelfs als ze in de database staan. De VRP solver en ETA-berekening ontvangen dan nooit tijdvensters van bestaande orders.
- **Reproductie:** Maak een order aan met time_window_start/end ingevuld, ga naar Planning. De tijdvenster-badge verschijnt niet.
- **Impact:** Tijdvensters worden effectief genegeerd in de dagplanning, terwijl de hele commit "Tijdvensters in VRP solver en planning UI" juist die feature toevoegt.
- **Voorstel:** Voeg `time_window_start, time_window_end` toe aan de `.select()` string op regel 271 en verwijder de `as any` casts.
- **Confidence:** hoog

### 3. PlanningWeekView: pendingNoDate filter matcht nooit
- **Ernst:** laag
- **Type:** bug
- **Locatie:** src/components/planning/PlanningWeekView.tsx:164
- **Beschrijving:** Regel 164 telt `weekOrders.filter(o => !o.delivery_date && o.status === "PENDING")`. Maar de query op regel 43-50 filtert al op `.gte("delivery_date", mondayStr).lt("delivery_date", sundayStr)`, waardoor orders zonder delivery_date nooit in het resultaat zitten. De `pendingNoDate` teller is dus altijd 0.
- **Reproductie:** Maak PENDING orders aan zonder delivery_date. Open het weekoverzicht. De waarschuwing "X order(s) zonder leverdatum" verschijnt nooit.
- **Impact:** Gebruiker mist de visuele hint dat er ongeplande orders zonder datum bestaan. Puur cosmetisch, geen data-verlies.
- **Voorstel:** Gebruik een aparte query voor PENDING orders zonder delivery_date, of verwijder het `.gte("delivery_date")`-filter en filter client-side.
- **Confidence:** hoog

### 4. toDateString() geeft verkeerde datum in negatieve UTC-offset tijdzones
- **Ernst:** middel
- **Type:** edge-case
- **Locatie:** src/components/planning/PlanningDateNav.tsx:19-21
- **Beschrijving:** `toDateString` gebruikt `d.toISOString().split("T")[0]`. `toISOString()` converteert naar UTC. Op 1 april 23:30 in UTC+2 (Nederland zomertijd) geeft `new Date()` 21:30 UTC = nog steeds 1 april, maar op 31 maart 23:30 CET (UTC+1) geeft het 1 april in UTC. Dit kan edge-case datumsfouten veroorzaken wanneer een planner laat op de avond werkt.
- **Reproductie:** Stel systeemklok in op 00:30 CET (wintertime). `toDateString(new Date())` geeft de vorige dag terug.
- **Impact:** Planner ziet orders van gisteren i.p.v. vandaag, of slaat drafts op onder de verkeerde datum.
- **Voorstel:** Gebruik lokale datumformatting: ``const pad = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;``
- **Confidence:** hoog

### 5. ClientPortal: geen RLS/authenticatie-check op order insert
- **Ernst:** hoog
- **Type:** security
- **Locatie:** src/pages/ClientPortal.tsx:203-214
- **Beschrijving:** Het klantportaal stuurt een `tenant_id` mee gebaseerd op een separate client-lookup (regel 197-201). Als die lookup faalt (clientData is null), wordt `tenant_id: null` meegegeven. Dit kan RLS-policies omzeilen als die op tenant_id filteren. Bovendien vertrouwt het portaal volledig op client-side logica om de client_id te bepalen -- een kwaadwillende gebruiker kan met de Supabase client direct orders aanmaken voor andere clients.
- **Reproductie:** Log in op het klantportaal, manipuleer de JavaScript-context om `clientProfile.client_id` te wijzigen, en dien een order in.
- **Impact:** Orders kunnen worden aangemaakt voor andere klanten of zonder correcte tenant-koppeling.
- **Voorstel:** Verplaats order-creatie naar een Supabase Edge Function of database function die de client_id valideert op basis van auth.uid(). Zorg dat RLS-policies INSERT beschermen.
- **Confidence:** middel (afhankelijk van huidige RLS-configuratie)

### 6. Bulk import: sequentiele row-by-row inserts (performance)
- **Ernst:** laag
- **Type:** inconsistentie
- **Locatie:** src/components/orders/BulkImportDialog.tsx:213-287
- **Beschrijving:** Elke CSV-rij wordt individueel naar Supabase gestuurd (client lookup + order insert). Bij 500 rijen betekent dit 500-1000 API calls. Er is geen batching of parallellisatie.
- **Reproductie:** Importeer een CSV met 200+ rijen. Observe dat het minuten duurt.
- **Impact:** Slechte gebruikerservaring bij grote imports. Geen functionele bug, maar schaalbaarheids-risico.
- **Voorstel:** Batch orders in groepen van 50-100 met `supabase.from("orders").insert(batch)`. Pre-resolve alle clients eerst, dan batch-insert orders.
- **Confidence:** hoog

### 7. PlanningWeekView: useMemo dependency op monday.getTime() is instabiel
- **Ernst:** laag
- **Type:** edge-case
- **Locatie:** src/components/planning/PlanningWeekView.tsx:96
- **Beschrijving:** `useMemo(() => {...}, [monday.getTime()])` -- `monday` is een lokale variabele die elke render opnieuw wordt berekend via `getMonday(weekStart)`. Als `weekStart` niet verandert, levert `getTime()` hetzelfde getal en werkt de memo correct. Maar als `weekStart` een string is die dezelfde week vertegenwoordigt maar een andere dag, zal `monday` (en dus de memo) onnodig herberekenen. Geen crash, maar suboptimaal.
- **Reproductie:** N.v.t. -- werkt correct in de praktijk, maar is een anti-pattern.
- **Impact:** Minimaal. Mogelijke extra re-renders.
- **Voorstel:** Gebruik `[mondayStr]` als dependency i.p.v. `[monday.getTime()]`.
- **Confidence:** middel

## Risicoanalyse

De codebase compileert schoon (0 TypeScript errors) en de architectuur is consistent. De meest significante bevindingen zijn:

1. **De `time_window` velden worden niet opgehaald in de planning query** (bevinding #2), waardoor de hele tijdvenster-feature in commit `8605985` effectief dood code is in de dagplanning. Dit is een functionele regressie ten opzichte van de bedoeling van die commit.

2. **De `as any` cast bij client-creatie tijdens bulk import** (bevinding #1) kan leiden tot data-integriteit issues in een multi-tenant setup.

3. **De security-aanname in het klantportaal** (bevinding #5) verdient aandacht voordat dit naar productie gaat.

De database-migratie (delivery_date, pickup_date) is correct en voorzien van indexen. De VRP-solver logica is solide en houdt correct rekening met capaciteit, features en tijdvensters. De UBL-export volgt de juiste specificatie.

## Aanbevelingen

1. **[Kritiek]** Voeg `time_window_start, time_window_end` toe aan de planning query `.select()` in Planning.tsx:271 -- zonder dit werken tijdvensters niet.
2. **[Hoog]** Fix de `as any` cast in BulkImportDialog.tsx en voeg tenant_id toe aan client insert.
3. **[Hoog]** Valideer ClientPortal order-insert server-side (RLS of Edge Function).
4. **[Middel]** Vervang `toDateString()` door lokale datumformatting om UTC-offset bugs te voorkomen.
5. **[Laag]** Fix de pendingNoDate query in PlanningWeekView of verwijder de nooit-zichtbare warning.
6. **[Laag]** Overweeg batch-inserts voor bulk import bij grote CSV-bestanden.
