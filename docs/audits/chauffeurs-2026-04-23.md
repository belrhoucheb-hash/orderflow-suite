# Audit, Chauffeurs-tab

**Datum:** 2026-04-23
**Bekeken bestanden:** 14
**Vorige audit:** `docs/audits/chauffeurs-2026-04-22.md` (gisteren), deze audit is een her-run na de dagelijkse commits en behandelt zowel wat er is opgelost als wat er is bijgekomen.

## Bekeken bestanden

- `src/pages/Chauffeurs.tsx` (811 regels), hoofdview, KPI's, filters, kaart- en tabelweergave, CSV-export
- `src/components/drivers/NewDriverDialog.tsx` (1165 regels), 7-tab create/edit-formulier
- `src/components/drivers/DriverCertificationsSection.tsx` (272 regels), master-tabel certificeringen
- `src/components/drivers/DriverCertificateRecordsSection.tsx` (464 regels), uploads + AI-scan
- `src/components/drivers/DriverCertificateRecordDialog.tsx`, `DriverCertificationDialog.tsx`
- `src/hooks/useDrivers.ts`, `useDriverCertifications.ts`, `useDriverCertificateRecords.ts`
- `src/lib/validation/driverSchema.ts`, BSN 11-proef + IBAN mod-97 + leeftijd >= 18
- `supabase/migrations/20260419000000_baseline.sql`, tabel `drivers` + RLS
- `supabase/migrations/20260421170000_driver_compliance_fields.sql`, adres + BSN + IBAN + personeelsnummer
- `supabase/migrations/20260421170100_driver_certification_expiry.sql`
- `supabase/migrations/20260422120000_driver_certificate_records.sql`, bucket `driver-certificates`
- `supabase/migrations/20260422130000_certificate_expiry_notifications.sql`, pg_cron + templates
- `supabase/migrations/20260423130000_drivers_work_types.sql`, nieuwe kolom `work_types`
- `supabase/functions/notify-expiring-certificates/index.ts`, dagelijkse e-mail-scan

## Sprint-status op deze tab

Sprint 4 (redesign + compliance + AI-scan) is volledig geland. Vandaag zijn er drie betekenisvolle commits bovenop gekomen:
- `work_types` kolom toegevoegd (20260423130000) en gekoppeld aan de Werk-tab van `NewDriverDialog`.
- RLS-tenant-policies die eerder `USING (true)` hadden zijn tenant-gescoped (a74e50f, 20260423210000). Raakt `drivers` zelf niet (daar was het al goed), maar wel omringende tabellen.
- `service_role` policies expliciet gemaakt (5dd680c, 20260423220000). Geen gedrags-verschil, wel beter leesbaar.

Niks halfgebouwd. Data-integriteit op het tab is in orde.

## Samenvatting

Sinds gisteren zijn drie quick wins stilletjes geland (AlertDialog i.p.v. `window.confirm`, aria-labels op dropdown en icon-only knoppen, unsaved-changes-waarschuwing in de dialog). De échte pijn van gisteren staat 1-op-1 nog open: elke `authenticated` user in de tenant ziet alle BSN's, IBAN's, thuisadressen en geboortedata. De edge function `notify-expiring-certificates` bestaat en mailt, maar er is geen UI-inbox-item, dus wie geen mailnotificaties leest, ziet het pas als de chauffeurs-tab toevallig bezocht wordt. BSN/IBAN-validatie is nog steeds client-only en audit-trail op driver-mutaties is er niet.

## Score-overzicht

