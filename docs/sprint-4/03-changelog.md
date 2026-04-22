# Sprint 4, Fase 3, Changelog

Opgeleverd van 2026-04-15 tot en met 2026-04-21. Focus deze sprint: adres-autocomplete met geo-coordinaten, opruimen van stamgegevens-structuur, en een hoop UX-verbeteringen op de klant-, voertuig- en chauffeurformulieren.

## 1. Geleverde functionaliteit

### 1.1 Klanten

- **Klantenoverzicht en detailpaneel herzien** met luxe-tokens. Consistent met de designlijn van order en planning (`ba720f6`).
- **Nieuwe-locatie dialog** in de klantentab, zodat laad- en losadressen zonder omweg via een order aangemaakt kunnen worden (`f3d54d7`).
- **Google adres-autocomplete plus sleepbare pin** bij het aanmaken van een klant. Pin-positie wordt als `lat`/`lng` opgeslagen en gebruikt bij geocoded routing (`2b45ae2`).
- **Klant bewerken** via potlood-icoon in panel-header, hergebruikt de bestaande `NewClientDialog` in edit-modus met pre-filled velden (`110646c`).
- **Paneel sluit op klik-buiten en Escape** op desktop, niet meer alleen via X-knop (`35fd4cb`, `eff8f82`).
- **Places-suggesties klikbaar in dialogs** door `.pac-container`-clicks door te laten via Radix Dialog (`779c9c0`).
- **Lijstpagina opgewaardeerd** met paginering van 50 per pagina, sortering op naam/contactpersoon/email/actieve-orders, filters voor status, land en open orders, plus `mailto:` / `tel:` links per cel.
- **Full-page klantdetail op `/klanten/:id`**, toegankelijk via een uitklap-icoon in de panel-header, naast knoppen voor nieuwe order, bewerken en sluiten.
- **Duplicaat-check op KvK**, partial unique index op `(tenant_id, kvk_number)` in de DB en een amber waarschuwingsblok in de dialog met bevestig-checkbox.
- **Primair-contact-relatie** via nieuwe `primary_contact_id`-FK naar `client_contacts`, getoond als badge in Contact-sectie. Back-fill in migratie matcht bestaande `role='primary'`-rijen of oudste contact per klant.
- **Audit-log** via `AFTER UPDATE`-trigger op `clients` die muterende kolommen schrijft naar `client_audit_log` (select + insert RLS, geen update/delete). Nieuwe tab "Historie" toont verticale tijdlijn met wie, wanneer en welk veld.
- **Notities op klantniveau** via `clients.notes` en een debounce-saved textarea onderaan Overzicht, plus een veld in de edit-variant van de dialog.
- **Stats-strip bovenaan Overzicht** met actieve orders, omzet YTD en laatste rit. Omzet YTD toont voorlopig "niet beschikbaar" omdat `orders` geen eenduidig prijsveld heeft (splitsing over `order_charges`, `shipments.price_total_cents`, `invoices`).
- **Mini-map op Overzicht** toont de hoofdadres-pin read-only via `GoogleMap`, zichtbaar zodra `lat`/`lng` gezet zijn.
- **`is_active`-toggle** in Bedrijf-sectie van Overzicht, zet klanten op inactief zonder SQL.

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
- **`useFleet`-tests** krijgen nu een volledige TenantContext-mock, `useAddVehicle` / `useCreateMaintenance` / `useCreateDocument` niet meer rood op baseline. Ook widget-heading assertions aangepast zodat ze overeenkomen met componenten.
- **Automatische reload bij Vite preload-error** in `main.tsx`, zodat gebruikers na een Vercel-deploy niet handmatig hoeven te refreshen om nieuwe chunk-hashes te pakken.

## 2. Bugfixes

