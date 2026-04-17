# Sprint 1, Fase 3, Changelog

Opgeleverd op 2026-04-17. Branch: `main`. Commits `059746a` tot en met `6ca9c81`, plus twee NewOrder-fixes die Badr tussendoor erin heeft gezet (`227f22a`, `6327826`).

## Wat is er opgeleverd

**OA-01**: Elke order is verplicht gekoppeld aan een afdeling, hard afgedwongen in de database plus frontend-validatie.
**OA-02**: Afdeling wordt afgeleid uit traject-adressen via `traject_rules`. Override door planner heeft nu een duidelijke hint.
**OA-03**: `createShipmentWithLegs` genereert automatisch het juiste aantal legs voor RCS Export, via de bestaande traject-rule seed-data.
**OA-04**: Orderlijst filtert op afdeling, status en info-status. Geen nieuwe datumfilter (zoals afgestemd).
**OA-05**: Rode puntbadge naast ordernummer in Orders.tsx en Planning-kaarten, icon-variant in OrderDetail-header. Tooltip toont welke velden mist.
**SG-02**: Klant heeft expliciete factuur-e-mail, factuuradres, post-adres, plus een nieuwe `client_contacts` tabel met primair en backup rol per klant.

## Database migraties

| Bestand | Doel |
|---|---|
| `supabase/migrations/20260417140000_client_billing_and_contacts.sql` | SG-02. Factuur- en post-adresvelden op `clients`, nieuwe `client_contacts` tabel met partial unique per rol, backfill van bestaande `contact_person` naar primair contact. |
| `supabase/migrations/20260417140100_orders_department_not_null.sql` | OA-01. Drie-staps backfill (sibling-leg, RCS-adres, OPS-fallback), sanity-check, en `SET NOT NULL` op `orders.department_id`. |

Draai lokaal met `supabase db reset && supabase db push` of `supabase db push` op bestaande dataset.

## Gewijzigde en nieuwe bestanden

**Nieuw** (12):

- `docs/sprint-1/01-research.md`
- `docs/sprint-1/02-plan.md`
- `docs/sprint-1/03-changelog.md` (dit bestand)
- `supabase/migrations/20260417140000_client_billing_and_contacts.sql`
- `supabase/migrations/20260417140100_orders_department_not_null.sql`
- `src/lib/validation/orderSchema.ts`
- `src/lib/validation/clientSchema.ts`
- `src/lib/validation/clientContactSchema.ts`
- `src/lib/validation/__tests__/clientSchema.test.ts`
- `src/lib/__tests__/orderDisplay.test.ts`
- `src/hooks/useClientContacts.ts`
- `src/components/orders/IncompleteBadge.tsx`
- `src/components/clients/ClientContactDialog.tsx`
- `src/components/clients/ClientContactsSection.tsx`

**Gewijzigd**:

- `src/integrations/supabase/types.ts`, handmatige update voor clients en client_contacts.
- `src/hooks/useClients.ts`, type uitgebreid en `useUpdateClient` toegevoegd.
- `src/hooks/useOrders.ts`, `missingFields` toegevoegd aan mapping.
- `src/pages/NewOrder.tsx`, afdelings-validatie en override-hint.
- `src/pages/Orders.tsx`, incompleet-badge naast ordernummer.
- `src/pages/OrderDetail.tsx`, incompleet-badge in header.
- `src/pages/Planning.tsx`, `missing_fields` meefetchen.
- `src/components/planning/types.ts`, veld toegevoegd.
- `src/components/planning/PlanningOrderCard.tsx`, badge-gedeeld.
- `src/components/planning/PlanningOrderRow.tsx`, badge.
- `src/components/clients/NewClientDialog.tsx`, alle nieuwe SG-02 velden.
- `src/components/clients/ClientDetailPanel.tsx`, billing/shipping weergave, nieuwe Contacten-tab.
- `src/lib/orderDisplay.ts`, helpers `getOrderIncompleteSummary` en `isOrderIncomplete`.
- `src/data/mockData.ts`, `missingFields` op Order-type.
- `src/i18n/locales/nl.json`, nieuwe keys.

## Handmatig testplan

Voer lokaal uit. Resetten van de DB is optioneel; de migraties zijn idempotent genoeg om op een bestaande dataset te draaien.

### 1. Migraties

1. `supabase db push` (of `supabase db reset` voor schoon startpunt).
2. Check dat beide migraties slagen zonder `RAISE EXCEPTION`. Als `orders_department_not_null` faalt, betekent dat er orders zonder `tenant` of zonder OPS-department zijn. Dan eerst checken of `departments` voor elke tenant een OPS-rij heeft.

### 2. OA-01 database-guard

1. Probeer in SQL: `INSERT INTO orders (tenant_id, pickup_address) VALUES (...)` zonder `department_id`. Verwacht: `null value in column "department_id" violates not-null constraint`.

### 3. OA-01 frontend-blok

1. Open `/orders/nieuw`, vul alleen klant en ophaaladres.
2. Laat afdeling leeg.
3. Klik opslaan. Verwacht: foutmelding "Kies een afdeling, wordt normaal automatisch bepaald uit het traject". Andere validatiefouten eronder (gewicht, eenheid enz.).

### 4. OA-02 auto-afleiding

1. Nieuwe order: pickup `Hoofdweg 1, Hoofddorp`, delivery `RCS Export Schiphol`.
2. Check: afdeling-select toont automatisch `EXPORT`, met goud-kleurige hint "Automatisch bepaald op basis van traject".

