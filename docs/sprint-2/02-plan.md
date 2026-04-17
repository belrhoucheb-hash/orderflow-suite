# Sprint 2, Fase 2, Plan van aanpak

Opgesteld 2026-04-17, op basis van goedgekeurd onderzoek (`01-research.md`) en vijf beslissingen van Badr:

1. Motor als Edge Function met gedeelde TypeScript-module
2. Voertuigmatrix: default-seed per tenant, volledig configureerbaar
3. Toeslagentabel: seed met structuur, bedragen op 0% tot tenant invult
4. Hybride snapshot: `shipments.pricing` blijft audit-snapshot, `order_charges` voor add-ons
5. Geen backfill van oude orders, feature-flag per tenant

Alles tenant-scoped, geen RCS-specifieke hardcoding.

## 1. Datamodel

### 1.1 Nieuwe tabel `vehicle_types`

```sql
CREATE TABLE public.vehicle_types (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0,

  max_length_cm   INTEGER,
  max_width_cm    INTEGER,
  max_height_cm   INTEGER,
  max_weight_kg   INTEGER,
  max_volume_m3   NUMERIC(6,2),
  max_pallets     INTEGER,

  has_tailgate    BOOLEAN NOT NULL DEFAULT false,
  has_cooling     BOOLEAN NOT NULL DEFAULT false,
  adr_capable     BOOLEAN NOT NULL DEFAULT false,

  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, code)
);
```

RLS: tenant-isolatie via `get_user_tenant_id()`, service-role bypass. Trigger `update_updated_at_column()`.

`sort_order` bepaalt de hiërarchie van klein naar groot, wordt gebruikt door selectie-algoritme.

### 1.2 `vehicles.vehicle_type_id` FK

```sql
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS vehicle_type_id UUID REFERENCES public.vehicle_types(id) ON DELETE SET NULL;
```

Bestaande `vehicles.type` (tekst) blijft intact voor backwards-compat. Niet in deze sprint opruimen.

### 1.3 `rate_rules.vehicle_type_id` FK

```sql
ALTER TABLE public.rate_rules
  ADD COLUMN IF NOT EXISTS vehicle_type_id UUID REFERENCES public.vehicle_types(id) ON DELETE RESTRICT;
```

`PER_KM` en `VAST_BEDRAG` rules kunnen nu per voertuigtype verschillen. NULL = geldt voor alle types.

### 1.4 `surcharges` uitbreiden met tijdvensters en dagtype

```sql
ALTER TABLE public.surcharges
  ADD COLUMN IF NOT EXISTS time_from TIME,
  ADD COLUMN IF NOT EXISTS time_to   TIME,
  ADD COLUMN IF NOT EXISTS day_type  TEXT CHECK (day_type IN ('weekday','saturday','sunday','holiday','any')) DEFAULT 'any',
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
```

Werking: als `time_from` en `time_to` gezet zijn, geldt de surcharge alleen als `pickup_time` binnen dat venster valt. `day_type` bepaalt dag-match naast het bestaande `applies_to.day_of_week` (blijft bestaan voor fijnmazigere matching).

### 1.5 Nieuwe tabel `order_charges`

```sql
CREATE TABLE public.order_charges (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id            UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,

  charge_type         TEXT NOT NULL CHECK (charge_type IN
                        ('waiting','toll','extra_stop','correction','manual','other')),
  description         TEXT NOT NULL,
  source_description  TEXT,

  quantity            NUMERIC(10,3),
  unit                TEXT,
  unit_price_cents    INTEGER,
  amount_cents        INTEGER NOT NULL,

  created_by          UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_charges_order ON public.order_charges(order_id);
CREATE INDEX idx_order_charges_tenant ON public.order_charges(tenant_id, charge_type);
```

RLS: tenant-isolatie, service-role bypass.

### 1.6 Feature-flag via bestaande `tenant_settings`

`tenant_settings` is een JSONB key-value store met `(tenant_id, category)` als unique key. Geen DDL-wijziging nodig, wel een conventie:

```sql
-- Upsert per tenant bij onboarding:
INSERT INTO public.tenant_settings (tenant_id, category, settings)
VALUES ($1, 'pricing', '{"engine_enabled": false}'::jsonb)
ON CONFLICT (tenant_id, category) DO NOTHING;
```

Lezen: `settings->>'engine_enabled' = 'true'`. Default uit, tenant zet aan.

Helper-functie in de motor en in de trigger:

```sql
CREATE OR REPLACE FUNCTION public.is_pricing_engine_enabled(p_tenant_id UUID)
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT (settings->>'engine_enabled')::boolean
     FROM public.tenant_settings
     WHERE tenant_id = p_tenant_id AND category = 'pricing'
     LIMIT 1),
    false
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

### 1.7 `shipments.pricing` generiek schema

Geen DDL-wijziging, wel een schema-afspraak die in code afgedwongen wordt:

```json
{
  "engine_version": "v2-2026-04",
  "rate_card_id": "uuid",
  "vehicle_type_id": "uuid",
  "vehicle_type_name": "Bakwagen",
  "vehicle_type_reason": "Kleinste passend op 120x80x180, klep vereist",
  "line_items": [
    {"rule_type":"PER_KM","description":"Kilometertarief bakwagen","quantity":230,"unit":"km","unit_price_cents":145,"amount_cents":33350}
  ],
  "surcharges": [
    {"surcharge_id":"uuid","name":"Weekendtoeslag","surcharge_type":"PERCENTAGE","amount_cents":3335}
  ],
  "subtotal_cents": 36685,
  "total_cents": 36685,
  "currency": "EUR",
  "calculated_at": "2026-04-17T10:00:00Z"
}
```

RCS-specifieke velden (`mode`, `matrix_tariff`, `calc_raw`) vervallen in het nieuwe schema. Oude rijen blijven leesbaar, nieuwe orders krijgen het nieuwe schema.

### 1.8 ER-overzicht

```
tenants (1) ─── (*) vehicle_types
                     │
                     ├── (*) vehicles [vehicle_type_id]
                     └── (*) rate_rules [vehicle_type_id]