| Aspect | Score | Kern-observatie |
|---|---|---|
| CRUD volledigheid | 🟡 | Hard-delete blijft (historie cascade op `vehicle_checks` + `driver_availability`), status bij create blijft default `beschikbaar` |
| UI / UX kwaliteit | 🟢 | Quick wins van gisteren zijn geland, zware 7-tab-flow blijft als enige noemenswaardige punt |
| Performance | 🟢 | Prima voor 50-200 chauffeurs, geen N+1, memoization correct |
| Security | 🔴 | HR-PII (BSN, IBAN, adres, geboortedatum) volledig leesbaar voor elke tenant-user, server-side BSN/IBAN-check ontbreekt, geen audit-trail |
| Slimheid | 🟡 | E-mailnotificaties werken via pg_cron, maar geen UI-nudge, geen PDOK-autofill, geen voertuig-conflict-detectie |

---

## Bevindingen per fase

### 1. CRUD-functionaliteit

**CREATE** (`NewDriverDialog.tsx:257`, `useDrivers.ts:79`)
- Zod-schema + tenant-injectie via `useTenantInsert` werken end-to-end.
- Status en `current_vehicle_id` worden nog steeds alleen in edit-mode meegestuurd (`NewDriverDialog.tsx:330-336`). Bij create valt het terug op DB-default `beschikbaar`. Wie direct een chauffeur wil registreren als "ziek" of "uit dienst" kan dat niet in één handeling.
- Certificaten-tab is disabled bij create (`NewDriverDialog.tsx:457`), enige uitleg is een cursief regeltje op de tab zelf. Tooltip of inline-banner ontbreekt.
- `work_types` is nieuw (nog vrij-tekst, hard-gecodeerde lijst in `WORK_TYPE_OPTIONS`, `NewDriverDialog.tsx:106-113`). Werkt, maar is niet beheersbaar via UI zoals certificeringen dat zijn. Bij 4+ klanten of een nieuw voertuigtype moet er een code-deploy voor. Conform feedback "beheersbaar zonder deploy" wil je dit vroeg of laat ook een master-tabel geven.

**READ** (`Chauffeurs.tsx:107-176`)
- `useDrivers` doet nog steeds `select("*").order("name")`, inclusief BSN en IBAN. Voor 50-200 rijen snel genoeg, maar de payload bevat persoonsgegevens die niet voor iedereen hoeven te zijn. Zie security.
- Sort, filter en zoek werken, niks veranderd sinds gisteren.
- `is_active=false` en `termination_date` zijn nergens zichtbaar in de UI. "Wie zijn nog actief?" kun je dus niet filteren.
- Geen paginatie of virtualisatie, geen persist van filtervoorkeur.

**UPDATE** (`NewDriverDialog.tsx:257`, `useDrivers.ts:94`)
- Alle velden bewerkbaar, geen merge-conflict-bescherming (`updated_at` check).
- Twee ingangen voor `status` en `current_vehicle_id` (dit formulier + planningsflows). Drift-risico.

**DELETE** (`Chauffeurs.tsx:203-212`, `useDrivers.ts:111`)
- Hard-delete met AlertDialog. Tekst zegt "historie blijft bestaan", maar:
  - `vehicle_checks.driver_id` is `ON DELETE CASCADE` (`baseline.sql` rond regel 4150), voertuigchecks verdwijnen mee.
  - `driver_availability.driver_id` is CASCADE (`20260420000100_driver_availability.sql:15`), beschikbaarheidsrecords verdwijnen mee.
  - `driver_certification_expiry.driver_id` is CASCADE, dus óók het uploaden certificaat-documenten in de private bucket wordt ontkoppeld. De bestanden zelf worden **niet** weggegooid door de cascade (storage is losgekoppeld van postgres), dus er ontstaan weesbestanden in de bucket.
- Conform feedback SG-01 (archive-pattern voor stamgegevens) zou de default-actie "Archiveer" moeten zijn (`is_active=false`, eventueel `termination_date=today`) met hard-delete als secundaire bevestiging.

### 2. UI / UX kwaliteit

