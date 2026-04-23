# Audit, Stamgegevens-tab

**Datum:** 2026-04-23
**Bekeken bestanden:** 9

## Bekeken bestanden

- `src/pages/Settings.tsx` (tab-router rond `value="stamgegevens"`)
- `src/components/settings/MasterDataSection.tsx` (hoofdcomponent, bevat ladingeenheden, transportvereisten, warehouses en PlanningV2Toggle)
- `src/components/settings/LoadingUnitDialog.tsx`
- `src/components/settings/RequirementTypeDialog.tsx`
- `src/components/settings/PlanningV2Toggle.tsx`
- `src/hooks/useSettings.ts` (tenant_settings load/save)
- `src/hooks/useWarehouses.ts` (warehouse CRUD zonder toast-feedback)
- `src/App.tsx` (RoleGuard op /settings-routes)
- `supabase/migrations/20260419000000_baseline.sql` (tabel- en RLS-definities)

## Samenvatting

De stamgegevens-tab doet het basale werk, CRUD op drie tabellen (ladingeenheden, transportvereisten, warehouses) plus een feature-toggle voor planbord-clustergrootte. De functionele laag werkt, maar de tab heeft vier structurele problemen: (1) hard delete met CASCADE naar `packaging_movements` en zonder bevestigingsdialoog, (2) een inconsistentie tussen sidebar-gating (admin-only) en route-gating (admin+planner) waardoor planners via directe URL stamgegevens kunnen bewerken, (3) drie verschillende CRUD-UI-patronen in één tab zonder empty states of keyboard-bereikbare knoppen, en (4) geen context-gebruik: de tab weet niet hoe vaak een stamgegeven wordt gebruikt en durft dus geen "archiveren" voor te stellen. Laaghangend fruit: confirm-dialog + archive-pattern, rol-guard aligneren, usage-teller per item.

## Score-overzicht

| Aspect            | Score | Kern-observatie                                                                          |
| ----------------- | ----- | ---------------------------------------------------------------------------------------- |
| CRUD volledigheid | 🟡    | CREATE/READ/UPDATE werken; DELETE is hard + cascadet + zonder confirm                     |
| UI / UX kwaliteit | 🟡    | Drie inconsistente patronen, hover-only knoppen, "wees voorzichtig" zonder confirm       |
| Performance       | 🟢    | Lijsten klein, sort op server, wel dubbele round-trip per mutatie (profile-lookup)       |
| Security          | 🟡    | RLS in orde, maar RoleGuard en sidebar zijn niet aligned, planner kan stamgegevens wijzigen |
| Slimheid          | 🔴    | Geen usage-feedback, geen smart defaults, geen archive-pattern, geen suggesties          |

## Bevindingen per fase

### 1. CRUD-functionaliteit

**CREATE**

- Werkt voor alle drie de secties via upsert (`MasterDataSection.tsx:115, 153`) of insert (`useWarehouses.ts:44`).
- 🔴 **Silent-overwrite bij dupe code**: `upsert` met `onConflict: "tenant_id,code"` op nieuwe ladingeenheid met bestaande code overschrijft de oude zonder waarschuwing (`MasterDataSection.tsx:117`). Pre-check op unique code ontbreekt.
- ⚠️ Per mutatie een extra round-trip: `supabase.auth.getUser()` + `profiles.select("tenant_id")` voor tenant (`MasterDataSection.tsx:98-104` en `:136-141`). De `useTenant()` context uit `src/contexts/TenantContext.tsx` heeft dit al.
- ⚠️ Geen CHECK-constraint of Zod: negatief `default_weight_kg` is mogelijk (`LoadingUnitDialog.tsx:36-40` accepteert elk eindig getal).

**READ**

- ✅ Werkt, gesorteerd op `sort_order` (`MasterDataSection.tsx:61, 73`).
- ⚠️ `sort_order`-kolom bestaat maar de UI biedt geen manier om items te herordenen, dus rijen komen in insert-volgorde.
- ⚠️ Geen `staleTime` op de beide query-keys (`MasterDataSection.tsx:56, 68`); master data die zelden wijzigt refetcht bij elke mount.
- ⚠️ QueryKeys bevatten geen `tenant_id` (`MasterDataSection.tsx:56, 68`); bij tenant-wissel blijft stale data in cache. Voor single-tenant-per-user in praktijk onschuldig, maar breekt zodra multi-tenant switching in scope komt.

**UPDATE**

