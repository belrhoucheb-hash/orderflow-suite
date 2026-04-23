# Open audit-items per 2026-04-22

Stand van zaken na de orders- en klanten-audits van 2026-04-22. Gecommit onder
`e32ad49` (sprint-4 clients+orders) en het vervolg in de merges van 22 april.

## Afgerond

### Klanten-tab (audit: `docs/audits/klanten-2026-04-22.md`)

Alle top-10 items uit de audit zijn geland.

- #1 `active_order_count` via `orders.client_id` i.p.v. naam-string
- #2 Server-side paginering + filter + sortering via `useClientsList`
- #3 `useClientOrders(clientId)` i.p.v. `clientName` met `.ilike`
- #5 Zoekveld uitgebreid naar `kvk_number`, `contact_person`, `phone`, `city`
- #6 Contact-archive i.p.v. hard-delete, toggle "Toon gearchiveerd", heractiveer
- #7 Bevestigdialog bij deactiveren van klant met actieve orders
- #8 Contact-CRUD via `log_client_audit` RPC in audit-log
- #9 Expliciete `CLIENT_LIST_COLUMNS` i.p.v. `select('*')`
- #10 Unsaved-changes-AlertDialog bij sluiten van NewClientDialog
- #4 NewOrder `?client_id=`-param + vorige-order prefill

Secundaire items uit "Structurele verbeteringen":

- Omzet-YTD in `StatsStrip` via `useRevenueYtd`, aggregatie van
  `invoices.total` per tenant plus klant, met statussen verzonden, betaald
  en vervallen. Scope-afwijking, de hook aggregeert YTD per klant in plaats
  van tenant-breed zoals oorspronkelijk geschetst. Reden: de "—" stond in
  de per-klant-detailkaart, niet in een tenant-brede StatsStrip. Tenant-
  brede omzet valt onder Finance-scope, zie Dependency-notities.
- Slapende-klant-detectie (90 dagen geen order) via `useClientStats` en
  `dormantOnly`-flag in `useClientsList`. Server-side via
  `.not('id','in', recentIds)`. Filter-Select "Alleen slapende klanten" en
  KPI-strip-cel in de klantenlijst.
- Bulk-acties: checkbox-kolom, select-all met indeterminate-state, toolbar
  met CSV-export en "Zet op inactief" via `useBulkUpdateClientsActive`
  (archive-pattern, hard-delete blijft weg). AlertDialog hergebruikt het
  patroon van NewClientDialog-#10.

### Orders-tab (audit: `docs/audits/orders-2026-04-22.md`)

Alle top-10 items uit de audit zijn geland.

- #1 Sort-memo dependency fix (`Orders.tsx`)
- #2 Server-side sorteren via `useOrders`-opties `sortField` en `sortDirection`,
  UI-veldnaam mapt in `SORT_FIELD_TO_DB` naar de DB-kolom (`client_name`,
  `weight_kg`, `status`, `created_at`). Sort-keys zitten in de query-key zodat
  react-query per combinatie cachet. `created_at DESC` blijft tiebreaker voor
  stabiele paginering.
- #3 `localStorage.local_test_orders` verwijderd uit `OrderDetail.tsx`
- #4 Audit-log op CREATE (per leg in NewOrder via `createShipmentWithLegs`),
  CANCEL en REOPEN (OrderDetail), plus defense-in-depth in `useCreateOrder` en
  `useDeleteOrder`
- #5 Dupliceer-order: hover-knop op klant-cel in orderlijst, navigeert naar
  `/orders/nieuw?client_id=...` die de prefill-flow triggert
- #6 Expliciete `.select()`-kolommen in `useOrders` i.p.v. `select('*')`
- #7 Unsaved-changes-AlertDialog in NewOrder: dirty-check t.o.v. initial
  state (incl. prefill vanuit `?client_id=`), AlertDialog bij Annuleren of
  outside-click. Zelfde patroon als NewClientDialog.
- #8 Order-number zoeken op geformatteerde string: zoekwoord wordt in
  `useOrders` genormaliseerd (`RCS-` prefix weg, jaar-prefix weg, leading
  zeros weg) en als `order_number.eq.<int>` aan de `or()`-clause toegevoegd.
  Tekstzoek op `client_name`, `pickup_address` en `delivery_address` blijft
  intact. Placeholder laat `RCS-2026-0001` zien. Unit-tests dekken
  `RCS-2026-0042`, `0042` en zuivere tekst.
- #9 `NewOrder.handleSave` gebruikt `orderInputSchema.parse`. ZodError-
  catch mapt naar dezelfde toast-flow. Nieuwe test dekt happy path,
  missende leg en ongeldige gewichten.
- #10 KPI-cel "DRAFT ouder dan 2u" met klik-filter. Tenant-gescoped count-
  query (`useStaleDraftCount`, 60s refetch), klik zet
  `createdBefore`-filter dat server-side via `.lt("created_at", ...)` wordt
  toegepast. Client-side stale-filter weggehaald.

## Nog te doen

### Dialog-component tests

Nog steeds flakey. Fix-poging op 2026-04-22 via globale
`@react-google-maps/api`-mock in `src/test/setup.ts` is gerevert omdat
de mock andere test-suites brak (`NewClientDialog`, `NewVehicleDialog`,
`core-components > AppLayout` faalden op "Element type is invalid").
Onderliggende oorzaak (module-parse-kost van 1.5MB maps-library bij
eerste `await import()`) niet opgelost. Volgende poging vraagt een
completere mock-matrix of een Vite-level alias die de library
stub't in testmode.

- `ClientDetailPanel > renders tabs`, timeout 5000ms, halen in 1625-3079ms.
- `NewDriverDialog > renders create mode when no driver prop`, zelfde.

### Nieuwe items uit de consolidatie

- **Tenant-brede omzet-YTD-metric** (Finance-scope, niet Klanten-tab),
  aggregatie over `invoices.total` per tenant voor alle klanten
  gezamenlijk. Verschijnt op Finance-dashboard, niet in de klant-detail-
  kaart. Pak op wanneer de Finance-tab ingericht wordt.

## Dependency-notities

- Geen van de open items vereist een migratie.
- Item "Server-side sorteren" kan baat hebben bij een index op
  `(tenant_id, weight_kg DESC)` als `weight_kg`-sortering actief gebruikt
  wordt; nu nog niet nodig.
- Tenant-brede omzet-YTD vraagt een aparte query of materialized view; valt
  onder Finance-scope.
