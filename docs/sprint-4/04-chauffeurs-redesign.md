# Sprint 4, chauffeurs-redesign plan

Opgeleverd: 2026-04-21
Driver: Badr, implementatie via Claude-sessie

## Aanleiding

Audit op de bestaande chauffeurs-pagina en NewDriverDialog bracht een serie gaps aan het licht, waarvan een deel compliance-kritisch is (CAO-adres, BSN, verloopdata rijbewijs en Code 95). Rest is UX-polish die de pagina bruikbaar maakt voor groeiende chauffeurs-databases.

## Scope

Eén sprint, alles in deze repo. Out of scope: Nmbrs-integratie (sprint 5), PDF-upload van documenten (vraagt Supabase Storage bucket-setup, volgende sprint).

## Commits

Eén feature branch `sprint-4/chauffeurs-redesign`, opgeknipt in vier commits zodat ze los reviewbaar blijven.

### Commit 1, DB + types (compliance-essentie)

Migratie `20260421170000_driver_compliance_fields.sql`:

Nieuwe kolommen op `public.drivers`:

- **Adres** (CAO woon-werk): `street`, `house_number`, `house_number_suffix`, `zipcode`, `city`, `country` (NL default).
- **Administratie**: `bsn` (text, masked in UI, wel gevalideerd 11-proef), `iban` (text, IBAN-checksum), `personnel_number` (text, uniek per tenant).
- **Arbeid**: `hire_date` (date, indienstdatum), `termination_date` (date, uitdienst of null).
- **Legitimatie**: `legitimation_expiry_date` (date), `code95_expiry_date` (date). Eerste voor rijbewijs/paspoort/ID, tweede voor chauffeursdiploma.

Optional index: `idx_drivers_personnel_number` partial unique per tenant voor het personeelsnummer.

Migratie `20260421170100_driver_certification_expiry.sql`:

Tabel `driver_certification_expiry` (junction drivers × driver_certifications):

```
id uuid pk
tenant_id uuid fk tenants
driver_id uuid fk drivers (cascade)
certification_code text (matcht driver_certifications.code)
issued_date date null
expiry_date date null
document_url text null (voor volgende sprint PDF-upload, nu null)
created_at, updated_at
unique(driver_id, certification_code)
```

RLS policies analoog aan andere tenant-scoped tabellen.

Type-updates in [src/hooks/useDrivers.ts](src/hooks/useDrivers.ts) voor alle nieuwe kolommen en nieuwe hook `useDriverCertificationExpiry(driverId)`.

### Commit 2, NewDriverDialog refactor

Volledig refactoren, tabs-gestructureerd, alle nieuwe velden, nette validatie.

**Tabs** (vervangen de 5 sectie-blokken):

1. **Basis**: naam, email, telefoon.
2. **Adres**: straat, nr, bijv., postcode, plaats, land (NL default).
3. **Legitimatie**: type, nummer, geldig tot, Code 95 geldig tot.
4. **Werk**: personeelsnummer, indienst, uitdienst, contract-uren (max 48), dienstverband (+ `zzp` + `uitzendkracht`).
5. **Administratie**: BSN (masked field `***-**-1234`), IBAN.
6. **Nood**: contact-naam, relatie (Select met partner/ouder/kind/overig), telefoon.
7. **Certs**: checkbox-grid van master-certs + per aangevinkte cert een "geldig tot"-datepicker.

