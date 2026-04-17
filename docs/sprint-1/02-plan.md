# Sprint 1, Fase 2, Implementatieplan

Basis: `docs/sprint-1/01-research.md`. Badr akkoord op de drie vragen:

1. OA-01 strikt: `orders.department_id` wordt NOT NULL, ook voor DRAFT.
2. SG-02: aparte `client_contacts` tabel met `role`.
3. OA-05: badges komen op Planning-pagina én in bestaande Orders.tsx, geen nieuwe datumfilter.

Status: **geen code wijzigingen**, alleen plan. Fase 3 start na expliciete akkoord.

---

## 1. Database migraties

Volgorde: eerst SG-02 (niet-brekend), dan OA-01 (NOT NULL met backfill). Naamgeving volgt bestaande conventie (timestamp-prefix uit `supabase/migrations/`). Vandaag is `20260417`, slot `100000` is al gebruikt door `shipments_form_fields`.

### Migratie 1, `20260417140000_client_billing_and_contacts.sql`

**Doel**: SG-02. Expliciete facturatie-velden, optioneel post-adres, aparte tabel voor contactpersonen met rol.

**DDL, deel A, clients uitbreiden**:

```sql
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS billing_email TEXT,
  ADD COLUMN IF NOT EXISTS billing_same_as_main BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS billing_address TEXT,
  ADD COLUMN IF NOT EXISTS billing_zipcode TEXT,
  ADD COLUMN IF NOT EXISTS billing_city TEXT,
  ADD COLUMN IF NOT EXISTS billing_country TEXT,
  ADD COLUMN IF NOT EXISTS shipping_same_as_main BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS shipping_address TEXT,
  ADD COLUMN IF NOT EXISTS shipping_zipcode TEXT,
  ADD COLUMN IF NOT EXISTS shipping_city TEXT,
  ADD COLUMN IF NOT EXISTS shipping_country TEXT;
```

Oude `contact_person/email/phone` blijven staan in deze sprint voor backwards-compat (edge-functions en oudere hooks gebruiken ze). Opruimen pas in een latere sprint.

**DDL, deel B, contacten-tabel**:

```sql
CREATE TABLE public.client_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('primary','backup','other')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_contacts_tenant_client
  ON public.client_contacts (tenant_id, client_id);

CREATE UNIQUE INDEX uniq_client_contacts_primary_per_client
  ON public.client_contacts (client_id)
  WHERE role = 'primary' AND is_active = true;

CREATE UNIQUE INDEX uniq_client_contacts_backup_per_client
  ON public.client_contacts (client_id)
  WHERE role = 'backup' AND is_active = true;
```

De partial unique indexes garanderen: **max één actieve primair, max één actieve backup** per klant. Rol `other` is ongelimiteerd (ruimte voor latere groei).

**Trigger voor `updated_at`**:

```sql
CREATE TRIGGER update_client_contacts_updated_at
BEFORE UPDATE ON public.client_contacts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

**RLS**:

```sql
ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for client_contacts"
  ON public.client_contacts FOR ALL
  TO authenticated
  USING (tenant_id IN (SELECT tm.tenant_id FROM tenant_members tm WHERE tm.user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tm.tenant_id FROM tenant_members tm WHERE tm.user_id = auth.uid()));

CREATE POLICY "Service role full access on client_contacts"
  ON public.client_contacts FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
```

**Backfill**: voor elke bestaande klant met `contact_person` niet-leeg, maak een `client_contacts`-rij met `role='primary'`. Dit is veilig omdat de partial unique niet conflicteert (er is nog niets).

```sql
INSERT INTO public.client_contacts (tenant_id, client_id, name, email, phone, role)
SELECT tenant_id, id, contact_person, email, phone, 'primary'
FROM public.clients
WHERE contact_person IS NOT NULL AND trim(contact_person) <> '';
```

**Rollback**: `DROP TABLE public.client_contacts;` en `ALTER TABLE public.clients DROP COLUMN billing_*, shipping_*;`. Oude kolommen blijven intact, dus geen dataverlies.

### Migratie 2, `20260417140100_orders_department_not_null.sql`

**Doel**: OA-01 strikt. Backfill en daarna NOT NULL.

**Backfill-strategie** (in dezelfde migratie, vóór de ALTER):

Strategie per rij, in volgorde:
1. Als `shipment_id` gezet en een andere leg van hetzelfde shipment heeft wél `department_id`, gebruik die.
2. Anders, pak de eerste matchende `traject_rule` via `pickup_address`/`delivery_address` en neem het `department_code` van leg 1.
3. Fallback: `OPS` van de tenant.

```sql
-- stap 1, kopieer van andere legs van hetzelfde shipment
UPDATE public.orders o
SET department_id = sib.department_id
FROM public.orders sib
WHERE o.department_id IS NULL
  AND o.shipment_id IS NOT NULL
  AND sib.shipment_id = o.shipment_id
  AND sib.department_id IS NOT NULL;