- Code-veld is disabled bij edit (`LoadingUnitDialog.tsx:78`, `RequirementTypeDialog.tsx:72`). Dus een typfout in code is niet meer corrigeerbaar zonder delete+recreate.
- ⚠️ Upsert zonder `id` in payload (`MasterDataSection.tsx:107-113`). Praktisch geen bug omdat `code` immutable is, maar het patroon is broos: verwijder de code-disable en rename-edits maken stille duplicates.
- ⚠️ `is_active`-kolom bestaat in DB (`baseline.sql:1405-1414` voor loading_units, analoog voor requirement_types) maar er is geen UI om items te (de)activeren. Dit dwingt hard-delete als enige optie.

**DELETE**

- 🔴 **Geen confirmatie-dialoog** op alle drie de secties (`MasterDataSection.tsx:265, 346, 484-486`). Eén klik = weg.
- 🔴 **CASCADE naar `packaging_movements`**: `baseline.sql:3940` definieert `packaging_movements.loading_unit_id FK ... ON DELETE CASCADE`. Eén druk op de verwijder-knop wist dus álle historische bewegingen van die ladingeenheid bij alle klanten. Data-verlies-risico.
- ⚠️ De info-box "Over Stamgegevens" (`MasterDataSection.tsx:363-374`) schrijft letterlijk "Wees voorzichtig bij het verwijderen" terwijl er geen drempel is. Woord en daad sporen niet.
- ⚠️ Bij `warehouses`-delete: geen toast-feedback (`useWarehouses.ts:71-83`), geen cascade-waarschuwing, terwijl `traject_rules` per memory ``project_configurable_warehouse`` naar warehouses matchen. Stil breken van routing-regels mogelijk.

### 2. UI / UX

- 🔴 **Hover-only edit/delete knoppen**: `opacity-0 group-hover:opacity-100` op regels 244, 325, 481, 484 van `MasterDataSection.tsx`. Op tablet, touch, en via keyboard-focus onzichtbaar. Toegankelijkheidsprobleem en puur desktop-gericht.
- 🔴 **Geen empty state** voor ladingeenheden en transportvereisten (`MasterDataSection.tsx:232, 312`), waar wel netjes voor warehouses (`:491-497`). Een lege tenant ziet enkel tabel-headers zonder uitleg.
- ⚠️ **Drie UX-patronen in één tab**: ladingeenheden via dialog, transportvereisten via dialog, warehouses via inline-row met Check/X (`MasterDataSection.tsx:444-471`). Kies er één.
- ⚠️ Categorie in `RequirementTypeDialog.tsx:80-85` is een vrij-tekstveld. Default `"transport"` wordt als placeholder gezet, maar elke typo veroorzaakt een nieuwe silo. Zou een Select moeten zijn (`transport`, `equipment`, `documentatie`, `veiligheid`) uit een enum.
- ⚠️ Kleur is een hex-string-veld zonder picker (`RequirementTypeDialog.tsx:89-94`). `<input type="color">` kost 1 regel en lost dat op.
- ⚠️ **PlanningV2Toggle past niet onder Stamgegevens**: het is een planning-configuratie, geen master data (`MasterDataSection.tsx:194-197`). Hoort logischer onder "Algemeen" of een nieuwe "Planning"-tab.
- ⚠️ Geen dirty-check: dialog sluiten met ingevulde velden gaat stil verloren (`LoadingUnitDialog.tsx`, `RequirementTypeDialog.tsx`).
- ⚠️ Geen zoek- of filterveld op lijsten; OK zolang er <30 items zijn, maar geen faciliteiten voor groei.
- ✅ Loading state (`MasterDataSection.tsx:169-174`) is consistent en Nederlandstalig.
- ✅ Toast-feedback bij loading_units en requirement_types (`:86, 124, 162`), maar niet bij warehouse-mutaties (ontbreekt in `useWarehouses.ts`).

### 3. Performance

- ⚠️ **Dubbele round-trip per mutatie**: `supabase.auth.getUser()` + `profiles.select("tenant_id")` voor elke upsert (`MasterDataSection.tsx:98-104, 136-141`). `useTenant()` context is al gevuld. Besparing: ~200-400 ms per save.
- ⚠️ **Geen staleTime**: beide queries (`MasterDataSection.tsx:55, 67`) refetchen bij elke remount. Voor zelden-veranderende stamdata is `staleTime: 5 * 60_000` passend.
- ⚠️ `useWarehouses.ts:24` gebruikt `supabase as any`, wat type-safety omzeilt maar geen performance-impact heeft, wel onderhoud-risico.
- ✅ Sort op server (`ORDER BY sort_order`), geen virtualisatie nodig gezien schaal.
- ✅ Geen N+1, geen dure joins, geen realtime-subscriptions die overkill zijn.

### 4. Security