**Gedrag bij create vs edit**:
- Status-select en voertuig-select alleen zichtbaar in edit-mode ([NewDriverDialog.tsx:287-315](src/components/drivers/NewDriverDialog.tsx#L287-L315) verhuizen).
- Submit-button `disabled={createDriver.isPending || updateDriver.isPending}` tegen dubbel-klik.

**Validatie** (Zod-schema `driverSchema`):
- Naam verplicht.
- Email format.
- Telefoon: liberale NL-regex (`^[+]?[0-9\s\-()]{8,}$`).
- BSN 9 cijfers + 11-proef.
- IBAN via `ibantools` of simpel regex (`^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$`) + checksum.
- Geboortedatum minimum 18 jaar voor CE-rijbewijs, warning bij <21.
- contract_hours max 48, min 0.
- hire_date ≤ today, termination_date ≥ hire_date.
- legitimation_expiry en code95_expiry: warning als <60 dagen.
- Duplicaat-check: server-side unique op (tenant, personnel_number), client geeft melding uit error.

**Dynamisch legitimatie-label** ([NewDriverDialog.tsx:228](src/components/drivers/NewDriverDialog.tsx#L228)): "Rijbewijsnummer" / "Paspoortnummer" / "ID-kaart-nummer".

**Datepicker defaults**: `defaultMonth` op `new Date(1980, 0, 1)` voor geboortedatum, met `captionLayout="dropdown-buttons"` en focus op jaar-dropdown (requires Calendar-wrap).

### Commit 3, Chauffeurs-pagina quick-wins

In [src/pages/Chauffeurs.tsx](src/pages/Chauffeurs.tsx):

- **Delete via AlertDialog** in plaats van `window.confirm`. Impact-melding "Open ritten: X, uren gekoppeld: Y, doorgaan?".
- **Voertuig-weergave**: kenteken tonen in plaats van "Gekoppeld" ([Chauffeurs.tsx:267-271](src/pages/Chauffeurs.tsx#L267-L271)). Lookup via `useFleetVehicles`.
- **Initialen-helper** die "Jan van der Berg" → "JB" geeft (eerste + laatste woord, niet alle spaces).
- **Status-badge icoon** vervangen: gebruik `UserCheck`/`Bed`/`Ambulance`/`Truck` per status in plaats van `Badge` component ([Chauffeurs.tsx:121](src/pages/Chauffeurs.tsx#L121)).
- **Skeleton cards** tijdens loading in plaats van spinner.
- **Lege-staat splitsen**: eerst checken of drivers.length === 0 (echt geen data) vs filtered.length === 0 (filter leeg). Eerste geval: call-to-action "Eerste chauffeur toevoegen". Tweede: "Pas filters aan".

### Commit 4, Chauffeurs-pagina uitgebreide functies

- **Tabel/Kaart-toggle** rechts naast filters (segmented control). Tabel-view heeft kolommen: naam, voertuig (kenteken), status, certs (chips), contracturen, dienstverband, rijbewijs-geldig-tot (rood bij <60d), acties.
- **Zoeken op telefoon** toevoegen aan `filtered`-useMemo.
- **Filter "zonder voertuig"** (keuze in status-select of apart).
- **Sortering**: select "Sorteer op" (naam, status, contract-uren, rijbewijs-vervaldatum).
- **KPI-uitbreiding**:
  - Totaal, Beschikbaar, Onderweg (bestaand).
  - Nieuw: **Ziek** + **Rust** (samen in 1 kaart), **Verlopend 60d** (rijbewijs of Code 95 loopt af binnen 60 dagen, clickable filter), **Overuren deze week** (gebruikt `driver_hours_view`).
- **CSV-export** button boven de lijst (exports naam, personeelsnummer, indienst, contract, cert-vervaldata). Handig voor loonadministratie.
- **Bulk-select** met checkbox per rij (alleen in tabel-view) + bulk-acties: "Deactiveer", "Export selectie".

## Wat niet in deze sprint

- **PDF-upload voor cert-documenten**. Vraagt Supabase Storage bucket en aparte security-review. Volgende sprint.
- **Nmbrs-integratie**. Sprint 5, buiten scope.
- **Auto-alert rijbewijs verloopt**. Cron-edge-function. Nice-to-have, later.

## Verificatie (na alle 4 commits)

1. `npx tsc --noEmit` groen.
2. `npx vite build` groen.
3. `npx vitest run src/__tests__/components/dialog-components.test.tsx` groen (mock updates meenemen).
4. Handmatig in browser:
   - Nieuwe chauffeur → alle tabs → BSN-validatie werkt → submit → rij in lijst.
   - Tabel-toggle schakelt, kenteken zichtbaar, rijbewijs <60d rood.
   - KPI "Verlopend 60d" toont juiste count; klik filtert lijst.
   - CSV-export download.
   - Delete toont AlertDialog met impact-melding.
5. Migratie op Supabase prod via SQL editor (2 migratie-files).

## Kritieke bestanden

- Nieuw: `supabase/migrations/20260421170000_driver_compliance_fields.sql`
- Nieuw: `supabase/migrations/20260421170100_driver_certification_expiry.sql`
- [src/hooks/useDrivers.ts](src/hooks/useDrivers.ts) uitbreiden
- Nieuw: `src/lib/validation/driverSchema.ts`
- [src/components/drivers/NewDriverDialog.tsx](src/components/drivers/NewDriverDialog.tsx) volledig refactor
- [src/pages/Chauffeurs.tsx](src/pages/Chauffeurs.tsx) quick-wins + tabel-view
- Nieuw: `src/components/drivers/DriversTable.tsx` voor tabel-view
- Nieuw: `src/components/drivers/DeleteDriverDialog.tsx` voor AlertDialog
- [src/__tests__/components/dialog-components.test.tsx](src/__tests__/components/dialog-components.test.tsx) mock-uitbreiding