**Wat er sinds gisteren is opgelost**
- `window.confirm` is verdwenen uit `DriverCertificationsSection.tsx` en `DriverCertificateRecordsSection.tsx`, beide gebruiken nu `AlertDialog` (`DriverCertificationsSection.tsx:243-268`, `DriverCertificateRecordsSection.tsx:437-461`).
- Icon-only edit en delete-knoppen in tabelweergave hebben nu `aria-label` (`Chauffeurs.tsx:780, 789`).
- De MoreHorizontal-dropdown-trigger heeft `aria-label={`Acties voor ${d.name}`}` (`Chauffeurs.tsx:585`).
- Unsaved-changes-waarschuwing in `NewDriverDialog` is er (`pendingClose` + AlertDialog `NewDriverDialog.tsx:922-942`).

**Wat nog openstaat**
- **7 tabs in de dialog** blijft zwaar voor een kleine aanpassing. Groeperen tot 3-4 tabs (Basis+Adres, Legitimatie+Certificaten, Werk, Administratie+Nood) reduceert de klikpad-lengte.
- **`maskBsn`** wordt nog steeds niet gebruikt in de UI. BSN is zichtbaar als platte tekst zodra iemand de dialog opent. Toon-knop met `reveal` toggle is 15 regels code.
- **Status "inactief"** ontbreekt in filter-dropdown, terwijl `is_active=false` wel in de data kan staan.
- **Tabelweergave-actiekolom** heeft nog ruisige dubbele knoppen (edit + delete los). Consistenter is een MoreHorizontal-menu zoals in de kaart.

**Datumvelden**
- `DatePickerButton` (`NewDriverDialog.tsx:1016-1132`) accepteert nu `dd-mm-jjjj` typ-invoer met realtime parseError, veel beter dan gisteren. Kalender-icoon opent popover. A11y in orde.

### 3. Performance

Geen veranderingen. Geheugenbeeld is correct (memoized `filtered`, `stats`, `vehicleMap`, `certLabels`). Geen N+1. Schaal is prima tot enkele honderden rijen.

- Kaart-grid blijft zonder virtualisatie, pas relevant >500 drivers.
- `DriverCertificationsSection` telt O(n×m) per render, verwaarloosbaar.
- `notify-expiring-certificates` doet één RPC-scan, vermenigvuldigd met aantal tenants. Schaalbaar.

### 4. Security

**RLS (opnieuw bevestigd)**
- `drivers`: 4 tenant-isolatie-policies voor `authenticated` + service_role. Correct. Niet aangeraakt door 20260423210000, want de policies waren al tenant-gescoped.
- Alle afgeleide tabellen (`driver_certifications`, `driver_certification_expiry`, `driver_certificate_notifications_sent`) hebben tenant-policy + service_role.
- Bucket `driver-certificates` is private, pad-conventie `{tenant_id}/{driver_id}/{uuid}.{ext}`, storage-policies scopen op `foldername[1] = current_tenant_id()`. Download gaat via signed URL met 60 min TTL (`useDriverCertificateRecords.ts:218`). Correct.

**Data-exposure binnen tenant, grootste bevinding, nog steeds open**
- Elke `authenticated` user ziet alle velden van alle chauffeurs:
  - `bsn`, `iban`, `street`, `house_number`, `zipcode`, `city`, `birth_date`, `emergency_contact_phone`.
- `driverSchema.ts:196` exporteert `maskBsn`, nog altijd nergens gebruikt in de UI.
- Drivers krijgen via `20260422140000_drivers_user_id_link.sql` een koppeling met `auth.users.id`. Zodra chauffeurs zelf inloggen (of niet-HR-rollen), gaan HR-velden lekken. Rolscheiding of kolom-beperking is urgent.

**Input-validatie, nog steeds open**
- BSN 11-proef en IBAN mod-97 zijn client-only. Direct-insert via Supabase client zonder dialog omzeilt ze. Server-side check (trigger of `CHECK` met `plpgsql` functie) ontbreekt nog steeds.

**CSV-export (onveranderd)**
- Bevat geen BSN, IBAN, adres of geboortedatum. Goed.
- Geen audit-rij of waarschuwing dat exporteren PII is.