tenants (1) ─── (*) rate_cards ── (*) rate_rules
tenants (1) ─── (*) surcharges
tenants (1) ─── (*) orders ── (1) shipments [pricing JSONB snapshot]
                       │
                       └── (*) order_charges [add-ons]
```

## 2. Tariefmotor, business logic

### 2.1 Pseudocode `calculate_order_price(order_id)`

```
1. Laad order + shipment + client + cargo-regels
2. Als tenant_settings.pricing_engine_enabled = false:
     return null (handmatige pricing, skip motor)
3. Aggregeer zending-eigenschappen:
     total_length = max(cargo[].lengte)
     total_width  = max(cargo[].breedte)
     total_height = sum of stackable heights OR max if unstackable
     total_weight = sum(cargo[].gewicht * aantal)
     requires_tailgate = shipments.requires_tail_lift
     requires_cooling  = transport_type == 'koel' OR cargo[].koeling
     requires_adr      = ANY(cargo[].adr)
4. Selecteer voertuigtype (TA-02 + TA-03):
     candidates = vehicle_types WHERE tenant_id = X AND is_active
     filter op: max_length >= total_length
                max_width  >= total_width
                max_height >= total_height
                max_weight >= total_weight
     apply overrides:
       if requires_tailgate: filter has_tailgate = true
       if requires_cooling:  filter has_cooling  = true
       if requires_adr:      filter adr_capable  = true
     pick ORDER BY sort_order ASC LIMIT 1
     reason = "Kleinste passend op LxBxH + gewicht + overrides"
     als geen match: return error "Geen passend voertuigtype"
5. Haal rate_card op voor client op basis van `pickup_date` (niet `now()`):
     effective_date = order.pickup_date (voor historische juistheid)
     candidates = rate_cards WHERE is_active
                  AND (valid_from IS NULL OR effective_date >= valid_from)
                  AND (valid_until IS NULL OR effective_date <= valid_until)
                  AND (client_id = X OR client_id IS NULL)

     Prioriteit (score, hoger wint):
       +1000 als client_id = X                       (klant-specifiek)
       + 100 als rule-level match op traject aanwezig (via rate_rules.conditions.from_zone/to_zone)
       +  10 als rule-level match op vehicle_type_id aanwezig
       +   1 basis

     Tie-breaker: hoogste sort_order wint (tenant kan dit aanpassen).
     Als 0 candidates: return error "no_rate_card".
     Als >1 na prioriteit-score gelijk: return error "ambiguous_rate_cards" met IDs, tenant moet opruimen.
6. Bereken basisprijs:
     voor elke rate_rule (gesorteerd op sort_order):
       als rule.vehicle_type_id gezet en niet matcht: skip
       als rule_type = PER_KM: amount = distance_km * rule.amount
       als rule_type = VAST_BEDRAG: amount = rule.amount
       als rule_type = PER_STOP: amount = stop_count * rule.amount
       etc.
       apply min_amount als ingesteld
       append aan line_items
7. Bereken toeslagen (TA-04):
     voor elke surcharge WHERE tenant_id = X AND is_active:
       check day_type: pickup_date dag-type matcht
       check time_from/time_to: pickup_time binnen venster
       check applies_to.day_of_week, requirements, transport_type
       als match:
         PERCENTAGE: amount = subtotal * (surcharge.amount / 100)
         VAST_BEDRAG: amount = surcharge.amount
         PER_KM: amount = distance_km * surcharge.amount
         PER_KG: amount = total_weight * surcharge.amount
         append aan surcharges-array
8. Totaal:
     subtotal = sum(line_items)
     total = subtotal + sum(surcharges)
