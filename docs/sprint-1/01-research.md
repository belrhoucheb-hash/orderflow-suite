# Sprint 1, Fase 1, Onderzoek

Status: **read-only rapport**. Geen code gewijzigd. Bron: `supabase/migrations/*.sql` (alle migraties chronologisch gelezen) en `src/` codebase op commit `6189f8d`.

## TL;DR

Veel van Sprint 1 is al grotendeels gebouwd, maar niet volledig dichtgetimmerd:

- **Departments**, **shipments**, **traject_rules** en de hele leg-splitsing bestaan al (migratie `20260414100000_departments_and_shipments.sql`). `orders.department_id` is al een FK naar `departments`.
- De afdelings-afleiding draait al via `src/lib/trajectRouter.ts` (`inferAfdeling`, `createShipmentWithLegs`) met RCS Export herkenning via DB-seed-rules.
- Er is al een trigger `enforce_department_on_transition` die non-DRAFT orders zonder `department_id` blokkeert, maar **geen harde NOT NULL**.
- `info_status` en `order_info_requests` dekken al "wachten op info" als aparte dimensie.
- `src/pages/Orders.tsx` heeft al filters op status, afdeling en info-status.
- **SG-02 is de grootste gap**: geen factuuradres/factuuremail apart, geen post-adres, geen backup-contactpersoon.

Gap per requirement onderaan. Drie kleine blockerende vragen voor Badr aan het eind.

---

## 1. Supabase schema inventarisatie

Bron: alle migraties in `supabase/migrations/` (94 bestanden tot `20260415210000_drop_dev_anon_bypass.sql`).

### 1.1 `orders`

Geïntroduceerd in `20260211162034_*.sql`, uitgebreid in `20260327152900_multi_tenant_foundation.sql` en `20260414100000_departments_and_shipments.sql`.

Relevante kolommen voor scope:

| Kolom | Type | Default | Constraint |
|---|---|---|---|
| `id` | UUID | `gen_random_uuid()` | PK |
| `tenant_id` | UUID | | NOT NULL, FK `tenants` ON DELETE CASCADE |
| `order_number` | SERIAL | | |
| `status` | TEXT | `'DRAFT'` | CHECK `DRAFT\|PENDING\|PLANNED\|IN_TRANSIT\|DELIVERED\|CANCELLED` |
| `department_id` | UUID | NULL | FK `departments(id)` ON DELETE SET NULL |
| `shipment_id` | UUID | NULL | FK `shipments(id)` ON DELETE SET NULL |
| `leg_number` | INTEGER | NULL | |
| `leg_role` | TEXT | NULL | `OPS_PICKUP \| EXPORT_LEG \| SINGLE` |
| `pickup_address` | TEXT | NULL | |
| `delivery_address` | TEXT | NULL | |
| `info_status` | TEXT | `'COMPLETE'` | CHECK `COMPLETE\|AWAITING_INFO\|OVERDUE` |
| `missing_fields` | TEXT[] | `'{}'` | |
| `priority` | TEXT | `'normaal'` | CHECK `laag\|normaal\|hoog\|spoed` |

Indexes relevant: `idx_orders_department_id`, `idx_orders_shipment_id`, `idx_orders_info_status` (partial WHERE `info_status <> 'COMPLETE'`).

Triggers op orders:

- `update_orders_updated_at`, bumpt `updated_at`.
- `enforce_department_on_transition`, BEFORE INSERT OR UPDATE OF status/department_id. Blokkeert als status != DRAFT en `department_id` NULL is.
- `enforce_order_status_transition`, BEFORE UPDATE OF status. Valideert state-machine.
- `audit_orders`, AFTER INSERT/UPDATE/DELETE, naar `audit_log`.
- `trg_order_info_requests_sync`, via `order_info_requests` tabel, recalculate `info_status`.

RLS op orders: tenant isolation via `current_tenant_id()` voor SELECT/INSERT/UPDATE/DELETE, plus service-role bypass. Pattern is consistent met andere tabellen.

### 1.2 `shipments`

`20260414100000_departments_and_shipments.sql`.