### 5. OA-02 override-hint

1. Zelfde order, wijzig afdeling handmatig naar `OPS`.
2. Verwacht: amber hint "Overschreven door planner, automatisch zou EXPORT zijn".
3. Klik "Terug naar automatische detectie". Verwacht: hint wordt weer goud.

### 6. OA-03 leg-split

1. Open traject-preview met pickup `Hoofdweg 1`, delivery `RCS Export`.
2. Verwacht: 2 legs getoond, één OPS_PICKUP van pickup naar RCS-hub, één EXPORT_LEG van hub naar delivery.
3. Sla op. Check in DB: één `shipments` rij met `traject_rule_id`, twee `orders` rijen met `leg_number` 1 en 2, elk met correcte `department_id`.

### 7. OA-03 binnenlands

1. Nieuwe order: pickup `Amsterdam`, delivery `Rotterdam`. Verwacht: één leg met `department_id` van OPS.

### 8. OA-04 filters

1. Orders-pagina: filter op afdeling `EXPORT`. Verwacht: alleen EXPORT legs.
2. Combineer met status-filter `PENDING`. Verwacht: AND-filter werkt.

### 9. OA-05 incompleet-badge

1. Maak handmatig (SQL of via bestaande flow) een order met `missing_fields = ARRAY['mrn_document']`.
2. Open Orders.tsx: rode puntbadge links van ordernummer. Hover: tooltip toont "MRN-document".
3. Open `/orders/:id`: rode icon-badge "Incompleet" naast status.
4. Open Planning.tsx op de bijbehorende dag: badge zichtbaar op order-kaart en weekview-rij.

### 10. SG-02 klant aanmaken

1. Klanten > "Nieuwe klant".
2. Bedrijfsnaam, primair contact, algemeen email.
3. Zet factuuradres-toggle uit, vul afwijkend factuuradres en factuur-e-mail.
4. Laat post-adres gelijk.
5. Opslaan. Verwacht: klant verschijnt in lijst.
6. Open detail. Tab "Overzicht" toont factuur-e-mail en factuuradres. Tab "Post-adres" staat als "Gelijk aan hoofdadres".
7. Tab "Contacten": primair contact staat er. Klik "Toevoegen", voeg backup toe.
8. Probeer een tweede primair contact: krijgt toast "Er is al een primair contact voor deze klant".

### 11. SG-02 backfill

1. Voor bestaande klanten met `contact_person` gevuld: na migratie staat er één `client_contacts`-rij met `role='primary'` per klant.
2. SQL check: `SELECT count(*) FROM client_contacts WHERE role='primary';` moet minstens overeenkomen met `SELECT count(*) FROM clients WHERE trim(contact_person) <> '';`.

### 12. Regressie

1. Maak één complete order via Inbox (AI-extractie) door de normale flow. Verwacht: geen breaking changes.
2. Check dat Planning.tsx nog DnD werkt, VRP-solver nog draait.
3. Check dat Clients-pagina nog alle bestaande tabs laadt.

## Unit-tests

20 nieuwe vitest-tests:

```
npx vitest run src/lib/__tests__/orderDisplay.test.ts src/lib/validation/__tests__/clientSchema.test.ts
```

Alle tests moeten groen zijn. Bestaande `trajectRouter.test.ts` (19 tests) is niet aangeraakt en blijft groen.

## Bekende limitaties en schulden

**Naar Sprint 2 door**:

1. De oude kolommen `clients.contact_person`, `clients.email`, `clients.phone` blijven staan voor backwards-compat. Edge-functions (`send-notification`) en oudere hooks gebruiken ze nog. Opruimen zodra mailflows zijn omgeschakeld naar `client_contacts` + `billing_email`.
2. `IMPORT`-afdeling bestaat in de UI-filter maar niet in de Royalty Cargo seed. Daardoor matcht geen `traject_rule` bij afdelings-override `IMPORT`. Toevoegen van een IMPORT department en bijbehorende rule staat op de volgende sprint.
3. Volledige i18n-migratie. De nieuwe keys staan in `nl.json`, maar componenten gebruiken nog hardcoded NL-strings conform huidige stijl.
4. Types.ts handmatig uitgebreid. Bij volgende `supabase gen types` is dit een noop, maar officieel moet een regen draaien op staging.
5. `enforce_department_on_transition`-trigger is met `NOT NULL` deels redundant qua NULL-check. Opruimen (of laten staan als gordel-en-bretels) is een latere beslissing.
6. Factuur-mail template die op `billing_email` richt, komt in Sprint TA-06.
7. POD-mail op stamgegevens-contact komt in Sprint PD-03.

**Niet aangeraakt, bewust buiten scope**:

- Trips, trip_stops, proof_of_delivery, delivery_exceptions hebben nog permissive RLS. Aanscherpen is een aparte sprint.
- Contact-rollen zijn nu `primary | backup | other`. Uitbreiden naar "factuur-contact" of "ops-contact" kan later via dezelfde tabel.

## Geen risico op productie

- De migraties zijn idempotent (`IF NOT EXISTS`, `IF EXISTS` waar nodig, behalve op `SET NOT NULL` wat transactioneel is).
- Geen destructieve wijzigingen, geen data-verlies.
- Rollback per migratie gedocumenteerd in het plan.