- 🔴 **RoleGuard vs sidebar-gating inconsistent**:
  - `src/App.tsx:135-137` staat `/settings` en `/settings/stamgegevens` toe voor `["admin", "planner"]`.
  - `src/App.tsx:19` commentaar zegt: "planner: everything except admin-only (/settings, /users)".
  - `src/components/AppSidebar.tsx:192` toont settings alleen als `isAdmin`.
  - Netto: een planner ziet de tab niet in de sidebar, maar kan via directe URL `/settings/stamgegevens` stamgegevens bewerken. Kies één bedoeling en align comment, RoleGuard en sidebar.
- ✅ RLS aanwezig: `Tenant isolation: loading_units ALL/SELECT` (`baseline.sql:4641, 4645`), idem voor `requirement_types` (`:4681, 4685`).
- ✅ Service-role policy expliciet (`:4445, 4461`).
- ⚠️ **Data-verlies via CASCADE**: `packaging_movements_loading_unit_id_fkey ... ON DELETE CASCADE` (`baseline.sql:3940`). Admin met typo wist historische data.
- ⚠️ Geen server-side validatie (CHECK-constraints) op `default_weight_kg`, geen Zod-schema aan client-kant. Negatieve of absurd grote getallen komen door.
- ⚠️ `supabase as any` in `useWarehouses.ts:24-25, 42, 58, 75` schakelt generated types uit. Geen directe kwetsbaarheid, wel verborgen toekomstige bugs bij DB-wijzigingen.
- ✅ Geen secrets in frontend, geen raw SQL, geen XSS-vectoren gevonden (alles is tekst in cellen via React).

### 5. Slimheid

De tab is een "formuliertje om records te typen". Niks mee-denkend. Voorbeelden wat nu ontbreekt:

- Geen usage-telling: "Europallet, gebruikt in 234 orders deze maand". Zonder dat kan een admin niet beoordelen of een item weg mag.
- Geen auto-slug voor code bij invullen naam: `"Rolcontainer klein"` → voorstel `rolcontainer-klein`, nu moet de gebruiker het zelf typen (wel lowercase+replace spatie in `LoadingUnitDialog.tsx:77`, maar geen auto-afleiding van naam).
- Geen archive-pattern: "item X is in gebruik. In plaats van verwijderen, archiveer?" DB heeft `is_active` al (`baseline.sql:1405-1414`).
- Geen standaard-seed-controle: bij tenant-creatie zou een NL-standaardset (Europallet/EU6 pallet/Rolcontainer/IBC voor loading_units; ADR/Koeling/Laadklep/Pharma voor requirement_types) ingeladen moeten worden. Bestand `supabase/migrations/20260419000500_seed_defaults.sql` seedt vehicle_types en surcharges per tenant, maar niet de stamdata hier.
- Geen kleur-palet in UI (hex-tekst is voor developers, niet voor admins).
- Geen categorie-enum, dus silo's ontstaan door typos.

**Laaghangend fruit (1-2 dagen):**

1. Confirm-dialoog + archive-pattern in één pass: vervang de prullenbakknop door "archiveer" (`is_active=false`); toon bij klik een preflight die tegelijk het huidige gebruik toont ("234 orders, 12 bewegingen"). Hard delete alleen beschikbaar voor admin via een "verwijder definitief" in een sub-menu, en dan met ingetypte bevestiging.
2. Usage-teller per item: één extra query (count op gerelateerde FK) en een chip naast de naam. Daarna kan je proactief voorstellen: "5 ladingeenheden zijn 90 dagen niet gebruikt, archiveer?".

## Prioriteitenlijst — top 10 acties

| #  | Titel                                                            | Type       | Effort | Impact | Bestand(en)                                                                                     |
| -- | ---------------------------------------------------------------- | ---------- | ------ | ------ | ----------------------------------------------------------------------------------------------- |
| 1  | Confirm-dialoog vóór DELETE in alle drie de secties              | Bug/UX     | S      | hoog   | `src/components/settings/MasterDataSection.tsx:265,346,484`                                     |
| 2  | Archive-pattern (`is_active=false`) i.p.v. hard delete           | Feature    | M      | hoog   | `src/components/settings/MasterDataSection.tsx`, hoeft geen migratie voor loading/req, wel voor warehouses verifiëren |
| 3  | RoleGuard aligneren met sidebar (admin-only of admin+planner)    | Security   | S      | hoog   | `src/App.tsx:19,135-137`, `src/components/AppSidebar.tsx:45-47,192`                             |
| 4  | Edit/delete-knoppen altijd zichtbaar, niet hover-only            | UX/a11y    | S      | mid    | `src/components/settings/MasterDataSection.tsx:244,325,481,484`                                 |
| 5  | Empty states toevoegen voor loading_units en requirement_types   | UX         | S      | mid    | `src/components/settings/MasterDataSection.tsx:232,312`                                         |
| 6  | `useTenant()` gebruiken i.p.v. per-mutatie profile-lookup        | Perf       | S      | mid    | `src/components/settings/MasterDataSection.tsx:98-104,136-141`                                  |
| 7  | Toast-feedback + bevestiging in warehouse-mutaties               | UX         | S      | mid    | `src/hooks/useWarehouses.ts:36-83`, `src/components/settings/MasterDataSection.tsx:484`         |
| 8  | Categorie als Select (enum), niet vrij-tekst                     | Data-kwaliteit | S  | mid    | `src/components/settings/RequirementTypeDialog.tsx:80-85`                                       |
| 9  | `<input type="color">` voor requirement-kleur                    | UX         | XS     | laag   | `src/components/settings/RequirementTypeDialog.tsx:88-94`                                       |
| 10 | Usage-teller per stamgegeven (chip naast naam)                   | Slimheid   | M      | mid    | `src/components/settings/MasterDataSection.tsx` + nieuwe count-query of DB-view                 |

