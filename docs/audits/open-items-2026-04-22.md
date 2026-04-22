# Open audit-items per 2026-04-22

Stand van zaken na de orders- en klanten-audits van 2026-04-22. Gecommit onder
`e32ad49` (sprint-4 clients+orders) en het vervolg in deze commit.

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

### Orders-tab (audit: `docs/audits/orders-2026-04-22.md`)

Uit de top-10 geland:

- #1 Sort-memo dependency fix (`Orders.tsx`)
- #3 `localStorage.local_test_orders` verwijderd uit `OrderDetail.tsx`
- #4 Audit-log op CREATE (per leg in NewOrder via `createShipmentWithLegs`),
  CANCEL en REOPEN (OrderDetail), plus defense-in-depth in `useCreateOrder` en
  `useDeleteOrder`
- #5 Dupliceer-order: hover-knop op klant-cel in orderlijst, navigeert naar
  `/orders/nieuw?client_id=...` die de prefill-flow triggert
- #6 Expliciete `.select()`-kolommen in `useOrders` i.p.v. `select('*')`

## Nog te doen

### Orders-tab

- **#2 Server-side sorteren** (M-effort, hoog-impact), sortering werkt nu nog
  client-side binnen de huidige 25-rij-pagina. Server-side `order(...)` plus
  de sort-kolom via de query-key; payload voor `weight_kg DESC` vereist wellicht
  een nieuwe index.
- **#7 "Leaving with unsaved changes"-waarschuwing in NewOrder** (S-effort,
  mid-impact), zelfde patroon als het nu in NewClientDialog staat (dirty-check
  + AlertDialog bij Annuleren of outside-click).
- **#8 Order-number zoeken op formatted string** (S-effort, mid-impact), zodat
  `"RCS-2026-0042"` of deelfragmenten hits geven. Nu faalt zoeken tenzij de
  user het rauwe integer-ordernummer intypt.
- **#9 Handmatige validatie in `NewOrder.handleSave` vervangen door
  `orderInputSchema.parse`** (M-effort, mid-impact), voorkomt drift tussen
  Zod-schema en de duplicate-validatie in de component.
- **#10 "DRAFT ouder dan 2u"-KPI-cel** (S-effort, mid-impact), één extra query
  op `status='DRAFT' AND created_at < now() - interval '2 hour'`, met klik als
  snel-filter.

### Klanten-tab

Alle top-10 geland. Secundaire items uit de rapport-sectie "Structurele
verbeteringen":

- Omzet-YTD-metric in `StatsStrip`, via aggregatie van `invoices.total_cents`
  of `order_charges` per client. Nu toont de kaart "—" met caption
  "niet beschikbaar".
- Slapende-klant-detectie (90 dagen geen order), filter + KPI-strip-cel.
- Bulk-acties op klanten, o.a. bulk-inactief-schakelen en CSV-export.

### Dialog-component tests

`src/__tests__/components/dialog-components.test.tsx`:

- `ClientDetailPanel > renders tabs`, af en toe een timeout van 5000ms. Tijdens
  laatste run passeerde hij (4283ms). Vermoedelijk flakey door de Google-Maps
  mock die traag laadt. Als hij blijft hangen: verhoog `testTimeout` in de
  vitest-config naar 10000ms, of hoist de `useGoogleMaps`-mock verder naar
  boven zodat hij synchroon loaded-is-false retourneert.
- `NewDriverDialog > renders create mode when no driver prop`, zelfde
  patroon. Niet door audit-wijzigingen veroorzaakt.

Deze flakiness bestond al voor de audit-sprint; de pre-existing architectuur
met directe Google-Maps loader in de detail-component is de oorzaak.

## Dependency-notities

- Geen van de open items vereist een migratie.
- Item "Server-side sorteren" kan baat hebben bij een index op
  `(tenant_id, weight_kg DESC)` als weight sortering actief wordt, nu is dat
  niet nodig.
- Item "Omzet-YTD" vraagt een aparte query of materialized view; dat valt
  eerder onder Finance-scope dan Klanten-tab.