**Audit-trail, nog steeds open**
- Geen triggers op `drivers` naar `activity_log`. Alleen `update_updated_at_column`. Wijzigingen in BSN, IBAN, status, `current_vehicle_id` en `termination_date` zijn niet reconstructable.

**Edge function `notify-expiring-certificates`**
- Nieuw bekeken, 244 regels. Scan → send-notification. Gebruikt service-role voor DB-read, juiste CORS-helper (commit ad93f87). Bearer-auth is niet van toepassing omdat het via pg_cron met service-role key wordt aangeroepen. OK.

### 5. Slimheid

**Wat al slim is (en vandaag bevestigd)**
- KPI "Verlopend 60d" op de hoofdpagina.
- Sort "Vervalt eerst" zet urgentie bovenaan.
- AI-scan van certificaat-upload vult type + datums in (`DriverCertificateRecordsSection.tsx:136-163`).
- Unieke personeelsnummer per tenant met nette foutmelding.
- Expiry-mailing via pg_cron op 90/30/7/0 dagen (`20260422130000`, `notify-expiring-certificates/index.ts`). Netjes idempotent via dedupe-tabel.

**Wat nog altijd niet slim genoeg is**

1. **Geen inbox-item bij verloop.** De e-mails werken, maar wie mails niet leest of weg-archiveert ziet het pas als de tab bezocht wordt. Variant: edge function voegt ook een rij toe in de `inbox`- of `activity_log`-tabel zodat de Inbox-tab in het product een telling en een directe link toont.
2. **Adres-autofill via PDOK.** Postcode + huisnummer → straat + plaats bestaat gratis. De klanten-flow gebruikt al KvK-autofill (commit f6b4fc9), dezelfde patroon werkt hier één-op-één.
3. **Personeelsnummer auto-suggest.** `MAX(CAST(personnel_number AS int))+1` per tenant als placeholder, reduceert unique-conflicts.
4. **Voertuig-conflict-detectie.** Twee chauffeurs aan dezelfde `current_vehicle_id` koppelen geeft geen waarschuwing.
5. **`termination_date <= today` → auto `is_active=false`.** Nu handmatig.
6. **Compliance-gate.** `driver_gate_passed`-functie bestaat voor voertuigcheck, vergelijkbare check voor "geldig rijbewijs + Code 95 + verplicht cert per werktype" zou op de driver-card een rode vlag geven voor chauffeurs die niet inzetbaar zijn.
7. **`work_types` als beheer-tabel.** Nu hard-coded (`WORK_TYPE_OPTIONS` in `NewDriverDialog.tsx:106`). Beheersbaar zonder deploy zoals certificeringen.

**Hoogst-hangende slimheid-vrucht, 1-2 dagen**

Inbox-integratie van verlopend: breid `notify-expiring-certificates` uit met een extra insert in een `inbox_items`-rij (of `activity_log` met type `CERT_EXPIRING`). De bestaande Inbox-tab telt en toont. De admin krijgt niet alleen mail maar ziet het ook direct in de tool. Dedupe-tabel `driver_certificate_notifications_sent` kan hergebruikt worden met een nieuwe trigger-event per kanaal ('CERT_EXPIRING_INBOX').

Daarnaast blijft **HR-veld-maskering** de security-vrucht met de grootste impact: voeg een `role`-kolom toe in `tenant_users` (of gebruik bestaande rol-mechaniek), maak een view `drivers_public` zonder BSN/IBAN/adres/geboortedatum, laat `useDrivers` die view lezen en de edit-dialog alleen voor rol `admin|hr` de gevoelige velden inladen.

---

## Prioriteitenlijst, top 10 acties

