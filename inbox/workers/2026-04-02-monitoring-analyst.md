# Monitoring Report — 2026-04-02
**Periode:** dagelijkse check
**Status:** aandacht

## Signalen

### 1. Status state machine inconsistentie (frontend vs database)
- **Ernst:** waarschuwing
- **Type:** data-integriteit
- **Frequentie:** structureel
- **Bron:** `supabase/migrations/20260402_order_status_constraint.sql` vs `src/hooks/useOrders.ts`
- **Data:** De DB trigger staat CANCELLED -> DRAFT en PENDING -> DRAFT toe, maar de frontend `VALID_TRANSITIONS` in useOrders.ts blokkeert die overgangen (CANCELLED en DELIVERED zijn terminal). Omgekeerd: de DB staat PLANNED -> PENDING toe, maar de frontend niet.
- **Trend:** →
- **Impact:** Operationeel risico: als de frontend een overgang blokkeert die de DB toestaat (of omgekeerd), krijgt de gebruiker verwarrende fouten. In het bijzonder: een geannuleerde order kan in de DB worden heropend naar DRAFT, maar de frontend UI laat dit niet toe.
- **Aanbeveling:** Synchroniseer de state machine definities. Kies een single source of truth (de DB trigger) en laat de frontend die spiegelen.

### 2. SLA monitor loopt dubbel (browser + pg_cron)
- **Ernst:** waarschuwing
- **Type:** performance
- **Frequentie:** structureel
- **Bron:** `src/hooks/useSLAMonitor.ts` (elke 60s) + `supabase/migrations/20260402_sla_monitor_cron.sql` (elke 10 min)
- **Data:** Twee systemen genereren SLA-notificaties onafhankelijk. De browser-hook pollt elke 60 seconden zonder limit op de query (alle DRAFT/PENDING orders met received_at). De pg_cron functie doet hetzelfde elke 10 minuten.
- **Trend:** ↑ (groeit mee met ordervolume)
- **Impact:** Dubbele notificaties mogelijk. Bij 100+ open orders: de browser-query haalt alle orders op elke minuut. De dedup in de browser-hook is alleen session-based (useRef), dus bij page refresh komen notificaties opnieuw. De pg_cron dedup checkt notifications tabel (beter), maar dekt niet de browser-hook.
- **Aanbeveling:** Kies een van de twee. De pg_cron aanpak is betrouwbaarder en serverside. De browser-hook kan dan puur de realtime subscription houden (die is al aanwezig in dezelfde hook) en de polling verwijderen.

### 3. Query zonder limit in useSLAMonitor
- **Ernst:** waarschuwing
- **Type:** performance
- **Frequentie:** structureel
- **Bron:** `src/hooks/useSLAMonitor.ts:18-21`
- **Data:** `supabase.from("orders").select(...).in("status", ["DRAFT", "PENDING"]).not("received_at", "is", null).order(...)` — geen `.limit()`. Bij groei naar honderden open orders wordt dit een zware query die elke 60 seconden draait.
- **Trend:** ↑
- **Impact:** Performance degradatie bij schaling. Elke open browsertab voert deze query elke minuut uit.
- **Aanbeveling:** Voeg `.limit(100)` toe, of vervang door de pg_cron oplossing (signaal 2).

### 4. Query zonder limit in useClients — active order count
- **Ernst:** info
- **Type:** performance
- **Frequentie:** structureel
- **Bron:** `src/hooks/useClients.ts:70-72`
- **Data:** `supabase.from("orders").select("client_name").not("status", "in", ...)` — geen limit. Haalt potentieel alle actieve orders op om een count per client te berekenen.
- **Trend:** ↑
- **Impact:** Bij 1000+ orders wordt dit traag. Beter: gebruik een `count` aggregatie of een DB view.
- **Aanbeveling:** Vervang door een `.select("client_name", { count: "exact", head: true })` per client, of een GROUP BY query via RPC.

### 5. create-order edge function mist tenant_id
- **Ernst:** kritiek
- **Type:** data-integriteit
- **Frequentie:** structureel
- **Bron:** `supabase/functions/create-order/index.ts:65-80`
- **Data:** De `create-order` function accepteert een body met `allowedFields`, maar `tenant_id` zit daar niet in. Orders aangemaakt via deze API-endpoint krijgen geen tenant_id, wat de multi-tenant isolatie doorbreekt.
- **Trend:** →
- **Impact:** Orders via de externe API (API key auth) zijn niet gekoppeld aan een tenant. RLS policies op orders die filteren op tenant_id zullen deze orders niet tonen. Data-isolatie probleem.
- **Aanbeveling:** Voeg tenant_id toe aan allowedFields, of leid het af uit de API key configuratie.

### 6. Driver PIN opgeslagen als plaintext
- **Ernst:** kritiek
- **Type:** error
- **Frequentie:** structureel
- **Bron:** `supabase/migrations/20260402_driver_pin.sql:2`
- **Data:** `ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS pin_hash text DEFAULT '0000';` — de kolom heet "pin_hash" maar de default is de plaintext PIN "0000", niet een hash. Het commentaar zegt "in production use a proper hash" maar er is geen hash-functie.
- **Trend:** →
- **Impact:** Security: driver PINs worden in plaintext opgeslagen. Als de database gecompromitteerd wordt, zijn alle PINs direct leesbaar.
- **Aanbeveling:** Implementeer hashing (bijv. pgcrypto `crypt()`) voor PIN opslag. Verander de default naar een gehashte waarde.