9. Bouw snapshot-object (zie 1.7)
10. Return snapshot
```

Wachtkosten (TA-05) zitten **niet** in de motor. Die komen als `order_charges` rij achteraf.

### 2.2 Locatie

`supabase/functions/_shared/pricingEngine.ts` is de enige motor-implementatie.

- Gebruikt door frontend (`src/components/orders/OrderPricePreview.tsx` preview, real-time)
- Gebruikt door Edge Function `supabase/functions/calculate-order-price/index.ts` (bij orderaanmaak, definitief)

De huidige `src/lib/pricingEngine.ts` wordt verplaatst naar `supabase/functions/_shared/` en in de frontend geïmporteerd via een `src/lib/pricingEngine.ts` shim die re-exporteert. Zo hoeven we de bestaande tests niet te verplaatsen in één beweging.

### 2.3 Afstandsberekening

Bestaat al in Sprint 1 via `trajectRouter.ts` en Google Maps. Motor accepteert `distance_km` als input, berekent het zelf niet. De caller (NewOrder, Edge Function) vult de afstand vooraf.

## 3. Backend

### 3.1 Edge Function `calculate-order-price`

- Input: `{ order_id: string }`
- Auth: service role (wordt vanuit backend/trigger aangeroepen)
- Output: snapshot-JSON, gelijk aan `shipments.pricing`
- Bij succes: update `shipments.price_total_cents` en `shipments.pricing`
- Bij fout: log naar `pipeline_events`, `shipments.pricing = {error: "...", calculated_at: ...}`

### 3.2 Aanroep vanuit `pipeline_events`, niet uit DB-trigger

Na nadere afweging: geen HTTP-call uit een DB-trigger. `pg_net` wordt elders in het project wel gebruikt, maar een HTTP-post vanuit een INSERT-trigger is fire-and-forget, faalt stil bij timeouts en heeft geen retry. Voor een kritisch pad als tariefberekening onacceptabel.

In plaats daarvan: hergebruik het bestaande `pipeline_events` patroon. Elke shipment-insert levert een rij in `pipeline_events` met `event_type = 'shipment_created'`. Een bestaande consumer pikt dat op. Voeg een nieuwe handler toe `handle_shipment_pricing(event)` die `calculate-order-price` aanroept. Fouten komen in het event-log terecht, retries zijn ingebouwd.

Als het event-pipeline-patroon onvoldoende is gedocumenteerd of werkt niet zoals verwacht (te checken in eerste commit van Fase 3): fallback naar expliciete aanroep vanuit de drie callers:

1. `src/pages/NewOrder.tsx` na `insertShipment`
2. `supabase/functions/parse-order/index.ts` na AI-extract
3. `supabase/functions/create-order/index.ts` als die nog in gebruik is

Drie call-sites is beheersbaar, en zichtbaarder dan een trigger. Beslissing in Fase 3 na verificatie van `pipeline_events`-coverage.

### 3.3 Herberekening

Bij wijziging van shipment-zending, pickup-datum, klant: **geen automatische herberekening**. Planner klikt expliciet "Herbereken tarief" in orderdetail. Reden: historische juistheid. Een herberekening moet bewust zijn, niet een side-effect van een typfout in cargo.

### 3.4 RLS policies

`vehicle_types`, `order_charges`: tenant-isolatie via `get_user_tenant_id()` + service-role bypass. Pattern is hetzelfde als `rate_cards` en `surcharges`. Geen rol-differentiatie binnen tenant (alle authenticated users mogen lezen/schrijven), consistent met huidige pattern.

## 4. Frontend

### 4.1 Stamgegevens, nieuwe tabs

Onder bestaande `MasterDataSection.tsx`:

- **Voertuigtypes**: CRUD-UI voor `vehicle_types`. Tabel met code, naam, afmetingen, features, actief. Nieuw / bewerken dialog.
- Tariefkaart-rules-dialog krijgt een select-veld "Voor voertuigtype" (optioneel, default leeg = alle types).

### 4.2 Orderdetail, financiële sectie

Volledige vervanging van huidige prijs-weergave in `src/pages/OrderDetail.tsx`:

- Sectie "Automatisch berekend":
  - Gekozen voertuigtype + korte uitleg (`vehicle_type_reason`)
  - Basisregels (tabel: beschrijving, aantal, eenheid, prijs, totaal)
  - Toeslagen (tabel)
  - Subtotaal
- Sectie "Extra kosten" (`order_charges`):
  - Rijen met type, beschrijving, bedrag, aangemaakt door, datum
  - Knop "Toevoegen" opent dialog (type-select: wachtkosten / tol / extra stop / correctie / overig)
  - Wachtkosten-dialog: kwantiteit (uur/min), uurtarief, totaal, notitie
- Totaal inclusief alle `order_charges`
- Knop "Herbereken tarief" en "Handmatig overschrijven": zie permissie-tabel hieronder

### 4.3 Rol-permissies voor financiële acties

| Actie | Planner / beheerder | Chauffeur | Read-only user |
|---|---|---|---|
| Bekijk snapshot + order_charges | ja | ja (eigen trip) | ja |
| Wachtkosten toevoegen | ja | ja (eigen trip, alleen `waiting` type) | nee |
| Tol / extra stop / correctie toevoegen | ja | nee | nee |
| Herbereken tarief (overschrijft snapshot) | ja | nee | nee |
| Handmatig overschrijven (zet `pricing.locked = true`) | ja (met bevestig-dialog + reden verplicht) | nee | nee |

Implementatie: rol-check in frontend (hook `useUserRole()`) voor UI-affordances, plus RLS-policy op `order_charges` die `charge_type = 'waiting'` toestaat voor chauffeur met matchende trip. Non-chauffeurs krijgen volledige insert-rechten binnen tenant.

Alle bedragen NL-geformatteerd (`formatCurrency` uit `invoiceUtils.ts`), rechts uitgelijnd.

### 4.4 NewOrder preview

`OrderPricePreview.tsx` wordt aangepast:

- Gebruikt dezelfde motor als backend (shared module)
- Geen hardcoded `distance_km = 150` meer, trekt afstand uit traject
- Toont voertuigtype-keuze met reden
- Zegt expliciet "Voorlopig tarief, definitief bij opslaan" zolang shipment nog niet bestaat

### 4.5 Klantdetail

`ClientRateCard.tsx`: select-veld toevoegen per rate_rule voor `vehicle_type_id` (optioneel).

### 4.6 Feature-flag UI

Onder Stamgegevens, nieuwe tab "Tariefmotor":

- Toggle "Tariefmotor ingeschakeld"
- Als uit: info-tekst "Tarieven worden handmatig ingevoerd per order"
- Als aan: checks "Je hebt minstens X voertuigtypen, Y tarieven ingesteld"

## 5. Testplan

### 5.1 Unit tests (motor)

Bestaande `src/__tests__/pricingEngine.test.ts` uitbreiden:

| Scenario | Verwachte output |
|---|---|
| Cargo 30×30×30, 5kg, geen flags | Kiest kleinste type (bijv. `klein-bestel`) |
| Cargo 80×80×80, 300kg, `requires_tail_lift=true` | Forceert type met `has_tailgate=true` |
| Cargo 250×200×220, 2000kg | Kiest bakwagen of groter |
| Cargo met `adr=true` op één rij | Kiest type met `adr_capable=true` |
| Transport_type = `koel` | Kiest type met `has_cooling=true` |
| Geen passend voertuigtype | Return error, geen snapshot |
| Rate_card met `VAST_BEDRAG` | Skip km-berekening, alleen ritprijs |
| Rate_rule met `vehicle_type_id = bakwagen_id` | Alleen gebruikt als gekozen voertuigtype matcht |
| Pickup 07:00 zaterdag, surcharge `time_from=06:00, time_to=09:00, day_type=saturday` | Toegepast |
| Pickup 10:00 maandag, zelfde surcharge | Niet toegepast |
| Tenant zonder actieve rate_card | Return error "Geen tariefkaart voor klant X" |
| Tenant met `pricing_engine_enabled=false` | Return null, geen berekening |

### 5.2 Integration tests (DB)

Nieuwe testfile `src/__tests__/orderCharges.test.ts`:

- Planner voegt wachtkosten toe: verschijnt in `order_charges`, rekent mee in totaal
- `shipments.pricing` blijft ongewijzigd na toevoeging van `order_charges`
- Wijziging in `rate_cards` laat bestaande `shipments.pricing` met rust (historische juistheid)
- Herbereken-knop: update `shipments.pricing`, laat `order_charges` met rust

### 5.3 Handmatig testplan (klant-testplan uitbreiden)

Per afspraak (zie `klant-testplan.md`): concrete gebruikersstappen in klant-taal:

1. Stel voertuigtypes in (als tenant-beheerder)
2. Stel tariefkaart in voor een klant
3. Stel een weekend-toeslag in van 15%
4. Maak een order aan op zaterdag, verwacht: auto-gekozen voertuig + weekend-toeslag zichtbaar
5. Voeg 30 minuten wachtkosten toe à €45/uur
6. Factuur-preview: adres + e-mail uit stamgegevens, niet uit contactpersoon van de order
7. Wijzig het tarief, open oude order: prijs is ongewijzigd

### 5.4 TA-06 factuur naar stamgegevens

- `autoInvoicer.ts` en invoice-view moeten `billing_email` gebruiken, met fallback naar `clients.email` als `billing_same_as_main = true`
- PDF-factuur gebruikt `billing_address` (of hoofdadres bij `billing_same_as_main = true`)
- Helper `getBillingRecipient(client)` in `src/lib/invoiceUtils.ts`

## 6. Migratie en backfill

### 6.1 Default-seeds

Functie `seed_default_vehicle_types(tenant_id)` wordt toegevoegd en voor elke bestaande tenant aangeroepen in een aparte idempotente migratie:

| code | naam | L×B×H (cm) | Gewicht (kg) | Klep | Koeling | ADR | sort |
|---|---|---|---|---|---|---|---|
| `compact` | Compact bestelvoertuig | 200×120×130 | 750 | nee | nee | nee | 10 |
| `van` | Bestelbus | 300×180×190 | 1500 | nee | nee | nee | 20 |
| `box-truck` | Bakwagen met klep | 650×240×240 | 8000 | ja | nee | nee | 30 |
| `tractor` | Trekker-oplegger | 1360×250×280 | 24000 | nee | nee | nee | 40 |

Generiek, zonder merknamen. Tenant past aan naar eigen vloot.

Functie `seed_default_surcharges(tenant_id)`:

| Naam | Type | Bedrag | Dagtype | Tijd | Default actief |
|---|---|---|---|---|---|
| Ochtendtoeslag | PERCENTAGE | 0 | any | 00:00-08:00 | nee |
| Avondtoeslag | PERCENTAGE | 0 | any | 18:00-22:00 | nee |
| Nachttoeslag | PERCENTAGE | 0 | any | 22:00-06:00 | nee |
| Zaterdagtoeslag | PERCENTAGE | 0 | saturday | | nee |
| Zondagtoeslag | PERCENTAGE | 0 | sunday | | nee |
| Feestdagtoeslag | PERCENTAGE | 0 | holiday | | nee |

Bedragen 0 en `is_active = false`, tenant activeert en vult in.

### 6.2 Geen backfill oude orders

Bestaande `shipments.price_total_cents` en oude RCS-specifieke `shipments.pricing` blijven staan. Orders van voor de feature-flag-activering worden niet herberekend. Planner kan handmatig een bedrag zetten als nodig.

### 6.3 Rollback per migratie

Elke migratie heeft een `-- ROLLBACK` comment-blok onderaan met de `DROP` statements. Niet automatisch uitgevoerd, wel gedocumenteerd. Omdat alle nieuwe tabellen leeg starten, is rollback dataverlies-vrij.

## 7. Migratievolgorde

Strikte volgorde, elke stap los deploybaar en in losse commit:

1. **Datamodel**: `vehicle_types`, `order_charges`, `rate_rules.vehicle_type_id`, `surcharges` tijdvensters, helper-functie `is_pricing_engine_enabled`
2. **Seed-functies**: `seed_default_vehicle_types`, `seed_default_surcharges`, aanroepen voor bestaande tenants
3. **Gedeelde motor**: verhuis `pricingEngine.ts` naar `supabase/functions/_shared/`, uitbreiden met voertuigselectie en tijd-toeslagen
4. **Edge Function**: `calculate-order-price`
5. **Integratie call-sites**: `pipeline_events` handler of directe calls in NewOrder / parse-order / create-order (beslissing in Fase 3)
6. **UI stamgegevens**: voertuigtypes-beheer, tariefmotor-toggle
7. **UI orderdetail**: financiële sectie met line_items + order_charges + wachtkosten-dialog
8. **TA-06 factuur-flow**: `billing_email` consumeren in invoice-pad

Sprint 1 is klaar (geverifieerd in `01-research.md`). Geen upstream blocker.

## 8. Risicomatrix en mitigaties

Elk risico krijgt een mitigatie die vóór go-live verifieerbaar is. Geen "zien-we-wel-als-het-misgaat".

### 8.1 Data-integriteit

**R1. Verhuizing `pricingEngine.ts` breekt bestaande imports.**
Dekking: eerste commit is pure verplaatsing + `src/lib/pricingEngine.ts` als re-export-shim. Alle bestaande tests (`src/__tests__/pricingEngine.test.ts`, `pricingEngineConfidence.test.ts`, `invoiceLineBuilder.test.ts`) moeten groen blijven zonder import-changes. Verificatie: `npm test` na commit 1 zonder andere wijzigingen.

**R2. Deno vs Node runtime in shared module.**
Dekking: `_shared/pricingEngine.ts` blijft platte TypeScript, geen Node-only APIs (geen `fs`, `path`, `process.env`). Geen externe imports buiten types. Lint-rule toevoegen, of handmatig gecheckt via `deno check` in dezelfde commit.

**R3. Oude RCS-specifieke `shipments.pricing` snapshots naast nieuwe.**
Dekking: `engine_version` veld in snapshot. UI-renderer in `OrderFinancialSection.tsx` doet discriminated union: als `pricing.engine_version` start met `v2-`, gebruik nieuwe renderer; anders legacy-renderer die `mode: standard|override` + `matrix_tariff` begrijpt. Beide paden getest. Geen migratie van oude data.

**R4. `rate_rules.vehicle_type_id` FK toevoegen breekt bestaande rules.**
Dekking: kolom is `NULL`-toestaand. Motor interpreteert `NULL` als "geldt voor alle voertuigtypes". Bestaande rules blijven werken zonder update. Migratie idempotent (`IF NOT EXISTS`).

**R5. Historische juistheid: wijziging in `rate_cards` herprijst oude orders.**
Dekking: motor wordt bij orderaanmaak één keer aangeroepen, resultaat vast in `shipments.pricing`. UI leest uit snapshot, niet uit live rate_cards. "Herbereken tarief" knop overschrijft snapshot alleen na expliciete bevestiging, en logt oude snapshot in `pipeline_events` (audit). Integration-test in §5.2 dekt dit.

### 8.2 Motor-correctheid

**R6. Motor faalt op order zonder passend voertuigtype.**
Dekking: motor return `{error: "no_vehicle_match", calculated_at, input_summary}` in plaats van exception. Shipment krijgt `price_total_cents = NULL` en `pricing.error` veld. OrderDetail toont rode banner "Tarief niet berekend, geen passend voertuigtype voor deze zending". Planner klikt "Handmatig overschrijven" of past cargo aan en klikt "Herbereken". Order kan wél opgeslagen worden, anders blokkeert de motor de hele flow.

**R7. Motor faalt op klant zonder actieve rate_card.**
Dekking: zelfde pattern als R6. `pricing.error = "no_rate_card"`. UI verwijst naar klantdetail → Tarieven. Tenant-default rate_card (`client_id IS NULL`) fungeert als vangnet als de tenant die configureert.

**R8. Concurrente "herbereken" en orderaanmaak race, plus lock voor handmatige override.**
Dekking: twee niveaus.

1. Motor-updates: Edge function doet `UPDATE shipments SET pricing = $new WHERE id = $id AND (pricing IS NULL OR pricing->>'calculated_at' < $now) AND COALESCE((pricing->>'locked')::boolean, false) = false`. Laatste automatische berekening wint, geen gedeeltelijke overschrijving.
2. Handmatige override: zet `pricing.locked = true` en `pricing.override = {amount_cents, reason, by_user, at}`. Motor-calls skippen dan op de `locked`-conditie. Alleen expliciete "Ontgrendel en herbereken" actie (planner-only, met reden) zet `locked = false`.

Test: twee parallelle curl-calls in §5.2 + test dat een automatische aanroep een locked snapshot niet overschrijft.

**R9. Timezone van `pickup_time` voor tijd-toeslagen.**
Dekking: alle tijden opgeslagen als `TIMESTAMPTZ` (bestaand pattern), motor berekent match in `Europe/Amsterdam` via `AT TIME ZONE` in de helper. Expliciet gedocumenteerd in de motor-code. Test met een order op `2026-05-04 23:30 UTC` (= 01:30 lokaal) tegen nachttoeslag.

**R10. Feestdagen-lijst ontbreekt voor `day_type = 'holiday'` match.**
Dekking: deze sprint geen feestdagen-integratie. `day_type = 'holiday'` rijen staan default op `is_active = false`. Tenant activeert pas als feestdagen-tabel er is. In `03-changelog.md` expliciet genoteerd als schuld naar Sprint 3.

### 8.3 Backend-integratie

**R11. `pipeline_events` handler bestaat niet of werkt niet voor dit event-type.**
Dekking: eerste commit van integratie-stap (stap 5) is verificatie. Als patroon onvoldoende is, fallback naar directe aanroep vanuit drie call-sites (zie §3.2). Dekking is: bij twijfel, kies de expliciete weg. Niet half committen op een onbewezen pattern.

**R12. AI-geparsed orders (via `parse-order`) worden niet automatisch geprijsd.**
Dekking: `parse-order` krijgt in integratie-stap een expliciete aanroep van `calculate-order-price` na succesvolle shipment-creatie. Test: maak via Inbox een order aan, verwacht `shipments.pricing` gevuld binnen 10 seconden.

**R13. Edge function faalt of timeout.**
Dekking: timeout op 30s (default Supabase). Bij fout: `shipments.pricing.error` gevuld, `pipeline_events` rij met stack trace, geen crash bij de caller. Planner ziet banner in OrderDetail. Retry knop handmatig.

**R14. Security: spoofing `order_id` van andere tenant.**
Dekking: Edge function draait onder service role, maar checkt eerst `orders.tenant_id = shipments.tenant_id = client.tenant_id`. Als één van die checks faalt: log security-event en return error. RLS op `order_charges` is tenant-scoped, insert via service role respecteert de `tenant_id` die de function zelf zet uit de order-lookup.

### 8.4 Feature-flag en rollout

**R15. Tenant zet flag aan zonder configuratie (geen vehicle_types, geen rate_cards).**
Dekking: "Tariefmotor inschakelen" toggle in UI is disabled tot tenant minimaal 1 actieve `vehicle_type` en 1 actieve `rate_card` heeft. Check in frontend + in helper-functie server-side (`SELECT can_enable_pricing(tenant_id)`). Toggle toont reden als grijs.

**R16. Nieuwe tenant na deze sprint krijgt geen seed.**
Dekking: aanvullen van bestaande tenant-onboarding flow (`create_tenant` RPC of vergelijkbaar). Eerste commit van seed-stap (stap 2) voegt aanroepen toe aan die flow. Test: maak een nieuwe tenant aan, verwacht `vehicle_types` en `surcharges` rijen.

**R17. RCS merkt feature niet op go-live moment.**
Dekking: go-live is expliciet. Deployment omvat code + default-seed + flag-uit. RCS krijgt losse mail "Tariefmotor staat klaar, activeer in Stamgegevens → Tariefmotor". Geen stille activering.

**R18. Feature-flag uit maar frontend probeert toch motor aan te roepen.**
Dekking: `OrderPricePreview` checkt `useTenantPricingEnabled()` hook voor render, toont "Tariefmotor uit, vul bedrag handmatig in" als uit. Edge function checkt `is_pricing_engine_enabled(tenant_id)` en return `{skipped: true}` als uit. Dubbele check.

### 8.5 Seed en idempotentie

**R19. Seed-functie dubbel uitvoeren maakt duplicaten.**
Dekking: `seed_default_vehicle_types` en `seed_default_surcharges` gebruiken `INSERT ... ON CONFLICT (tenant_id, code) DO NOTHING`. Unique constraint op `(tenant_id, code)` bij voertuigtypes, op `(tenant_id, name)` bij surcharges. Twee keer draaien is een noop.

**R20. Tenant past seed aan, migratie draait opnieuw en overschrijft.**
Dekking: `ON CONFLICT DO NOTHING` (niet `DO UPDATE`). Wat de tenant gewijzigd heeft blijft staan. Seed vult alleen ontbrekende rijen aan.

### 8.6 Facturatie (TA-06)

**R21. `autoInvoicer` gebruikt `clients.email` in plaats van `billing_email`.**
Dekking: helper `getBillingRecipient(client)` in `invoiceUtils.ts` met fallback-logica:

```
if (client.billing_same_as_main) return client.email
return client.billing_email ?? client.email
```

Alle invoice-paden moeten via deze helper. Grep-check in PR: geen directe `client.email` referenties in invoice-code.

**R22. Bestaande klanten hebben geen `billing_email` gevuld.**
Dekking: helper valt terug op `clients.email`. Backward compatible. Wel: klantdetail UI toont waarschuwing "Factuur gaat naar hoofd-e-mail, stel apart factuuradres in" als `billing_email` leeg is.

### 8.7 UI-regressie

**R23. OrderDetail financiële sectie vervangt huidige weergave, oude orders breken visueel.**
Dekking: nieuwe `OrderFinancialSection` rendert beide snapshot-versies (zie R3). Voor orders zonder `shipments.pricing` (vroeg-sprint of flag-uit) toont hij handmatige-bedrag input met huidige styling. Visueel regression check: open 5 historische orders uit verschillende perioden, screenshot-compare.

**R24. `OrderPricePreview` in NewOrder toont verkeerde afstand.**
Dekking: hardcoded `distance_km = 150` fallback wordt verwijderd. Als afstand nog niet bekend (traject nog niet ingevuld), toont preview "Afstand onbekend, tarief pas berekend na opslaan". Geen fake-getallen.

### 8.8 Selectie en uniqueness

**R25. Ambigue rate_card selectie bij meerdere actieve cards per klant.**
Dekking: selectie-algoritme in §2.1 stap 5 is expliciet: scoring op specificiteit (klant-match +1000, traject-match +100, vehicle_type-match +10, basis +1), tie-breaker op `sort_order`. Bij *exacte* gelijkstand na scoring + sort: `error = "ambiguous_rate_cards"` met card-IDs in de snapshot, UI toont "Meerdere even-geldige tarieven, opruimen in klant-tarieven". Geen silent pick.

**R26. Meerdere actieve rate_cards met overlappende periodes voor één klant.**
Dekking: geen harde DB-constraint (rate_cards kunnen legitiem overlappen, bijvoorbeeld periode + traject-specifiek naast algemeen). Wel: UI-check in `ClientRateCard.tsx` die waarschuwt "Je hebt N actieve kaarten die overlappen op Y datum, controleer prioriteit". De scoring uit R25 handelt het op motor-niveau af.

**R27. Pickup_date in verleden leidt tot foute rate_card match.**
Dekking: motor matcht op `order.pickup_date` (zie §2.1 stap 5), niet `now()`. Order die in juli wordt aangemaakt voor een pickup in maart, pakt de rate_card die *in maart* geldig was. Unit-test: maak rate_card geldig 01-jan tot 01-feb, nieuwe rate_card vanaf 01-feb, order met pickup_date 15-jan → motor kiest eerste card ook als now() = 01-mar.

### 8.9 Permissies en audit

**R28. Chauffeur voegt correcties toe buiten z'n bevoegdheid.**
Dekking: RLS-policy op `order_charges` insert:

```sql
CREATE POLICY "drivers_can_only_add_waiting"
ON order_charges FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = get_user_tenant_id()
  AND (
    -- planner/admin: all types
    user_has_role(auth.uid(), ARRAY['admin','planner'])
    OR
    -- driver: only waiting, only own trip
    (charge_type = 'waiting' AND EXISTS (
      SELECT 1 FROM trips t
      JOIN drivers d ON d.id = t.driver_id
      WHERE d.user_id = auth.uid()
      AND t.id IN (SELECT trip_id FROM order_trips WHERE order_id = order_charges.order_id)
    ))
  )
);
```

Als de rol-functies nog niet bestaan in dit project, checken in Fase 3 eerste commit en minimaal `tenant_members.role` uitlezen. Fallback als rollen onduidelijk zijn: strikte policy (alleen planner) en chauffeur-flow uitstellen naar volgende sprint.

**R29. Audit-trail bij handmatig overschrijven ontbreekt.**
Dekking: bij "Handmatig overschrijven" wordt:

1. Vorige snapshot gelogd in `pipeline_events` met `event_type = 'pricing_override'`, body = oude pricing + nieuwe pricing + user_id + reden
2. Nieuwe snapshot krijgt `pricing.override = {amount_cents, reason, by_user, at}` en `pricing.locked = true`
3. UI toont banner "Handmatig overschreven door X op Y met reden Z, klik om te ontgrendelen"

Reden-veld is verplicht in override-dialog. Voldoet aan prompt-regel 9 (auditeerbaarheid).

### 8.10 Currency, precisie, schaal

**R30. Currency mismatch tussen rate_card en order.**
Dekking: scope-beperking deze sprint. Motor valideert `rate_card.currency = 'EUR'` en weigert andere currencies met `error = "unsupported_currency"`. Bestaande kolom blijft voor toekomstige uitbreiding, maar alleen EUR is ondersteund. Schuld naar Sprint N+ gedocumenteerd in `03-changelog.md`.

**R31. Afronding per regel versus op totaal.**
Dekking: motor rekent intern alles in `NUMERIC(12,4)` (rate_rules.amount kolomtype), rondt *alleen* `subtotal_cents` en `total_cents` af op integer cents bij snapshot-serialisatie. Line_items bewaren hun unit_price_cents als integer (al afgerond op input), quantity als numeric. Documenteren als commentaar in `pricingEngine.ts`. Test: 3 rules die elk een .5 cent oplopen moeten 2 cent totaal opleveren, niet 3 (geen dubbele afronding).

**R32. Bulk-aanroepen overbelasten Edge function.**
Dekking: `pipeline_events` handler serialiseert per tenant (één worker tegelijk per tenant, andere tenants parallel). Bij direct-call-fallback (zie §3.2): `calculate-order-price` krijgt een `{order_ids: uuid[]}` batch-variant voor bulk-import. Batch verwerkt intern één-voor-één maar spaart HTTP-overhead. Max batch-size 50 (documenteren). Test: import 100 orders, verwacht alle 100 geprijsd binnen 60s zonder rate-limit errors.

### 8.11 Incident-response en rollout

**R33. Kritieke bug na go-live, motor geeft foute prijzen.**
Dekking: kill-switch zonder migratie-rollback. Stappen:

1. Zet `tenant_settings.pricing.engine_enabled = false` voor getroffen tenant via SQL (of via UI door admin)
2. Nieuwe orders: motor wordt geskipt, planner voert handmatig prijs in
3. Bestaande snapshots blijven leesbaar (UI-renderer heeft `engine_version` discriminated union, oude data ongewijzigd)
4. Na fix: flag weer aanzetten, "Herbereken" op getroffen orders

Gedocumenteerd als runbook in `docs/sprint-2/03-changelog.md` onder "Incident-response". Geen DB-rollback nodig.

**R34. Klant-testplan wordt niet bijgewerkt na oplevering.**
Dekking: staat al in §5.3 als activiteit en in §9 als afvink-item van "Definitie van klaar". Memory-rule: bij elke feature-oplevering klant-testplan uitbreiden in klant-taal, geen dev-jargon. Controle in PR-review: heeft `docs/klant-testplan.md` een nieuw sprint-2 blok?

## 9. Definitie van klaar

Fase 3 is af als alle onderstaande checks kloppen:

- [ ] Alle 8 migratie-stappen gecommit in losse commits met sprint-2-scope
- [ ] `npm test` groen, inclusief nieuwe testsuites voor `vehicleSelector`, `orderCharges`, tijd-toeslagen, TA-06 helper
- [ ] Handmatig testplan (§5.3) doorlopen met screenshots
- [ ] Alle 34 risico-mitigaties geverifieerd (waar testbaar: test gedraaid; waar code: PR-check)
- [ ] `03-changelog.md` opgeleverd met gewijzigde bestanden, testscenario's, seed-data, schulden, RCS-open-items
- [ ] Klant-testplan (`docs/klant-testplan.md`) uitgebreid in klant-taal
- [ ] Feature-flag uit op alle tenants, RCS expliciet geïnformeerd voor activering

## 10. Geschatte changelog

| Bestand | Mutatie |
|---|---|
| `supabase/migrations/20260418_vehicle_types.sql` | Nieuw, tabel + RLS + seed-functie |
| `supabase/migrations/20260418_order_charges.sql` | Nieuw, tabel + RLS |
| `supabase/migrations/20260418_surcharges_time_windows.sql` | Alter, tijdvensters + dagtype |
| `supabase/migrations/20260418_rate_rules_vehicle_type.sql` | Alter, FK toegevoegd |
| `supabase/migrations/20260418_pricing_engine_helper.sql` | Nieuw, `is_pricing_engine_enabled` + `can_enable_pricing` functies |
| `supabase/migrations/20260418_seed_defaults.sql` | Seed voor bestaande tenants |
| `supabase/functions/_shared/pricingEngine.ts` | Nieuw, verplaatst vanuit `src/lib` + uitgebreid |
| `supabase/functions/_shared/vehicleSelector.ts` | Nieuw, kleinste-passend-algoritme |
| `supabase/functions/calculate-order-price/index.ts` | Nieuw, Edge Function |
| `src/lib/pricingEngine.ts` | Re-export-shim vanuit `_shared` |
| `src/types/rateModels.ts` | Uitbreiden, `VehicleType`, `OrderCharge`, time-window types |
| `src/hooks/useVehicleTypes.ts` | Nieuw |
| `src/hooks/useOrderCharges.ts` | Nieuw |
| `src/components/settings/VehicleTypeSettings.tsx` | Nieuw |
| `src/components/settings/PricingEngineToggle.tsx` | Nieuw |
| `src/components/orders/OrderFinancialSection.tsx` | Nieuw, vervangt huidige prijs-weergave in OrderDetail |
| `src/components/orders/OrderPricePreview.tsx` | Refactor, gebruikt shared motor, geen hardcoded waarden |
| `src/components/orders/WaitingCostDialog.tsx` | Nieuw |
| `src/components/clients/ClientRateCard.tsx` | Uitbreiden, vehicle_type_id select per rule |
| `src/lib/invoiceUtils.ts` | `getBillingRecipient(client)` helper |
| `src/lib/autoInvoicer.ts` | Gebruik `getBillingRecipient` |
| `src/pages/OrderDetail.tsx` | Integreer `OrderFinancialSection` |
| `src/pages/NewOrder.tsx` | Trigger edge function bij opslaan, toon preview |
| `src/integrations/supabase/types.ts` | Handmatige update, types voor nieuwe tabellen |
| `src/__tests__/pricingEngine.test.ts` | Uitbreiden met voertuigselectie + tijd-toeslagen |
| `src/__tests__/vehicleSelector.test.ts` | Nieuw |
| `src/__tests__/orderCharges.test.ts` | Nieuw |
| `docs/klant-testplan.md` | Uitbreiden met tariefmotor-scenario's |
| `docs/sprint-2/03-changelog.md` | Bij oplevering |

Schatting, 14 logische commits volgens `sprint-2(scope): wat` formaat.

## 11. Wachten op approval

Dit plan is conform prompt-regel 2. Geen code-wijzigingen in deze fase. Wachten op "ga door" / "akkoord" / "approved" van Badr voor start Fase 3.