| # | Titel | Type | Effort | Impact | Bestand(en) |
|---|---|---|---|---|---|
| 1 | Rolscheiding HR-velden (BSN, IBAN, adres, geboortedatum) via view `drivers_public` + rolcheck in dialog | Sec | L | hoog | nieuwe migratie, `useDrivers.ts`, `NewDriverDialog.tsx` Administratie-tab |
| 2 | Inbox-integratie voor verlopende certificaten, bovenop bestaande e-mail-flow | Smart | M | hoog | `notify-expiring-certificates/index.ts`, `inbox_items`-insert |
| 3 | Server-side BSN 11-proef + IBAN mod-97 via plpgsql functie + CHECK-constraint | Sec | M | hoog | nieuwe migratie, parity met `driverSchema.ts` |
| 4 | Audit-log trigger op `drivers` naar `activity_log` (create/update/delete, incl. status- en vehicle-wissel) | Sec | M | hoog | nieuwe migratie (analoog aan clients-audit) |
| 5 | Archive-pattern: primaire actie "Archiveer" (`is_active=false`), hard-delete secundair + bucket-cleanup | UX | S | mid | `Chauffeurs.tsx:203-212`, `useDrivers.ts:111` |
| 6 | Adres-autofill via PDOK op postcode + huisnummer | Smart | S | mid | `NewDriverDialog.tsx:516-577`, nieuwe `usePdokAddress`-hook |
| 7 | `maskBsn` daadwerkelijk inzetten met "Toon"-toggle, tot er rolscheiding is | Sec | S | mid | `NewDriverDialog.tsx:808-818` |
| 8 | `termination_date <= today` → automatisch `is_active=false` via daily job of trigger | Smart | S | mid | nieuwe migratie |
| 9 | Status-filter "Inactief" toevoegen en zichtbaarheid `is_active` in tabel/kaart | UX | S | laag | `Chauffeurs.tsx:319-324`, kaart/tabel-cellen |
| 10 | `work_types` naar master-tabel (beheer zonder deploy, analoog aan `driver_certifications`) | Smart | M | laag | nieuwe migratie + CRUD-hook + UI onder Certificeringen-tab |

## Quick wins, binnen 1 dag

- `maskBsn` inzetten met reveal-toggle (#7)
- Status-filter "Inactief" + `is_active` zichtbaar in kaart/tabel (#9)
- Tooltip of banner uitleggen waarom Certificaten-tab disabled is bij create
- `current_vehicle_id`-conflict-waarschuwing toevoegen bij save (één query: `SELECT 1 FROM drivers WHERE current_vehicle_id = :v AND id <> :id`)

## Structurele verbeteringen, >1 dag

- Rolscheiding HR-velden (#1)
- Inbox-integratie verlopend (#2)
- Server-side BSN/IBAN-check (#3)
- Audit-log (#4)
- Archive-pattern incl. data-migratie voor historische drivers (#5)

## Wat sinds gisteren opgelost is (verifieerbaar)

- AlertDialog vervangt `window.confirm` in alle drie de driver-delete-flows.
- Icon-only actieknoppen (edit, delete, more) hebben aria-labels.
- Unsaved-changes-waarschuwing bij sluiten van `NewDriverDialog`.
- Tenant-scoping van `USING (true)`-RLS-policies in aangrenzende tabellen (migratie 20260423210000).
- Service-role-policies expliciet (20260423220000).
- `work_types` kolom + UI-sectie (20260423130000 + `NewDriverDialog.tsx:756-786`).

## Open vragen aan Badr

1. Is er al een rol-scheiding (admin / planner / hr / chauffeur) in `tenant_users`, of moet die als eerste stap gebouwd worden vóór item #1 landen kan?
2. Is een chauffeur-inbox-item gewenst per admin-rol, of globaal per tenant?
3. Bij archivering: data keeping beleid, blijft BSN/IBAN bewaard op een `is_active=false`-rij of wordt dat na N maanden gewist voor AVG?
4. Mag de storage-bucket `driver-certificates` opgeruimd worden bij hard-delete (weesbestanden), of moet dat via aparte retention-job?
