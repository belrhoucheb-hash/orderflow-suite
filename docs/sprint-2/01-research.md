# Sprint 2, Fase 1, Onderzoek

Opgesteld 2026-04-17. Read-only inventarisatie van de codebase tegen de zes requirements TA-01 t/m TA-06. Geen wijzigingen doorgevoerd.

Belangrijke context vooraf: grote delen van de tariefmotor zijn al gebouwd onder andere noemers (Feature 2, Feature 3, §24, §26), maar zonder de TA-nummering of de voorgeschreven fase-gates uit de sprint-prompt. De inventarisatie hieronder mapt bestaande code op de TA-requirements en wijst gaps aan.

## 1. Supabase schema-inventarisatie

### Tariefgerelateerde tabellen die al bestaan

| Tabel | Migratie | Inhoud |
|---|---|---|
| `rate_cards` | `20260404120000_rate_cards_and_surcharges.sql` | `tenant_id`, `client_id` (NULL = tenant-default), `name`, `valid_from`, `valid_until`, `is_active`, `currency`. RLS op tenant. |
| `rate_rules` | idem | Rules binnen een card, `rule_type` enum met `PER_KM`, `PER_UUR`, `PER_STOP`, `PER_PALLET`, `PER_KG`, `VAST_BEDRAG`, `ZONE_TARIEF`, `STAFFEL`. Plus `transport_type`, `amount`, `min_amount`, `conditions` JSONB, `sort_order`. |
| `surcharges` | idem | `surcharge_type` enum (`PERCENTAGE`, `VAST_BEDRAG`, `PER_KM`, `PER_KG`), `applies_to` JSONB voor dag/requirements/wachttijd. RLS op tenant. |
| `client_rates` (legacy) | eerdere migratie | Blijft staan als fallback. `COMMENT` zegt expliciet "LEGACY". |
| `cost_types` + `trip_costs` + `vehicle_fixed_costs` | `20260404130000_cost_allocation.sql` | Kosten-kant (brandstof, tol, chauffeur). Niet klant-tarief. |
| `shipments.price_total_cents` + `shipments.pricing` JSONB | `20260416120000_shipments_pricing.sql` | Totaal in cents plus snapshot van berekening. |

### Tariefvelden op `orders`

Nihil. Er staat geen `price`, `rate` of `total_amount` op `orders`. De prijs wordt op shipment-niveau opgeslagen (`shipments.price_total_cents` + `shipments.pricing`).

### `vehicles` en voertuigtypes

Huidige `vehicles` tabel (`20260214102148_...`) is **instance-level**, een fysiek voertuig:

```
id, code, name, plate, type (tekst), capacity_kg, capacity_pallets,
features (text[]), is_active
```

`type` is een vrij tekstveld (`Sneltransport`, `Distributie`, `Koeltransport`, `Internationaal`). Er is:

- geen `vehicle_types` tabel met `max_length`, `max_width`, `max_height`, `max_weight`, `has_tailgate`, `has_cooling`, `adr_capable`
- geen relatie tussen een voertuig-type en een `rate_card` of `rate_rule` (rate_rules kennen alleen `transport_type` als tekst)
- geen hierarchie "Caddy < Bestelbus < Bakwagen < Trekker" als datamodel

De `shipments.vehicle_type` kolom is een tekst, geen FK. Ingevuld handmatig in NewOrder.

### `shipments` relevante velden voor tariefmotor

Migratie `20260417100000_shipments_form_fields.sql` heeft net veel toegevoegd:

```
contact_person, vehicle_type (tekst), client_reference, mrn_document,
requires_tail_lift (BOOLEAN, default false), pmt JSONB, cargo JSONB
```

`cargo` JSONB bevat per-rij lading-detail: `aantal, eenheid, gewicht, lengte, breedte, hoogte, stapelbaar, adr, omschrijving`. Dat is de bron voor TA-02 voertuigselectie op afmetingen.

`requires_tail_lift` dekt de klep-override uit TA-03. Koeling en ADR staan per cargo-rij (`cargo[].adr`) of in `transport_type` tekst, niet als harde overrides.

### Sprint 1 impact (factuurvelden op clients)

Migratie `20260417140000_client_billing_and_contacts.sql` heeft:

- `clients.billing_email`, `billing_same_as_main`, `billing_address`, `billing_zipcode`, `billing_city`, `billing_country`
- `clients.shipping_*` idem
- Nieuwe tabel `client_contacts` met partial unique index op primary/backup per klant

Dit voldoet aan SG-02 en is de basis voor TA-06.