-- stap 2, RCS Export detectie in adres
UPDATE public.orders o
SET department_id = d.id
FROM public.departments d
WHERE o.department_id IS NULL
  AND d.tenant_id = o.tenant_id
  AND d.code = 'EXPORT'
  AND (
    o.pickup_address ILIKE '%RCS Export%' OR
    o.delivery_address ILIKE '%RCS Export%' OR
    o.pickup_address ILIKE '%RCS Hub%' OR
    o.delivery_address ILIKE '%RCS Hub%'
  );

-- stap 3, fallback OPS per tenant
UPDATE public.orders o
SET department_id = d.id
FROM public.departments d
WHERE o.department_id IS NULL
  AND d.tenant_id = o.tenant_id
  AND d.code = 'OPS';

-- sanity check, geen NULL meer
DO $$
DECLARE missing INT;
BEGIN
  SELECT count(*) INTO missing FROM public.orders WHERE department_id IS NULL;
  IF missing > 0 THEN
    RAISE EXCEPTION 'Backfill faalde, % orders zonder department_id', missing;
  END IF;
END$$;

ALTER TABLE public.orders
  ALTER COLUMN department_id SET NOT NULL;
```

**Trigger `enforce_department_on_transition`**: mag blijven staan. Met NOT NULL is zijn NULL-check redundant maar niet schadelijk. Als hij ook andere logica heeft (check tegen ontbrekende shipment, etc.) moet die blijven werken. In Fase 3 verifiëren we zijn body en laten hem intact.

**Rollback**: `ALTER TABLE public.orders ALTER COLUMN department_id DROP NOT NULL;`. Backfilled data blijft staan, geen schade.

### Onomkeerbaar of riskant

- Geen enum-toevoegingen, dus niets echt onomkeerbaar op Postgres-niveau.
- `ALTER COLUMN SET NOT NULL` is reversible maar **scant de hele tabel**. Bij grote `orders`-tabel kort slot. Voor Royalty Cargo is dit verwaarloosbaar (geschat enkele honderden rijen).
- Backfill-UPDATE mag niet crashen halverwege. De drie `UPDATE`s zijn idempotent, maar de sanity-check via `RAISE EXCEPTION` voorkomt dat de `SET NOT NULL` draait op een onvolledige staat.

---

## 2. Backend logic

**Edge Functions**: geen nieuwe. Bestaande `send-notification` blijft ongewijzigd in deze sprint. Factuur-mail-template is Sprint 2+.

**RPC's**: geen nieuwe.

**Validatie-splitsing**:

| Laag | Verantwoordelijkheid |
|---|---|
| DB | `NOT NULL`, `CHECK`, FK, partial unique, RLS, trigger `enforce_department_on_transition` |
| Hook (client-side) | Zod-schema voor NewOrder-submit (nieuw), zodat foutmelding mensvriendelijk is voordat Supabase een 23502 teruggeeft |
| UI | visueel verplicht-sterretje, disabled submit-button met tooltip |

Nieuwe Zod-schema's:

- `src/lib/validation/orderSchema.ts`: `orderInputSchema` met minimaal `pickup_address`, `delivery_address`, `quantity > 0`, `weight_kg > 0`, `department_id` UUID.
- `src/lib/validation/clientSchema.ts`: `clientInputSchema` met `name` verplicht, `billing_email` email-format als `billing_same_as_main=false`, adressen verplicht als respectievelijke `same_as_main=false`.
- `src/lib/validation/clientContactSchema.ts`: `name` verplicht, `role` in enum, `email` email-format als aanwezig.

---

## 3. Frontend wijzigingen

### 3.1 Orders, OA-01 en OA-05

`src/pages/NewOrder.tsx`:
- Inline validatie voor `afdeling` leeg voor submit blokkeren.
- UI-hint naast afdelings-select: "Afgeleid uit traject" (neutraal) of "Overschreven door planner" (amber), gebaseerd op of `inferAfdeling(booking)` hetzelfde resultaat geeft.
- Submit-button disabled zolang verplichte velden ontbreken, met tooltip die ze opsomt.

`src/pages/Orders.tsx`:
- Toevoegen visuele incompleet-indicator: rode puntbadge naast ordernummer in kolom 1 als `info_status !== 'COMPLETE'` OR `missing_fields.length > 0`.
- Tooltip op de badge toont een lijst met de ontbrekende velden (uit `missing_fields`) plus info-status-tekst.
- Geen nieuwe datumfilter.

`src/components/planning/*`:
- `PlanningUnassignedSidebar` en kaart-componenten voor orders op vehicle-cards krijgen dezelfde puntbadge + tooltip.
- Helper-functie in `src/lib/orderDisplay.ts`: `isOrderIncomplete(order): boolean` en `getIncompleteFields(order): string[]`, gedeeld door Orders.tsx en Planning.

### 3.2 Klanten, SG-02

`src/components/clients/NewClientDialog.tsx`:
- Uitbreiden met secties:
  - **Bedrijfsgegevens** (bestaand).
  - **Facturatie**: `billing_email`, toggle `billing_same_as_main`, als uit: adresvelden.
  - **Post-adres**: toggle `shipping_same_as_main`, als uit: adresvelden.
  - **Contactpersonen**: inline add-formulier voor primair (verplicht) en backup (optioneel) bij aanmaak.
- Omzetten naar `react-hook-form` + Zod (infra is er al). NewClientDialog gebruikt al RHF volgens Fase-1 onderzoek, dus dit is een uitbreiding, geen herschrijving.

`src/components/clients/ClientDetailPanel.tsx`:
- "Overzicht"-tab uitbreiden: facturatie-sectie en post-adres-sectie (inline editable, zelfde pattern als huidige velden).
- "Contactpersonen"-tab (nieuw of uitgebreide Overzicht-sectie): lijst van `client_contacts`, knoppen "Primair instellen", "Backup instellen", "Deactiveren". Primair en backup kunnen verwisseld worden.

Nieuwe componenten, herbruikbaar:
- `src/components/clients/ClientBillingSection.tsx`: display + inline edit van facturatie-velden.
- `src/components/clients/ClientShippingSection.tsx`: post-adres.
- `src/components/clients/ClientContactsSection.tsx`: lijst + CRUD.
- `src/components/clients/ClientContactDialog.tsx`: add/edit modal.

### 3.3 Hooks

`src/hooks/useClients.ts`:
- `Client`-type uitbreiden met `billing_*`, `shipping_*`, `billing_same_as_main`, `shipping_same_as_main`.
- Create/update mutations aanpassen om nieuwe velden door te geven.

`src/hooks/useClientContacts.ts` (nieuw):
- `useClientContacts(clientId)` voor SELECT.
- `useCreateClientContact`, `useUpdateClientContact`, `useDeleteClientContact`.
- `useSetPrimaryContact(contactId)` en `useSetBackupContact(contactId)`: transactioneel (oude primair/backup wordt `other`, nieuwe krijgt de rol).

### 3.4 Types

`src/integrations/supabase/types.ts` wordt geregenereerd via `supabase gen types typescript` na de migraties. Dit is een auto-gegenereerd bestand.

### 3.5 UX-keuzes, compact

- Incompleet-badge: 8px rode cirkel met wit uitroepteken, links van ordernummer. Hover toont velden. Identiek op Orders.tsx, Planning-kaarten en (extra) OrderDetail-header.
- Afdeling-override-hint: kleine muted-tekst onder het `afdeling`-select, amber kleur bij override. Geen aparte knop, gewoon informatief.
- Facturatie-sectie op klant: collapse-default dicht als `same_as_main=true`. Openklap als toggle uit.
- Contactpersonen: kleine kaartjes met Rol-badge (`Primair` grijs-goud, `Backup` grijs, `Overig` neutraal). Conform luxe-design-laag tokens.

### 3.6 i18n

Nieuwe NL-labels komen in `src/i18n/locales/nl.json`. Veel hardgecodeerde tekst blijft conform huidige stijl, maar nieuwe labels voor Facturatie, Post-adres, Contactpersonen, Primair/Backup gaan via locale-file. Geen volledige i18n-refactor in deze sprint.

---

## 4. Testplan

### 4.1 Edge cases, automated waar praktisch

Bestaande test-setup: `npx vitest` in `package.json`. Unit-tests op pure helpers zonder Supabase-mocks.

Nieuwe tests:
- `src/lib/trajectRouter.test.ts`: tests voor `inferAfdeling`:
  - traject "Amsterdam → RCS Export" → afdeling `EXPORT`, 2 legs.
  - traject "Amsterdam → Tilburg" → afdeling `OPS`, 1 leg.
  - traject met lege delivery → `OPS` fallback (of error, afhankelijk van bestaande gedrag, te bevestigen in uitvoering).
  - casing-insensitive: "rcs export" → `EXPORT`.
- `src/lib/orderDisplay.test.ts`: `isOrderIncomplete` en `getIncompleteFields`.
- `src/lib/validation/clientSchema.test.ts`: `billing_email` vereist als `same_as_main=false`, email-format check.

Geen integration-tests tegen Supabase in deze sprint; validatie van DB-constraints gebeurt via handmatig testplan.

### 4.2 Handmatig testplan voor Badr

Op `main` na Fase 3, met lokaal `supabase db reset && supabase db push`:

1. **OA-01 frontend blok**: open `/orders/nieuw`, laat `afdeling` leeg, probeer op te slaan. Verwacht: knop disabled met tooltip "Afdeling ontbreekt".
2. **OA-01 DB-guard**: via DB `INSERT INTO orders (tenant_id, pickup_address, delivery_address, status) VALUES (...)` zonder `department_id`. Verwacht: `NOT NULL violation`.
3. **OA-02 auto-afleiding**: NewOrder met pickup "Hoofddorp", delivery "RCS Export Amsterdam". Verwacht: `afdeling=EXPORT` automatisch, hint "Afgeleid uit traject".
4. **OA-02 override**: zelfde order, kies manueel OPS. Verwacht: hint wordt amber "Overschreven door planner". Submit lukt, gekozen afdeling staat in DB.
5. **OA-03 split**: NewOrder "Amsterdam → RCS Export". Preview toont 2 legs, beide met juiste `department_id` (OPS voor leg 1, EXPORT voor leg 2). `shipments`-record met `traject_rule_id` gevuld.
6. **OA-03 binnenlands**: "Amsterdam → Tilburg". Preview 1 leg, `department_id=OPS`.
7. **OA-04 filters**: Orders-pagina, filter op afdeling `EXPORT`. Verwacht: alleen EXPORT-orders. Combinatie met status-filter werkt.
8. **OA-05 badge**: maak order met ontbrekend MRN-veld (markeer info-follow). Verwacht: rode badge naast ordernummer in Orders.tsx én op planning-kaart. Tooltip toont "MRN".
9. **SG-02 klant aanmaken**: Klanten-pagina, nieuwe klant. Vul bedrijfsgegevens + factuur-adres (ander dan hoofdadres) + primair contact + backup contact. Opslaan lukt. Heropen: waardes staan er.
10. **SG-02 uniqueness**: probeer 2 primaire contacten voor één klant. Verwacht: tweede wordt geweigerd door unique-index, met begrijpelijke foutmelding.
11. **Migratie-backfill**: clone prod-achtige dataset (of kijk naar staging), check dat elke order na migratie een `department_id` heeft.

### 4.3 Regression checks

- Bestaande orders-flow (Inbox → order → planning → POD) mag niet kapot. Loop één email-naar-order flow door na Fase 3.
- Klant-portaal-tab, tarief-tab, emballage-tab op `ClientDetailPanel` niet raken.

---

## 5. Migratievolgorde en risico

**Deploy-volgorde** (lokaal en staging):

1. Branch `sprint-1-data-integrity` maken, PR pas openen na Fase 3.
2. Migratie 1 (`client_billing_and_contacts`) draaien, losstaand testen.
3. Frontend SG-02 wijzigingen toevoegen, testen.
4. Migratie 2 (`orders_department_not_null`) draaien, op gekopieerde dataset eerst.
5. Frontend OA-01/04/05 wijzigingen.
6. Laatste regressie-run.

**Risico's tijdens deploy**:

- Als iemand tijdens deploy een DRAFT-order aanmaakt tussen backfill-moment en `SET NOT NULL`: de INSERT mist `department_id` → migratie faalt. Mitigatie: de backfill + `ALTER` staan in één migratie, één transactie. Postgres serializeert dit. Op productie kort maintenance-window tijdens deploy is aan te raden, maar voor RCS (single-tenant, laag volume) niet nodig.
- Frontend-code die nog geen `department_id` meestuurt na de migratie: CREATE orders breekt. `createShipmentWithLegs` stuurt `department_id` al mee, dus geen probleem. Directe `supabase.from('orders').insert()` zonder department ergens anders (bulk-import, edge-functions) moet gecheckt worden. Actiepunt voor Fase 3: grep naar `.from("orders").insert` en `.from('orders').insert`, en valideer elke callsite.

**Onomkeerbaar**:
- Partial unique indexes op `client_contacts` zijn reversible (DROP INDEX).
- Geen enum-mutaties, geen kolom-drops, geen data-verlies in rollback-pad.

---

## 6. Geschatte changelog

Nieuwe bestanden:

- `supabase/migrations/20260417140000_client_billing_and_contacts.sql`, migratie SG-02.
- `supabase/migrations/20260417140100_orders_department_not_null.sql`, migratie OA-01.
- `src/hooks/useClientContacts.ts`, CRUD-hooks voor contactpersonen.
- `src/lib/validation/orderSchema.ts`, Zod-schema voor order-input.
- `src/lib/validation/clientSchema.ts`, Zod-schema voor klant-input incl. billing/shipping.
- `src/lib/validation/clientContactSchema.ts`, Zod voor contactpersoon.
- `src/components/clients/ClientBillingSection.tsx`, facturatie display + edit.
- `src/components/clients/ClientShippingSection.tsx`, post-adres display + edit.
- `src/components/clients/ClientContactsSection.tsx`, lijst + CRUD.
- `src/components/clients/ClientContactDialog.tsx`, add/edit modal.
- `src/lib/trajectRouter.test.ts`, unit-tests `inferAfdeling`.
- `src/lib/orderDisplay.test.ts`, unit-tests incompleet-helpers.
- `src/lib/validation/clientSchema.test.ts`, unit-tests Zod.

Gewijzigde bestanden:

- `src/pages/NewOrder.tsx`, afdelings-validatie en override-hint.
- `src/pages/Orders.tsx`, incompleet-badge per rij.
- `src/pages/OrderDetail.tsx`, incompleet-badge in header (klein).
- `src/components/planning/PlanningUnassignedSidebar.tsx`, badge.
- `src/components/planning/PlanningVehicleCard.tsx`, badge op order-kaart.
- `src/components/planning/*OrderCard*.tsx`, badge, naam exact te bepalen in Fase 3.
- `src/lib/orderDisplay.ts`, helpers `isOrderIncomplete` en `getIncompleteFields`.
- `src/hooks/useClients.ts`, type uitbreiden, create/update met nieuwe velden.
- `src/components/clients/NewClientDialog.tsx`, secties facturatie, post-adres, contactpersonen.
- `src/components/clients/ClientDetailPanel.tsx`, facturatie/post-adres in Overzicht, contactpersonen-tab.
- `src/integrations/supabase/types.ts`, regenereren.
- `src/i18n/locales/nl.json`, nieuwe labels.

Schatting: ongeveer 15 bestanden gewijzigd, 12 nieuwe bestanden, 2 migraties. Geen edge-function wijzigingen.

---

## 7. Commits in Fase 3

Gepland per logische stap, NL commit-messages volgens huidige style:

1. `sprint-1(db): client billing-velden en client_contacts tabel`
2. `sprint-1(db): orders department_id NOT NULL met backfill`
3. `sprint-1(types): regenereer supabase types na migraties`
4. `sprint-1(validation): zod-schemas voor order, client, client_contact`
5. `sprint-1(clients): billing en shipping secties in NewClientDialog en detailpanel`
6. `sprint-1(clients): client_contacts CRUD-hook en UI`
7. `sprint-1(orders): afdelings-validatie en override-hint in NewOrder`
8. `sprint-1(orders): incompleet-badge op orderlijst en orderdetail`
9. `sprint-1(planning): incompleet-badge op planning-kaarten`
10. `sprint-1(test): unit-tests voor inferAfdeling en incompleet-helpers`
11. `sprint-1(i18n): NL-labels voor Sprint 1 UI`

---

**Einde Fase 2.** Wacht op akkoord ("ga door" / "akkoord" / "approved") voordat Fase 3 start.