- **`tenant_id` meesturen bij aanmaken klant** (`710f058`, uit Sprint 3 nagezonden).
- **`tenant_id` meesturen bij aanmaken chauffeur**, plus toast-feedback bij fouten zodat stille RLS-blokkades zichtbaar worden (`94f41e9`).
- **`tenant_id` meesturen bij aanmaken voertuig, onderhoud en document** (`acdc44b`).
- **Dubbele order bij opeenvolgend "Opslaan" en "Opslaan & sluiten" op nieuwe-order pagina** (`f41f97e`, meegelift met de klant-veld commit). `handleSave` op `NewOrder.tsx` riep elke keer `createShipmentWithLegs` aan zonder de eerste aangemaakte shipment te onthouden, waardoor een tweede klik een identiek shipment + order aanmaakte. Fix: na een succesvolle `handleSave(false)` navigeren we naar de detailpagina van de nieuwe order, zodat verdere bewerkingen via het update-pad in `OrderDetail` lopen. `handleSave(true)` gaat naar de orderlijst. Opruim-SQL voor de geobserveerde duplicaat (order `46c596d0…`, shipment `dfde6a2e…`) handmatig uitgevoerd door Badr op 2026-04-22.

## 3. Databasemigraties

Deze sprint hebben we tien migraties opgeleverd. Ze moeten in deze volgorde draaien:

1. `20260421100000_clients_address_geo.sql`, straat/huisnummer/postcode/plaats plus lat/lng op clients.
2. `20260421110000_driver_personal_fields.sql`, geboortedatum en noodcontact-velden op drivers.
3. `20260421120000_orders_geo_split.sql`, gesplitste pickup/delivery adresvelden op orders.
4. `20260421130000_vehicle_cleanup_and_seed.sql`, drop cargo-afmetingen op vehicles, seed drie extra default voertuigtypes.
5. `20260421140000_driver_legitimation_type.sql`, `legitimation_type` kolom op drivers.
6. `20260421140000_orders_geo_indexes.sql`, partial indexen op geocoded coordinaten.
7. `20260421150000_client_locations_address_geo.sql`, adres- en geo-velden op client_locations.
8. `20260421160000_driver_certifications_master.sql`, master-data tabel plus migratie van bestaande `drivers.certifications[]` labels naar codes.
9. `20260422000000_clients_primary_contact_and_kvk_unique.sql`, `primary_contact_id`-FK op clients, back-fill van bestaande rijen en partial unique index op `(tenant_id, kvk_number)`.
10. `20260422001000_clients_notes_and_audit.sql`, `notes`-kolom op clients, `client_audit_log`-tabel met immutabele RLS, `AFTER UPDATE`-trigger `audit_clients_changes()` en helper-functie `log_client_audit()`.

Let op: migratie 8 bevat een UPDATE die de negen bekende certificerings-labels vertaalt naar codes. Custom labels die tenants handmatig in `drivers.certifications[]` hadden staan blijven ongewijzigd en worden niet herkend door het dialoog tot een admin ze als master-data aanmaakt. Migratie 9 backfillt `primary_contact_id` via CTE met ROW_NUMBER, eerst actieve `role='primary'`-contacten, daarna oudste `created_at`.

## 4. Bekende tech-debt na deze sprint

- **Omzet YTD op klant-overzicht** staat op "niet beschikbaar" omdat `orders` geen eenduidig prijsveld heeft. Echte omzet zit verspreid over `order_charges`, `shipments.price_total_cents` en `invoices`. Aggregatie in een view of RPC is de volgende stap.
- **Certificering-aggregaat query** in `DriverCertificationsSection` leest alle drivers en telt client-side. Prima voor huidige schaal, bij groei beter een view of RPC.
- **Deprecated kolommen** `clients.contact_person`, `clients.email`, `clients.phone` blijven voorlopig staan naast `primary_contact_id`. Volledig droppen vereist afpellen van alle consumers en een data-check per tenant.
- **Audit-log alleen op clients**: de trigger is handmatig opgezet per tabel. Generiek maken (bijv. via `row_audit(table, op, old, new)`) kan later als we het patroon willen uitrollen naar drivers, vehicles en orders.
- **Agent-worktrees opruimen**: alle Sprint 4 worktrees zijn nu verwijderd na merge, oudere worktrees uit eerdere sessies staan nog onder `.claude/worktrees/`.

## 5. Nog open uit klant-wensenlijst

Niet gedaan deze sprint, expliciet geparkeerd:

- Extra voertuigtype-specifieke instellingen (merkvariatie DAF/Mercedes) buiten de drie geseede defaults.
- Real-time updates van certificering-badges op chauffeur-kaarten na mutatie in Types-tab (nu pas na refresh).
- Bulk-acties op de klantenlijst (bulk archiveren, bulk export naar CSV).
- Lead- of pipeline-status op klanten (leads, prospects, actieve klanten, inactief), als we CRM-breder willen maken.