### Enums, triggers, RPCs

- Geen RPC `calculate_order_price` of equivalent in de DB
- Geen trigger op `orders`/`shipments` die tariefberekening start
- `update_updated_at_column()` trigger op alle nieuwe tabellen aanwezig
- Geen enum-types, alles via `CHECK` constraints

## 2. Frontend-inventarisatie

### Tariefmotor

`src/lib/pricingEngine.ts`. Pure functies, geen Supabase-dependency. Belangrijkste exports: `calculateOrderPrice(input, rateCard, surcharges)` en `calculateWithConfidence(...)`. Getest in `src/__tests__/pricingEngine.test.ts` en `src/test/pricingEngineConfidence.test.ts`.

**Afwijking van prompt-regel 5**: de motor staat op de frontend. Prompt zegt "database function bij voorkeur, niet gedupliceerd op frontend". Dit is een ontwerpkeuze die in Fase 2 expliciet bevestigd of gecorrigeerd moet worden.

### Types

`src/types/rateModels.ts` definieert `RuleType`, `SurchargeType`, `RateCard`, `RateRule`, `Surcharge`, `PricingOrderInput`, `PriceBreakdown`. Compleet en gedocumenteerd.

### Beheer-UI

- `src/components/settings/RateCardSettings.tsx`: CRUD voor rate_cards + rate_rules
- `src/components/settings/SurchargeSettings.tsx`: CRUD voor surcharges
- `src/components/settings/MasterDataSection.tsx`: stamgegevens-container, rate/surcharge tabs hangen hier onder

Geen dedicated UI voor `vehicle_types`, want die tabel bestaat niet.

### Klantdetail

`src/components/clients/ClientRateCard.tsx`: toont en bewerkt de tariefkaart van één klant. Gebruikt `useClientRateCard(clientId)` hook.

### Order-flow

- `src/components/orders/OrderPricePreview.tsx`: toont tariefkaart + toeslagen + totaal op orderdetail. **Let op**: `distance_km` is hardcoded op 150 als fallback (`order.distance_km ?? 150`), stop_count op 2, duration_hours op 3. Dat is een bekende gat.
- `src/pages/NewOrder.tsx`: roept pricing aan en slaat `shipments.price_total_cents` + `shipments.pricing` op
- `src/lib/autoInvoicer.ts`: gebruikt pricingEngine voor auto-facturatie bij trip-completion
- `src/lib/invoiceLinesFromPricing.ts` + `src/lib/invoiceUtils.ts`: factuurregels + NL-formattering

### Validatieschema's

`src/lib/validation/orderSchema.ts`, `clientSchema.ts`, `clientContactSchema.ts`. Geen zod-schema voor `rate_cards` of `surcharges` beheer-UI gevonden (controle-vraag in Fase 2).

### Hooks

- `src/hooks/useRateCards.ts`, incl. `useClientRateCard`
- `src/hooks/useSurcharges.ts`
- `src/hooks/useInvoices.ts`, queries `clients` twee keer (regel 256, 743) maar gebruikt `clients.billing_email` **niet**

## 3. Dependencies op Sprint 1

Sprint 1 is opgeleverd volgens `docs/sprint-1/03-changelog.md` (2026-04-17):

- **OA-01 (department NOT NULL)**: klaar, migratie `20260417140100_orders_department_not_null.sql`
- **OA-02 (auto-afdeling uit traject)**: klaar, `trajectRouter.ts` + NewOrder UI-hint
- **SG-02 (factuur-e-mail en factuuradres op clients)**: **klaar qua datamodel**, maar:

**Aandachtspunt TA-06**: `clients.billing_email` wordt nu door **geen enkele code gebruikt**. Geen match in `src/hooks/useInvoices.ts`, geen match in `supabase/functions/` (gecheckt `send-notification`, `send-confirmation`, `send-follow-up`, `financial-trigger`). Ook geen `send-invoice` edge-function. Dit is geen blocker, het veld bestaat en is gevuld, maar de facturatie-flow consumeert het nog niet. Dat is precies TA-06 scope.

Geen blocker op Sprint 1. Groen licht voor Sprint 2.

## 4. Gap-analyse per requirement

### TA-01, twee tarieftypen per klant (per km of vast per rit)

**Status**: AANWEZIG

**Wat er is**: `rate_cards` + `rate_rules` met `rule_type` enum bevat `PER_KM` en `VAST_BEDRAG`. Een klant kan meerdere rate_cards hebben (model ondersteunt dat, `client_id` is niet unique op rate_cards). Geen expliciete koppeling aan traject op card-niveau, maar rules kennen wel `transport_type` en `conditions.from_zone`/`to_zone`.