## Quick wins (binnen 1 dag)

- 1, 3, 4, 5, 6, 8, 9 uit de tabel hierboven. Samen ~6-8 uur werk en lost het meeste terugkerende ruis op (stille-delete-ongelukken, toegankelijkheid, role-gap).

## Structurele verbeteringen (>1 dag)

- 2 (archive-pattern): raakt meerdere queries (lijsten moeten `is_active=true` filteren met toggle "toon gearchiveerd"), UI toggle, en migratie-check voor warehouses.
- 10 (usage-teller): vraagt een kleine view of RPC, en denkt door naar "oude items opruimen"-flow.
- Herindelen: verplaats `PlanningV2Toggle` weg uit stamgegevens naar "Algemeen" of een aparte Planning-instellingen-tab; en maak één UX-patroon voor alle drie de CRUD-secties.

## Open vragen aan Badr

1. Moet planner bij stamgegevens kunnen (dan sidebar aanpassen) of alleen admin (dan RoleGuard aanpassen)? De code zegt nu half beide.
2. Mag de hard-delete knop helemaal weg, of wil je hem beschikbaar houden voor admin in een "gevaarlijke acties"-submenu?
3. Hoort PlanningV2Toggle blijven onder Stamgegevens, of verhuizen naar Algemeen/Planning-tab?
4. Is `packaging_movements` daadwerkelijk actief in Royalty Cargo-data, of nog onaangeroerd? Dat bepaalt hoe urgent de CASCADE-fix is.

---

## Doorgevoerde wijzigingen (2026-04-23)

Op basis van de antwoorden van Badr (1.A, 2. delete blijft maar AVG-bewaarplicht, 3. PlanningV2Toggle mag weg, 4. onbekend) is het volgende direct uitgevoerd:

- **RoleGuard aangescherpt**: `/settings`, `/settings/stamgegevens`, `/settings/inboxen` zijn nu `admin`-only (`src/App.tsx:135-137`). Planner kan niet meer via directe URL binnenkomen.
- **Soft-delete ingevoerd**: migratie `supabase/migrations/20260423230000_stamgegevens_soft_delete.sql` voegt `deleted_at timestamptz` toe op `loading_units`, `requirement_types` en `tenant_warehouses`, plus partial indexes op actieve rijen. UI-delete wordt een `UPDATE deleted_at=now()` zodat historische orders/bewegingen bewaard blijven (AVG) en de CASCADE op `packaging_movements.loading_unit_id` nooit meer triggert.
- **Confirm-dialoog**: één `AlertDialog` in `MasterDataSection.tsx` voor alle drie de secties, met AVG-uitleg in de beschrijving.
- **PlanningV2Toggle uit stamgegevens**: sectie en import weg (bestand blijft staan tot Badr "helemaal weg" zegt).
- **Edit/delete-knoppen altijd zichtbaar** + `aria-label` per knop (geen `opacity-0` meer).
- **Empty states** voor ladingeenheden en transportvereisten.
- **`useTenant()`-context** vervangt de per-mutatie `auth.getUser + profiles.select('tenant_id')`-round-trip.
- **Query staleTime** 5 min op beide stamdata-queries + tenant-id in queryKey.
- **`RequirementTypeDialog`**: categorie is nu een `Select` (transport/equipment/documentatie/veiligheid), kleur heeft `<input type="color">` met hex-veld ernaast.
- **`useWarehouses`**: SELECT filtert `deleted_at IS NULL`, mutaties geven toasts, `useDeleteWarehouse` vervangen door gedeelde soft-delete-flow.

**Niet gedaan (volgt nog, apart op te pakken):**
- Usage-teller per stamgegeven (item 10 uit de top-10). Vereist count-queries of een DB-view en is groter werk.
- `PlanningV2Toggle.tsx` + `useIsPlanningV2Enabled.ts` + DB-functie `get_planning_cluster_granularity` volledig opruimen zodra Badr bevestigt dat de feature dood moet.