| Kolom | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `tenant_id` | UUID | NOT NULL, FK tenants |
| `shipment_number` | INTEGER | per-tenant via `assign_shipment_number()` trigger |
| `client_id` | UUID | FK `clients` SET NULL |
| `client_name` | TEXT | denormalized |
| `origin_address`, `destination_address` | TEXT | |
| `status` | TEXT | DEFAULT 'DRAFT' |
| `traject_rule_id` | UUID | FK `traject_rules` |
| `notes`, `notes_updated_at` | TEXT, TIMESTAMPTZ | single source of truth voor alle legs |

RLS tenant isolation via `tenant_members` subquery. Service-role bypass aanwezig.

### 1.3 `departments`

Per tenant. Seed per tenant: `OPS` (Operations, `#3b82f6`), `EXPORT` (Export, `#f59e0b`). Unique `(tenant_id, code)`. RLS tenant-isolated.

**Belangrijk voor OA-01**: dit is een lookup-tabel, geen native enum. De `code` is het stabiele identifier. Royalty Cargo tenant heeft nu alleen OPS en EXPORT; IMPORT wordt in de Orders UI wel genoemd als filter, maar is niet in de seed voor RCS.

### 1.4 `traject_rules`

| Kolom | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `tenant_id` | UUID | |
| `name` | TEXT | |
| `priority` | INTEGER | lager is hogere prio |
| `is_active` | BOOLEAN | |
| `match_conditions` | JSONB | `{"pickup_address_contains": [...], "delivery_address_contains": [...], "afdeling_equals": "..."}` |
| `legs_template` | JSONB | array van `{sequence, from, to, department_code, leg_role}` |

Seed per tenant, priority-volgorde:

1. **10**, "Naar RCS Export hub" — delivery-adres bevat `RCS Export/RCS Hub/RCS_EXPORT/Royalty Cargo Export` → 2 legs (OPS_PICKUP + EXPORT_LEG via hub).
2. **15**, "Afdeling=EXPORT" → zelfde 2-leg split.
3. **20**, "Vanuit RCS hub" — pickup-adres bevat RCS → 1 leg EXPORT.
4. **1000** (fallback), "Binnenlands" → 1 leg OPS.

RCS Export hub is dus al expliciet gemodelleerd als intern concept (via `from: "hub"` / `to: "hub"` in `legs_template`).

### 1.5 `clients`

`20260211162034`, uitgebreid met stamgegevens in `20260326175856_*.sql`, tenant-aware gemaakt in `20260327152900_multi_tenant_foundation.sql`.

Huidige kolommen: `id, tenant_id, name, address, zipcode, city, country, contact_person, email, phone, kvk_number, btw_number, payment_terms, is_active, created_at`.

Géén:
- apart factuuradres of factuuremail
- post-adres apart van bezorgadres
- backup-contactpersoon
- aparte `contacts` tabel voor 1:n contactpersonen per klant

Wel wel: `client_locations` (1:n, pickup/delivery aliassen met time-windows en voertuig-constraints) en `client_address_book` (geleerde adres-aliassen met geocoding).

Audit trigger actief. RLS tenant-isolated consistent met orders.

### 1.6 `order_info_requests`

`20260414150000_info_tracking.sql`.

Één rij per (order, veldnaam). `orders.info_status` wordt hieruit afgeleid via `recompute_order_info_status()` trigger. Deze dimensie staat los van de status-state-machine; een PLANNED order kan tegelijk AWAITING_INFO zijn.

### 1.7 Enums en patronen

- Native enum alleen `app_role` (`admin`, `medewerker`).
- Alle overige status/type-velden: TEXT + CHECK. Consistent pattern.
- Departments zijn lookup-tabel. Er is **geen** `department` enum in Postgres.

### 1.8 RLS-pattern

Elke business-tabel:
1. Tenant isolation via `current_tenant_id()` of `tenant_members` subquery, op alle CRUD-operaties.
2. `Service role: <tabel>` voor edge-functions.

Het pattern moet bij SG-02 nieuwe velden niet opnieuw gezet worden (nieuwe kolommen erven RLS van de tabel). Bij een nieuwe `client_contacts` tabel moet het wel.

---

## 2. Frontend inventarisatie

### 2.1 Order-aanmaak, `src/pages/NewOrder.tsx`

Ruim 1100 regels, monoliet op `useState`. Geen `react-hook-form`, geen Zod. Validatie is inline via een `errors: Record<string, string>`-state.