**Wat ontbreekt**: UX om per traject een aparte vaste ritprijs te configureren is niet als zodanig ontworpen. Nu zou je een aparte `rate_card` aanmaken met een `VAST_BEDRAG` rule en een `conditions.from_zone`/`to_zone`, maar de UI in `RateCardSettings.tsx` leidt de gebruiker daar niet naartoe. Check in Fase 2 of er een "per traject" flow bedacht is, of dat de huidige structuur volstaat.

**Risico**: geen.

### TA-02, voertuigselectie op kleinste passend voertuig

**Status**: ONTBREEKT

**Wat er is**: `shipments.cargo` JSONB heeft afmetingen per rij. `shipments.vehicle_type` is een handmatig gekozen tekst. `vehicles` tabel heeft alleen `capacity_kg` en `capacity_pallets`, geen L/B/H.

**Wat ontbreekt**:

- Tabel `vehicle_types` met `max_length`, `max_width`, `max_height`, `max_weight`, `sort_order` (hiërarchie)
- Functie `select_smallest_vehicle_type(cargo, requirements)` die uit de matrix kiest
- Integratie in NewOrder zodat de keuze automatisch gebeurt
- Auditeerbare toelichting ("Caddy gekozen op basis van 80×80×80, 5 kg, zonder klep")

**Risico**: voertuigmatrix van RCS moet geleverd. Zonder concrete afmetingen blijft het placeholder.

### TA-03, overrides voor voertuigselectie

**Status**: DEELS

**Wat er is**: `shipments.requires_tail_lift` (BOOLEAN). `shipments.cargo[].adr` per rij. `transport_type` tekst op shipment dekt koeling impliciet.

**Wat ontbreekt**:

- Override-logica (forceer minimaal bakwagen met klep als `requires_tail_lift = true`)
- `has_tailgate`, `has_cooling`, `adr_capable` flags op `vehicle_types`
- UI op orderdetail die uitlegt waarom dit voertuig (bijvoorbeeld "forced door klep-eis")
- `max_height` override voor specifieke zendingen

**Risico**: geen, pure business logic zodra `vehicle_types` er staat.

### TA-04, tijd-toeslagen (dagdelen, dagtypes)

**Status**: DEELS

**Wat er is**: `surcharges` tabel met `applies_to` JSONB ondersteunt `day_of_week`, `requirements`, `waiting_time_above_min`, `transport_type`. `PERCENTAGE` en `VAST_BEDRAG` types.

**Wat ontbreekt**:

- `time_from` / `time_to` kolommen of `applies_to.time_window` JSONB
- Dag-type enum (`weekday`, `saturday`, `sunday`, `holiday`)
- Feestdagen-tabel of integratie
- Seed van een placeholder-tabel (ochtend/avond/nacht + weekend + feestdag)
- Engine-uitbreiding in `pricingEngine.ts` om op basis van `pickup_time` de juiste toeslag te matchen (nu matcht hij alleen op `day_of_week`)

**Risico**: RCS moet de concrete tijden en percentages aanleveren. Placeholder is makkelijk te zetten maar kan later schuiven.

### TA-05, wachtkosten achteraf

**Status**: ONTBREEKT

**Wat er is**: `surcharges.applies_to.waiting_time_above_min` kan een surcharge triggeren, maar dat is conditioneel en wordt bij orderaanmaak niet aangezet. `trip_costs` slaat kosten-kant op maar niet klant-facturatie.

**Wat ontbreekt**:

- Tabel `order_charges` (of uitbreiding `shipments.pricing`) waar planner/chauffeur achteraf een wachtkosten-regel kan toevoegen (tijd × uurtarief of vast bedrag)
- UI in orderdetail → financieel sectie: "Wachtkosten toevoegen" dialog
- Koppeling aan factuur zodat wachtkosten meelopen

**Risico**: bepaalt ook of we `order_charges` als aparte tabel willen (snapshot + add-on kosten, zie volgende punt) of alles in `shipments.pricing` JSONB houden.

### TA-06, factuur naar stamgegevens opdrachtgever

**Status**: DEELS

**Wat er is**: `clients.billing_email` veld bestaat en is zichtbaar in klantdetail.

**Wat ontbreekt**:

