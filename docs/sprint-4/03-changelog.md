# Sprint 4, Fase 3, Changelog

Opgeleverd van 2026-04-15 tot en met 2026-04-21. Focus deze sprint: adres-autocomplete met geo-coordinaten, opruimen van stamgegevens-structuur, en een hoop UX-verbeteringen op de klant-, voertuig- en chauffeurformulieren.

## 1. Geleverde functionaliteit

### 1.1 Klanten

- **Klantenoverzicht en detailpaneel herzien** met luxe-tokens. Consistent met de designlijn van order en planning (`ba720f6`).
- **Nieuwe-locatie dialog** in de klantentab, zodat laad- en losadressen zonder omweg via een order aangemaakt kunnen worden (`f3d54d7`).
- **Google adres-autocomplete plus sleepbare pin** bij het aanmaken van een klant. Pin-positie wordt als `lat`/`lng` opgeslagen en gebruikt bij geocoded routing (`2b45ae2`).

### 1.2 Orders

- **Pickup- en delivery-adres met autocomplete** in de nieuwe-order flow, inclusief opslag van lat/lng (`3ac3594`).
- **Gesplitste adresvelden** in de `orders`-tabel voor Google geo-autocomplete (`3360882`).
- **Partial indexen** op geocoded pickup- en delivery-coordinaten, voor snellere clustering op kaart (`2b4cbcf`).
- **`primaryLaden`/`primaryLossen`-id gememoized** in NewOrder om onnodige rerenders te voorkomen (`6661033`).

### 1.3 Vloot

- **Voertuigtypes verhuisd** van Instellingen naar Vloot als tweede tab. Chauffeurs en types zitten nu onder één menuitem in plaats van twee verschillende plekken (`bf9bdd3`).
- **Type-dropdown in voertuig toevoegen voeden uit `vehicle_types`**. Hardcoded opties zijn weg, admins zien direct de types die ze zelf hebben aangemaakt zoals Caddy, Koeler klein of DAF (`288749b`).
- **Afmetingen alleen op type-niveau**. De kolommen `cargo_length_cm`, `cargo_width_cm` en `cargo_height_cm` op `vehicles` zijn gedropt. Afmetingen worden nu eenmalig op het voertuigtype bijgehouden (`e321c43`, `0649542`).
- **Drie extra default voertuigtypes** geseed per bestaande tenant: Caddy, Koeler klein en Koeler groot (`0649542`).

### 1.4 Chauffeurs

- **Persoonsgegevens uitgebreid** op het chauffeur-dialoog: geboortedatum plus losse noodcontact-sectie met naam, relatie en telefoon (`f411c36`).
- **Label "Rijbewijsnummer" hernoemd naar "Legitimatienummer"** en opgeknipt in een type-select (rijbewijs, paspoort, ID-kaart) plus het nummer. Placeholder past zich aan op basis van het gekozen type (`a04b88a`).
- **shadcn Calendar + Popover datepicker** in plaats van de native date input, met NL locale en maand-/jaar-dropdowns (`a04b88a`).
- **Certificeringenlijst uitgebreid** met Boxen, Hoya, Bakbus en DAF (`f411c36`).
- **Sectielabels** op het dialoog voor Basis, Persoonsgegevens, Werkinformatie, Contact bij nood en Certificeringen (`a04b88a`).
- **Dialog breder, body scrollbaar, footer sticky**, zodat het dialoog bij kleinere schermen niet meer buiten beeld valt (`3b0fb44`).
- **Certificeringen als master-data tabel** met beheer-UI als tweede tab onder Chauffeurs. Admins kunnen zelf certificeringen aanmaken zonder code-deploy (`fe4e4f4`).

### 1.5 Instellingen en stamgegevens

- **Ladingeenheden en Transportvereisten** gebruiken nu dezelfde dialog-flow als voertuigtypes, in plaats van de eerdere inline-add-row (`ef509ab`).

### 1.6 Onder de motorkap

- **`useTenantInsert`-helper** voorkomt dat `tenant_id` vergeten wordt bij inserts. Gebruikt door `useCreateClient`, `createDriver`, `useAddVehicle`, `useCreateMaintenance` en `useCreateDocument`. Drie eerdere silent-RLS-bugs kunnen zo niet meer terugkeren (`33542f3`, `7e922f1`).
- **`useTenantOptional` mock** toegevoegd in de settings-testsuite, 10 crashende tests weer groen (`ecbda55`, `18f5a47`).

## 2. Bugfixes

- **`tenant_id` meesturen bij aanmaken klant** (`710f058`, uit Sprint 3 nagezonden).
- **`tenant_id` meesturen bij aanmaken chauffeur**, plus toast-feedback bij fouten zodat stille RLS-blokkades zichtbaar worden (`94f41e9`).
- **`tenant_id` meesturen bij aanmaken voertuig, onderhoud en document** (`acdc44b`).

## 3. Databasemigraties

Deze sprint hebben we acht migraties opgeleverd. Ze moeten in deze volgorde draaien:

1. `20260421100000_clients_address_geo.sql`, straat/huisnummer/postcode/plaats plus lat/lng op clients.
2. `20260421110000_driver_personal_fields.sql`, geboortedatum en noodcontact-velden op drivers.
3. `20260421120000_orders_geo_split.sql`, gesplitste pickup/delivery adresvelden op orders.
4. `20260421130000_vehicle_cleanup_and_seed.sql`, drop cargo-afmetingen op vehicles, seed drie extra default voertuigtypes.
5. `20260421140000_driver_legitimation_type.sql`, `legitimation_type` kolom op drivers.
6. `20260421140000_orders_geo_indexes.sql`, partial indexen op geocoded coordinaten.
7. `20260421150000_client_locations_address_geo.sql`, adres- en geo-velden op client_locations.
8. `20260421160000_driver_certifications_master.sql`, master-data tabel plus migratie van bestaande `drivers.certifications[]` labels naar codes.

Let op: migratie 8 bevat een UPDATE die de negen bekende certificerings-labels vertaalt naar codes. Custom labels die tenants handmatig in `drivers.certifications[]` hadden staan blijven ongewijzigd en worden niet herkend door het dialoog tot een admin ze als master-data aanmaakt.

## 4. Bekende tech-debt na deze sprint

- **Pre-existing testfalers**, niet door Sprint 4 geintroduceerd, nog niet opgelost:
    - `FinancialKPIWidget` en `OperationalForecastWidget` renders-heading tests zoeken tekst die niet meer in de componenten staat (`Financieel Rendement` versus `Financieel`).
    - `useFleet.test.ts` tests op `useAddVehicle`, `useCreateMaintenance` en `useCreateDocument` missen een `TenantProvider` of `useTenant`-mock in de wrapper en crashen.
- **Certificering-aggregaat query** in `DriverCertificationsSection` leest alle drivers en telt client-side. Prima voor huidige schaal, bij groei beter een view of RPC.
- **Agent-worktrees opruimen**: twaalf worktrees uit de parallel-run staan nog onder `.claude/worktrees/`. Kan weg met `git worktree prune` plus branch-delete na merge.

## 5. Nog open uit klant-wensenlijst

Niet gedaan deze sprint, expliciet geparkeerd:

- Extra voertuigtype-specifieke instellingen (merkvariatie DAF/Mercedes) buiten de drie geseede defaults.
- Real-time updates van certificering-badges op chauffeur-kaarten na mutatie in Types-tab (nu pas na refresh).