Belangrijke velden die al worden verzameld:
- `afdeling`, wordt zowel handmatig gekozen als via `inferAfdeling(booking)` afgeleid.
- `freightLines[]` voor laden/lossen (multi-row).
- `cargoRows[]` voor lading (multi-row).
- `pickupTimeFrom/To`, `deliveryTimeFrom/To` (luxe pickers uit laatste commit).
- Pricing-blok met overrides en toeslagen.
- `infoFollows[]`, markeert velden waar klant nog info moet nasturen.

Submit-flow:
1. `inferAfdeling(booking)` bepaalt default `afdeling`.
2. `previewLegs(booking)` bouwt een traject-preview.
3. Bevestiging → `createShipmentWithLegs(booking)` maakt één `shipments`-rij + één `orders`-rij per leg, met `department_id` gezet.

Geen dedicated Zod-schema voor orders. Validatie voor verplichte velden zit verspreid in handlers, niet op één plek.

### 2.2 Orderlijst, `src/pages/Orders.tsx`

Filters die er al zijn:
- Status (DRAFT/PENDING/PLANNED/IN_TRANSIT/DELIVERED).
- Order-type (ZENDING/RETOUR/EMBALLAGE_RUIL).
- Afdeling via `useDepartments()` → dropdown toont "Alle/OPS/EXPORT/IMPORT".
- Info-status (open/overdue).
- Zoekveld op ordernummer en klant.

KPI-strip bovenaan met tellers per status, inclusief "Wacht op info". Clickable als quickfilter.

Kolommen: checkbox, order-nr, klant, ophaaladres, afleveradres, gewicht, status-badge, prioriteitsbolletje, datum, label-print-knop. Er is **geen aparte visuele "incompleet"-badge op de rij zelf**, alleen een info-status-kolom en KPI-ticker.

Bulk-export per filter-state (CSV).

### 2.3 Inbox, `src/pages/Inbox.tsx`

Luxe 3-paneel (laatste commit `135af38`): lijst → bron-email → review-form. Validatie in `getFormErrors(form)` met `isValidAddress()` (huisnummer + straat). Per veld confidence-score uit AI-extractie.

Submit maakt orders aan via `createOrderMutation` in `src/hooks/useInbox.ts`.

### 2.4 Planning, `src/pages/Planning.tsx`

DnD-planbord (dnd-kit). Filtert op PENDING/PLANNED. Voertuig-kaarten als dropzones, plus kaart en weekview. Niet primair in scope.

### 2.5 Detail, `src/pages/OrderDetail.tsx`

Inline edit per veld, bevestiging bij PLANNED/IN_TRANSIT/DELIVERED. Afdeling staat tussen de inline-editable velden. Roept `useUpdateOrder()` aan met status-transitie-check.

### 2.6 Klanten UI

- `src/pages/Clients.tsx` + `src/components/clients/ClientDetailPanel.tsx` (6 tabs: Overzicht, Locaties, Tarieven, Orders, Portaal, Emballage).
- `src/components/clients/NewClientDialog.tsx` gebruikt react-hook-form (wel!). Velden: bedrijfsnaam, contactpersoon, telefoon, email, adres, postcode, plaats, KvK, BTW.
- Geen UI voor factuuradres, factuuremail, post-adres, backup-contactpersoon.
- `ClientPortalTab` beheert portaal-users, staat los van stamgegevens-contactpersonen.

### 2.7 State en client

- Supabase client: `src/integrations/supabase/client.ts`, typed via `src/integrations/supabase/types.ts` (auto-generated).
- Server-state: TanStack Query, `QueryClient` staleTime 60s.
- UI-state: voornamelijk `useState` in pages.
- Hooks: `useOrders`, `useOrder`, `useCreateOrder`, `useUpdateOrder`, `useDeleteOrder`, `useInbox`, `useDepartments`, `useOrderInfoRequests`, `useClients`, `useClientPortalUsers`, `useInvoices`, `useVehicles`.

### 2.8 Gedeelde infra

- `react-hook-form` v7.61 + `zod` v3.25 + `@hookform/resolvers` v3.10 in `package.json`. Zijn er, maar alleen sporadisch gebruikt (klanten wel, orders niet).
- Toasts via `sonner`.
- i18n met `i18next` + locale-files `nl/en/de/fr`. Veel hardgecodeerde NL-strings in componenten.
- shadcn/ui volledig geïnstalleerd; `LuxeSelect`, `LuxePicker`, `StatusBadge`, `SortableHeader`, `PageHeader`, `EmptyState` zijn eigen laag.
- Mail-infra: edge-function `supabase/functions/send-notification` kan via SMTP versturen, templates in `notification_templates` tabel, logging in `notification_log`. Twilio voor SMS. Nog géén factuurmail-template.