- Facturatie-flow gebruikt `billing_email` niet. `useInvoices.ts` en `autoInvoicer.ts` leggen verband met `clients` maar kiezen niet tussen `billing_email` en `email`
- Geen `send-invoice` edge-function, dus onduidelijk welke flow de facturatie-mail daadwerkelijk verstuurt
- Check of PDF-factuur het `billing_address` gebruikt, of het hoofdadres

**Risico**: klein. Eén regel in de invoice-flow plus een helper `getBillingEmail(client)` met fallback naar `client.email` als `billing_same_as_main = true`.

## 5. Kritieke ontwerpkeuzes voor Fase 2

### a. Tariefmotor: DB-function of frontend?

Prompt-regel 5 zegt expliciet "database function bij voorkeur, niet gedupliceerd op frontend". Huidige situatie: motor leeft op frontend in `pricingEngine.ts`. Consequenties van migreren:

- **Voordeel**: single source of truth, motor is altijd gelijk ongeacht caller (edge function, RPC, cron), en kan niet omzeild worden
- **Nadeel**: herschrijf in plpgsql of in Edge Function met Deno, verlies van TypeScript type-safety, testopzet moet opnieuw (pg-tap of integration tests)
- **Alternatief**: Edge Function als wrapper die `pricingEngine.ts` importeert (deelbaar tussen frontend en edge via `supabase/functions/_shared/`)

Voorstel: Edge Function met gedeelde code. Dat respecteert de regel zonder de bestaande tests weg te gooien.

### b. `order_charges` tabel of `shipments.pricing` JSONB uitbreiden?

Prompt noemt expliciet `order_charges` (order_id, type enum, description, amount, created_by, created_at) voor auditeerbaarheid. Huidige implementatie zet alles in `shipments.pricing` JSONB.

- **JSONB houden**: minder tabellen, snapshot al compleet, minder werk
- **`order_charges` tabel**: regels zijn queryable (bijvoorbeeld "toon alle wachtkosten van Q1"), RLS per regel mogelijk, makkelijker toevoegen achteraf (TA-05), `source_description` veld per regel
- Hybride: basisprijs blijft in `shipments.pricing`, add-ons (wachtkosten, tol, extra stops na feit) in `order_charges`

Voorstel: hybride. Snapshot bij orderaanmaak in `shipments.pricing` (bestaande flow blijft), add-ons achteraf als rijen in nieuwe `order_charges` tabel.

### c. `vehicle_types` versus bestaande `vehicles`

Twee aparte concepten:

- `vehicle_types` = prijs-relevant, met afmetingen en feature-flags, beperkte set (4-6 rijen per tenant)
- `vehicles` = fysieke wagen met kenteken, koppeling aan chauffeur, planning

Relatie: `vehicles.vehicle_type_id` FK naar `vehicle_types`. Bestaande `vehicles.type` (tekst) wordt op termijn vervangen, niet direct.

## 6. Openstaande vragen aan Badr (max 5)

1. **Motor-locatie**: akkoord dat we `pricingEngine.ts` als gedeelde code houden (`supabase/functions/_shared/`) en er een Edge Function `calculate-order-price` omheen zetten, zodat de motor formeel één plek is? Of wil je letterlijk een plpgsql-function?

2. **Voertuigmatrix**: starten met default-set Caddy / Bestelbus / Bakwagen (met klep) / Trekker, met placeholder-afmetingen die RCS later overschrijft? Of wachten tot RCS concrete L×B×H per type levert?

3. **Toeslagentabel**: placeholder seeden (ochtend 00-08 +15%, avond 18-22 +20%, nacht 22-06 +30%, zaterdag +10%, zondag +25%, feestdag +50%) of blank laten tot RCS input?

4. **`order_charges` tabel**: akkoord met hybride aanpak (snapshot in `shipments.pricing`, add-ons in nieuwe `order_charges`)? Of alles verhuizen naar `order_charges` en `shipments.pricing` uitfaseren?

5. **Bestaande orders zonder tarief**: leeg laten, retroactief prijzen op basis van de nieuwe motor, of marker `needs_pricing = true`? Dit raakt migratie-scope en eventuele backfill.

## 7. Conclusie

Sprint 2 is **voor circa 60% al gebouwd** onder andere vlaggen. De grootste gaps:

- `vehicle_types` tabel en voertuigselectie-logica (TA-02 + TA-03)
- Dagdeel-toeslagen (TA-04)
- Wachtkosten-flow (TA-05)
- Facturatie-flow die `billing_email` echt gebruikt (TA-06)
- Motor formaliseren als single source of truth (prompt-regel 5)

Geen Sprint 1 blockers. Klaar voor Fase 2 zodra bovenstaande 5 vragen beantwoord zijn.