### 7. import-email functie doet geen AI-extractie
- **Ernst:** info
- **Type:** error
- **Frequentie:** structureel
- **Bron:** `supabase/functions/import-email/index.ts`
- **Data:** De import-email function maakt een DRAFT order aan maar roept parse-order niet aan voor AI-extractie. De poll-inbox function doet dit wel. Handmatig geimporteerde emails missen dus confidence_score, missing_fields, follow_up_draft, etc.
- **Trend:** →
- **Impact:** Inconsistente workflow: handmatig geimporteerde emails moeten in de frontend alsnog handmatig AI-extractie triggeren (wat useInbox doet via auto-extract), maar dit is een extra stap en kan mislopen als de gebruiker niet de inbox pagina bezoekt.
- **Aanbeveling:** Overweeg parse-order aan te roepen vanuit import-email, consistent met poll-inbox.

### 8. ai_corrections tabel: order_id is TEXT, niet UUID
- **Ernst:** waarschuwing
- **Type:** data-integriteit
- **Frequentie:** structureel
- **Bron:** `supabase/migrations/20260401_ai_corrections.sql:3`
- **Data:** `order_id text` — de orders tabel gebruikt UUID als primary key, maar ai_corrections slaat order_id op als TEXT. Er is ook geen foreign key constraint.
- **Trend:** →
- **Impact:** Geen referentiele integriteit. Bij het verwijderen van een order blijven ai_corrections wees-records achter. Joins zijn trager door type mismatch (text vs uuid).
- **Aanbeveling:** Wijzig naar `order_id uuid REFERENCES orders(id) ON DELETE SET NULL`.

### 9. Confidence normalisatie op drie plekken gedupliceerd
- **Ernst:** info
- **Type:** confidence
- **Frequentie:** structureel
- **Bron:** `supabase/functions/parse-order/index.ts:587-602`, `src/hooks/useInbox.ts:204-207`, `src/hooks/useInbox.ts:627-629`
- **Data:** Dezelfde logica (if confidence > 0 && confidence <= 1, multiply by 100) staat in parse-order (edge function), in handleLoadTestScenario (useInbox), en in de auto-extract effect (useInbox). Drie plekken die hetzelfde doen.
- **Trend:** →
- **Impact:** Risico op dubbele normalisatie: als parse-order al normaliseert naar 0-100 en useInbox het opnieuw doet, is er geen probleem (want de check is > 0 && <= 1). Maar het is fragiel en code-duplicatie.
- **Aanbeveling:** Normaliseer uitsluitend in parse-order (de bron). Verwijder de normalisatie uit de frontend hooks.

### 10. RLS policies op dispatch tables: trips_all "allow all" aangemaakt en vervolgens vervangen
- **Ernst:** info
- **Type:** data-integriteit
- **Frequentie:** eenmalig
- **Bron:** `20260402_dispatch_to_delivery.sql` + `20260402_fix_dispatch_rls.sql`
- **Data:** De eerste migratie maakt "allow all" policies aan (regel 129-132), de tweede migratie verwijdert ze en vervangt door tenant-isolated policies. De volgorde is correct, maar het patroon is fragiel.
- **Trend:** →
- **Impact:** Als de tweede migratie faalt, blijven de "allow all" policies actief. In productie zou dit een security gap zijn.
- **Aanbeveling:** Bij toekomstige migraties: maak nooit tijdelijk "allow all" policies aan. Begin direct met de juiste RLS of maak de policies in een enkele migratie.

### 11. poll-inbox: geen tenant-isolatie bij client lookup
- **Ernst:** waarschuwing
- **Type:** data-integriteit
- **Frequentie:** structureel
- **Bron:** `supabase/functions/poll-inbox/index.ts:181-186`
- **Data:** De rule-based classificatie doet `supabase.from("clients").select("id").eq("email", fromAddr).limit(1)` — zonder tenant_id filter. Als twee tenants dezelfde klant-email hebben, matcht dit de verkeerde tenant.
- **Trend:** → (single tenant nu, maar risico bij multi-tenant)
- **Impact:** Bij multi-tenant gebruik worden emails potentieel verkeerd geclassificeerd als "known client" voor de verkeerde tenant.
- **Aanbeveling:** Voeg `.eq("tenant_id", tenantId)` toe aan de client lookup in ruleBasedClassify.

### 12. useTrips query zonder limit
- **Ernst:** info
- **Type:** performance
- **Frequentie:** structureel
- **Bron:** `src/hooks/useTrips.ts:13-27`
- **Data:** `useTrips(date)` haalt alle trips + trip_stops + proof_of_delivery op voor een datum, zonder limit. Als er geen date filter is meegegeven, haalt het ALLE trips op inclusief geneste relaties.
- **Trend:** ↑
- **Impact:** Bij groei zonder date filter kan dit honderden trips met duizenden stops laden. Met date filter is het beheersbaar.
- **Aanbeveling:** Voeg een fallback limit toe (bijv. `.limit(50)`) als er geen date filter is.

## Samenvatting
- Kritiek: 2 | Waarschuwing: 4 | Info: 6
- Belangrijkste trend: Multi-tenant isolatie heeft gaten (create-order zonder tenant_id, poll-inbox client lookup zonder tenant filter). De security-basis (RLS) is goed opgezet maar de edge functions omzeilen het soms. De dubbele SLA-monitoring en ontbrekende query limits zijn performance-risico's die met groei erger worden.