---

## 3. Gap-analyse per requirement

### OA-01, verplichte afdeling op order

**Status: DEELS**

- Wat er is:
  - `orders.department_id` kolom met FK naar `departments`.
  - Trigger `enforce_department_on_transition` blokkeert non-DRAFT zonder `department_id`.
  - `useDepartments()` hook + dropdown in NewOrder.
  - `createShipmentWithLegs` zet altijd `department_id` per leg via `traject_rules`.
- Wat ontbreekt:
  - Harde `NOT NULL` op `orders.department_id` ontbreekt. DRAFT-orders mogen nu NULL zijn, dus "verdwijnen uit planning" blijft technisch mogelijk zolang een order DRAFT blijft.
  - Frontend-validatie in NewOrder blokkeert niet expliciet op afdeling voordat submit.
  - Bestaande orders zonder `department_id` (als die er zijn, moet gecontroleerd worden) hebben backfill nodig.
- Risico's:
  - Als we NOT NULL hard maken zonder backfill, bestaande DRAFT-orders breken. Backfill via OA-02-regel (inferAfdeling op pickup/delivery-adres) is de voor de hand liggende strategie, met fallback naar OPS bij twijfel.
  - Enforcement via CHECK of NOT NULL is onomkeerbaar in productie zonder migratie.

### OA-02, afdeling afgeleid uit traject

**Status: AANWEZIG**

- Wat er is:
  - `traject_rules` met seed voor RCS Export hub.
  - `inferAfdeling(booking)` in `src/lib/trajectRouter.ts`.
  - Planner-override mogelijk via `afdeling`-dropdown in NewOrder.
- Wat ontbreekt:
  - Lichte check: verschijnt er een duidelijke UI-hint wanneer `afdeling` overruled wordt ten opzichte van de regel? Niet geverifieerd.
  - Er is geen test-suite voor `inferAfdeling`.
- Risico's:
  - Seeds van `traject_rules` staan in de initiële migratie; nieuwe tenants krijgen ze via seed-path automatisch, maar dat pad moet geverifieerd worden (Royalty Cargo heeft ze, nieuwe demo-tenant mogelijk niet).

### OA-03, automatisch traject met RCS Export herkenning

**Status: AANWEZIG**

- Wat er is:
  - `createShipmentWithLegs(booking)` in `src/lib/trajectRouter.ts`.
  - `traject_rules` regels 1–3 herkennen RCS Export als interne hub en splitsen in 2 legs, met juiste `leg_role` en `department_code`.
  - Preview via `previewLegs(booking)` voor NewOrder.
- Wat ontbreekt:
  - Edge cases: lege pickup of delivery, typfouten ("RCS  Export", "rcs-export"), internationaal adres. Niet getest.
  - Een sanity-check in UI die laat zien welke regel gematched is.

### OA-04, orderlijst filterbaar op afdeling, status, "missende informatie"

**Status: AANWEZIG**

- Wat er is:
  - Afdelingsfilter in Orders.tsx via `useDepartments()`.
  - Statusfilter.
  - Info-filter (open/overdue), dekt "missende informatie" functioneel.
- Wat ontbreekt:
  - Label "missende informatie" wordt als "open/overdue" getoond, terminologie kan afwijken van wat Badr bedoelt.

### OA-05, visuele incompleet-indicator op rij

**Status: DEELS**

- Wat er is:
  - `info_status` kolom in de tabel, badges AWAITING_INFO/OVERDUE.
  - KPI-ticker met "Wacht op info".
  - `missing_fields` array per order.
- Wat ontbreekt:
  - Een expliciete rode badge of uitroepteken per rij die in één oogopslag leest als "deze order is incompleet". Nu is het een extra kolom, niet een prominente visuele flag.
  - Koppeling met datumselectie: er is geen datumfilter op de orderlijst zelf (wel op Planning/Inbox), dus "bij datumselectie meteen zien" is niet direct implementeerbaar zonder datumfilter toe te voegen.
- Risico's:
  - Scope-grens: als we een datumfilter toevoegen op Orders.tsx raken we KPI-logica.

### SG-02, stamgegevens klant: factuuradres, factuuremail, post-adres, primaire + backup contactpersoon

**Status: ONTBREEKT**

- Wat er is:
  - `clients.address/zipcode/city/country` (wordt impliciet als bezorg- en factuuradres gebruikt).
  - `clients.email` (één algemene).
  - `clients.contact_person` (één string, alleen naam).
  - `clients.phone`.
- Wat ontbreekt:
  - Aparte `billing_address_*` velden of `is_billing_same_as_main` flag.
  - `billing_email` apart.
  - Optioneel afwijkend post-adres.
  - Minimaal twee contactpersonen (primair + backup) met naam, email, telefoon en rol.
- Risico's:
  - Model-keuze: extra kolommen op `clients` versus aparte `client_contacts` tabel. De laatste is flexibeler (meerdere contacten), en sluit aan bij toekomstige TA-06/PD-03 die gericht mailen.
  - Migratie moet bestaande `contact_person/email` naar het nieuwe model mappen.
  - UI-uitbreiding in `ClientDetailPanel` en `NewClientDialog`, en koppeling aan order-flow (factuur-flow later in TA-06).

---

## 4. Aannames die ik maak (niet blockerend)

- `department_id` wordt NOT NULL op alle orders, ook DRAFT. "Verdwijnen" mag niet kunnen. Backfill via `inferAfdeling` op bestaande rijen, fallback OPS.
- SG-02 wordt gemodelleerd als: extra kolommen op `clients` voor `billing_email`, `billing_address_*` (met `same_as_main` flag), plus nieuwe tabel `client_contacts` voor n contactpersonen met `role` (primair/backup/overig). Sluit aan bij latere factuur-flow en is RLS-consistent.
- Visuele incompleet-indicator wordt een rode puntbadge links in de orderrij (niet een nieuwe kolom), plus tooltip met de missende velden.
- Geen datumfilter toegevoegd aan Orders.tsx in deze sprint. "Bij datumselectie" wordt geïnterpreteerd via bestaande Planning-pagina, waar de incompleet-badge ook zichtbaar moet zijn.
- Nieuwe tenants krijgen `traject_rules` via het bestaande seed-path. We controleren dat expliciet voor de demo-tenant.

## 5. Vragen aan Badr, alleen als echt blockerend

1. **OA-01 strikt of zoals nu?** De huidige trigger blokkeert alleen bij transitie uit DRAFT. De requirement zegt "elke order". Gaan we naar harde `NOT NULL`, ook voor DRAFT? (mijn voorstel: ja).

2. **SG-02 model.** Extra kolommen op `clients` plus `client_contacts` tabel met `role` (primair/backup), of alles als losse kolommen op `clients` (`primary_contact_*`, `backup_contact_*`)? Eerste is uitbreidbaar, tweede simpeler. (mijn voorstel: `client_contacts` tabel).

3. **"Missende informatie" op planning**. De requirement OA-05 noemt "bij datumselectie meteen zichtbaar". Bedoel je de Orderlijst (geen datumfilter nu), of de Planning-pagina? (mijn aanname: Planning-pagina en eventueel een datumfilter in Orders, maar dat laatste is scope-rekking).

---

## 6. Bestanden die in Fase 2/3 waarschijnlijk geraakt worden

**Database:**

- `supabase/migrations/2026MMDDHHMMSS_orders_department_not_null.sql`, nieuw.
- `supabase/migrations/2026MMDDHHMMSS_client_billing_and_contacts.sql`, nieuw.

**Frontend:**

- `src/pages/NewOrder.tsx`, harde validatie op afdeling, UI-hint bij auto vs override.
- `src/pages/Orders.tsx`, incompleet-badge per rij.
- `src/components/planning/*`, incompleet-badge op planningskaart.
- `src/components/clients/NewClientDialog.tsx` + `ClientDetailPanel.tsx`, SG-02 velden + contacten-tab.
- `src/hooks/useClients.ts`, uitbreiden met contactpersonen-CRUD.
- `src/integrations/supabase/types.ts`, regenereren na migratie.

**Lib:**

- `src/lib/trajectRouter.ts`, eventueel test-suite toevoegen voor `inferAfdeling`.

Geen wijzigingen in edge-functions voor deze sprint.

---

**Einde Fase 1.** Wacht op groen licht of beantwoording van de drie vragen voordat Fase 2 (implementatieplan) begint.
