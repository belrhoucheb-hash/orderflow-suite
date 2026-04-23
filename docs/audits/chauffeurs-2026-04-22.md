# Audit, Chauffeurs-tab

**Datum:** 2026-04-22
**Bekeken bestanden:** 12

## Bekeken bestanden

- `src/pages/Chauffeurs.tsx` (807 regels), hoofdweergave, KPI's, filters, tabel of kaart, export
- `src/components/drivers/NewDriverDialog.tsx` (970 regels), 7-tab formulier
- `src/components/drivers/DriverCertificationsSection.tsx` (233 regels), master-beheer certificeringen
- `src/components/drivers/DriverCertificateRecordsSection.tsx` (429 regels), uploads en AI-scan
- `src/components/drivers/DriverCertificateRecordDialog.tsx`, `DriverCertificationDialog.tsx`
- `src/hooks/useDrivers.ts`, `useDriverCertifications.ts`, `useDriverCertificateRecords.ts`
- `src/lib/validation/driverSchema.ts`, BSN/IBAN/leeftijdsvalidatie
- `src/hooks/useTenantInsert.ts`, tenant-id injectie
- `supabase/migrations/20260419000000_baseline.sql` (RLS-policies op drivers)
- `supabase/migrations/20260421170000_driver_compliance_fields.sql` (adres, BSN, IBAN, personeelsnr)
- `supabase/migrations/20260422120000_driver_certificate_records.sql` (document-bucket + notes)
- `src/__tests__/pages/Chauffeurs.test.tsx`

## Sprint-status op deze tab

Sprint 4 chauffeurs-redesign is grotendeels geland (compliance-velden, AI-scan van certificaten, certificering-master, document-bucket). Geen merkbare regressies of halfgebouwde migraties. De structuur is solide.

## Samenvatting

De tab draait, ziet er verzorgd uit en heeft al een paar slimme ingrediënten: verloop-KPI 60 dagen, AI-scan van certificaat-uploads, uniciteitsbescherming op personeelsnummer. Maar de echte pijn zit in drie dingen. Eén, de gevoelige HR-data (BSN, IBAN, thuisadres, geboortedatum) is zichtbaar voor elke `authenticated` user zonder rolscheiding. Twee, het formulier met 7 tabs legt de drempel hoog voor kleine correcties en de certificaten-tab is disabled bij create zonder heldere uitleg. Drie, de "verlopend 60d" is zichtbaar maar passief, er is geen push-notificatie of inbox-integratie, en de tab is nog niet echt slim over context (geen adres-autofill via postcode, geen personeelsnr-suggestie, geen waarschuwing bij dubbel voertuig-koppeling).

## Score-overzicht

| Aspect | Score | Kern-observatie |
|---|---|---|
| CRUD volledigheid | 🟡 | Werkt volledig, maar hard-delete zonder archive-pattern, status mist bij create, `.select('*')` zonder paginatie |
| UI / UX kwaliteit | 🟡 | 7-tab formulier is zwaar, inconsistente confirmaties (AlertDialog vs `window.confirm`), icon-only actieknoppen missen aria-label |
| Performance | 🟢 | Prima voor 50-200 chauffeurs, geen N+1, react-query cache gedeeld |
| Security | 🟡 | RLS OK, maar BSN/IBAN/adres toegankelijk voor elke authenticated user, geen audit-log op driver-mutaties |
| Slimheid | 🟡 | Goede start (AI-scan, verloop-KPI), maar passief: geen nudge, geen autofill, geen conflict-detectie |

---

## Bevindingen per fase

### 1. CRUD-functionaliteit

**CREATE** (`NewDriverDialog.tsx:206`, `useDrivers.ts:78`)
- Werkt end-to-end via Zod-schema `driverSchema`, server-side RLS, tenant-injectie via `useTenantInsert`.
- BSN elfproef (`driverSchema.ts:30`) en IBAN mod-97 (`driverSchema.ts:45`), alleen client-side. Een direct insert via Supabase client omzeilt deze validatie. Zie security-sectie.
- Status en vehicle-toewijzing worden alleen in edit-mode meegestuurd (`NewDriverDialog.tsx:278-285`). Bij create valt het terug op DB-default `beschikbaar`. Acceptabel, maar onzichtbaar voor de gebruiker, je kunt niet direct een chauffeur aanmaken die nog niet beschikbaar is (bijv. "uitdienst" of "ziek").
- Certificaten-tab is `disabled={!driver}` (`NewDriverDialog.tsx:392`). Rechtvaardig (je hebt een driver-id nodig voor upload), maar de enige uitleg is een cursief zinnetje op de tab zelf. Gebruikers gaan klikken en niet begrijpen waarom het niet werkt.

**READ** (`Chauffeurs.tsx:107-176`)
- Volledige lijst via `useDrivers()`, geen paginatie of virtualisatie. `select("*")` levert alle velden inclusief BSN en IBAN binnen voor de hele lijst. Bij 50-200 chauffeurs prima, maar bij >500 of als BSN/IBAN gescoped moet worden is dit niet houdbaar.
- Sortering via `localeCompare` op Nederlandse namen, stabiel. Sort-opties: naam, status, uren, eerstverlopende. Geen multi-column sort, geen persist van sort-voorkeur per gebruiker.
- Filters werken: zoek op naam/email/telefoon/rijbewijs/personeelsnr, status, certificering, voertuig-koppeling. Combinatie werkt correct (AND). Maar: geen filter op "uitdienst" of "termination_date in verleden", terwijl dat in de praktijk de eerste zeef-vraag is ("wie zijn nog actief?").
- Status-filter dropdown toont geen "inactief/uitdienst"-optie, want `status` is vrije tekst gecombineerd met `is_active` als aparte booleanse flag die nergens in de UI zichtbaar is (`useDrivers.ts:22`).

**UPDATE** (`NewDriverDialog.tsx:289`, `useDrivers.ts:93`)
- Alle velden op één record bewerkbaar, inclusief BSN/IBAN.
- Geen optimistic update, UI wacht op server. Bij typisch <100 ms geen probleem.
- Geen merge-conflict-beveiliging (bijv. `updated_at` matching), als twee users tegelijk werken overschrijft de laatste de eerste. Bij RCS met 1-3 admins nauwelijks een probleem, maar het moet wel genoteerd.
- Wijziging van `status` of `current_vehicle_id` kan via dit formulier, maar ook via plannings-flows elders, die twee ingangen consistent houden is risico voor drift.

**DELETE** (`Chauffeurs.tsx:203-212`, `useDrivers.ts:110`)
- Hard-delete via `AlertDialog` met duidelijke NL-melding dat historie behouden blijft.
- Klopt dankzij `ON DELETE SET NULL` op `orders.driver_id` (baseline.sql:3900), `vehicle_damage_events`-kolommen en `drivers.current_vehicle_id`. **Maar** `vehicle_checks.driver_id` is `ON DELETE CASCADE` (baseline.sql:4150) en `driver_availability.driver_id` ook (driver_availability.sql:15). Dus oude voertuigchecks en beschikbaarheid verdwijnen mee, dat spreekt de UI-tekst "historie blijft bestaan" tegen.
- Geen soft-delete of archive-pattern, hoewel `is_active` en `termination_date` wel bestaan. Conform feedback SG-01 (archiveren voor stamgegevens) zou de default-actie "Archiveer" moeten zijn met hard-delete als secundaire optie.
- Geen undo-window.

### 2. UI / UX kwaliteit

**Layout & hiërarchie**
- KPI-strip is helder en direct bruikbaar (`Chauffeurs.tsx:291-303`). "Verlopend 60d" verandert van kleur bij >0, goed.
- Filter-bar gebruikt Selects, conform de feedback "filters altijd als Select, nooit pills met emoji's".
- Kaart- en tabel-toggle is een ingebouwde segmented control (`Chauffeurs.tsx:371-390`), niet een Select. Inconsistent met restant maar acceptabel voor view-switch.
- Toevoeg-knop is primair en dominant, goed.

**Forms, `NewDriverDialog.tsx`**
- 7 tabs (Basis, Adres, Legitimatie, Werk, Administratie, Nood, Certificaten) is **te veel** voor een quick edit. Een gebruiker die alleen een telefoonnummer wil aanpassen moet eerst navigeren. Overweeg: groepeer Basis+Adres, zet Legitimatie+Certificaten samen, Administratie+Nood apart.
- Validatie-errors stuurt automatisch naar de juiste tab (`resolveTabForError`), goed.
- Labels zijn NL en helder. Geen hangende Engelse strings gezien.
- Datumvelden: DatePicker met `captionLayout="dropdown-buttons"` en `fromYear/toYear`-bereiken, werkt voor oude geboortedata.
- IBAN wordt uppercased tijdens typen, BSN niet getrimd op non-digits in real time (wel in validatie). Geen harde hinder.
- Wijziging-met-unsaved-changes: geen waarschuwing bij sluiten. Een user die per ongeluk "Annuleren" klikt verliest alles stilzwijgend.
- Submit werkt op Enter, Escape cancelled de dialog. OK.

**Destructieve acties**
- `Chauffeurs.tsx`: delete-chauffeur gebruikt **AlertDialog** met destructieve styling, .
- `DriverCertificationsSection.tsx:93`: delete-certificering gebruikt `window.confirm`. Inconsistent, minder toegankelijk, browser-native en niet stijlbaar.
- `DriverCertificateRecordsSection.tsx:215`: delete-certificaat idem `window.confirm`. Twee plekken te fixen.

**Feedback & statussen**
- Loading via `SkeletonGrid`, goed.
- Error via `QueryError` met retry, goed.
- Empty-state bij nul chauffeurs + empty-state bij gefilterde nul-resultaat, beide aanwezig.
- Toast-feedback bij CRUD, consistent met sonner.

**Toegankelijkheid**
- Icon-only edit/delete-knoppen in tabelweergave (`Chauffeurs.tsx:774-789`) hebben geen `aria-label` of `title`. Screenreader leest alleen "button". Fix-cost: 5 minuten.
- MoreHorizontal-dropdown-trigger heeft ook geen label (`Chauffeurs.tsx:582-587`).
- Kleur is bij statussen gecombineerd met icoon+label, goed.

**Mobile/touch**
- Niet relevant voor admin-tab volgens bestaand gebruik (chauffeurs zelf hebben aparte app).

### 3. Performance

- `useDrivers` doet `select("*").order("name")`. Bij 50-200 rijen snel genoeg. Schaalt tot <10 MB payload zonder merkbare pijn.
- Kaart-grid (`Chauffeurs.tsx:432-444`) render alle gefilterde drivers zonder virtualisatie. Bij 60 drivers irrelevant, bij 500+ zichtbaar.
- `filtered` en `stats` zijn gememoiseerd, geen re-render-regen.
- `vehicleMap` en `certLabels` zijn gememoiseerd op hun bronlijst. Goed.
- Geen `React.lazy` op deze route. Chauffeurs is niet-kritisch, prefetch via router is een kleine optimalisatie.
- Certificeringen-hook `staleTime: 60_000`, drivers-hook `30_000`. Consistent genoeg, cache-invalidatie bij mutation is correct gestuurd.
- `DriverCertificationsSection` telt live hoeveel chauffeurs per certificering door de hele driver-lijst heen te lopen (`DriverCertificationsSection.tsx:39-47`). O(n*m), bij 200 drivers * 10 certs = 2000 ops, verwaarloosbaar.

Geen N+1-queries gevonden.

### 4. Security

**RLS** (`baseline.sql:4617-4629`)
- `drivers` heeft 4 policies voor `authenticated` met tenant-isolatie op alle operaties. Service-role heeft volledige toegang. Correct.
- Alle migraties tonen `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` op driver-gerelateerde tabellen.

**Data-exposure binnen tenant** — *grootste bevinding*
- Elke `authenticated` user van de tenant ziet **alle velden van alle chauffeurs**, inclusief:
  - BSN (burgerservicenummer)
  - IBAN (bankrekening voor salaris)
  - Thuisadres (straat, huisnr, postcode, plaats)
  - Geboortedatum
  - Noodcontact-telefoon
- `driverSchema.ts:196` bevat een `maskBsn`-helper die **nergens wordt gebruikt** in de UI. Hij ligt klaar maar verbergt niets.
- Voor RCS waar vooral admins inloggen is het risico beperkt. Zodra planners, dispatchers of chauffeur-accounts (`drivers.user_id`, baseline-migratie 20260422140000) toegang krijgen, lekken HR-velden.
- Advies: split-table of `security_barrier` view die gevoelige velden weergeeft alleen voor rol `admin` of `hr`. Of: kolom-beperking via Supabase policy (`USING` per kolom, al technisch lastig in PG) of via een view.

**Input-validatie**
- BSN-elfproef en IBAN mod-97 zijn **client-side only**. Een kwaadwillende authenticated user kan een random 9-cijferig BSN of ongeldige IBAN inserten met `supabase.from("drivers").insert(...)`. In de huidige tenant-setup is dat vooral self-harm, maar voor compliance (loonadministratie) moet er een server-side check komen, bijvoorbeeld een `CHECK`-constraint met een SQL-functie die de elfproef doet, of een trigger.
- Geen XSS-risico in Chauffeur-lijst, alle user-content gaat door React's escape.
- Geen file-upload op deze primaire tab. Upload zit op `DriverCertificateRecordsSection`, daar is MIME-type, grootte (10 MB) en bucket-path validatie geregeld. OK.

**Data-exposure extern**
- CSV-export (`Chauffeurs.tsx:214-251`) bevat naam, personeelsnr, email, telefoon, status, voertuig-plaat, dienstverband, uren, indienstdatum, rijbewijs-tot, code95-tot. **Geen** BSN, IBAN, adres of geboortedatum. Goed gekozen.
- Filename `chauffeurs-YYYY-MM-DD.csv`, BOM voor Excel. Prima.
- Geen sign-off of auditmoment bij export, terwijl dit PII-data is. Overweeg: toast "export bevat persoonsgegevens, bewaar veilig" of log de export in `activity_log`.

**Audit-trail**
- Geen rij in `activity_log` bij create/update/delete van een driver. `clients` krijgt wel audit-trail (20260422001000). Chauffeurs-wijzigingen (vooral: status, vehicle, BSN, IBAN, termination_date) zijn niet traceerbaar. Sprint 2-principe "audit trail op wijzigingen" is hier dus niet ingelost.

### 5. Slimheid

**Wat al slim is**
- KPI "Verlopend 60d" maakt houdbaarheid zichtbaar in één blik.
- Sort-optie "Vervalt eerst" zet urgentie bovenaan.
- Datumvelden tonen live "Verloopt over N dagen" of "Verlopen N dagen geleden" (`NewDriverDialog.tsx:939-957`).
- AI-scan van certificaat-uploads vult type, uitgiftedatum en vervaldatum (`DriverCertificateRecordsSection.tsx:125-153`). Groot.
- Unieke personeelsnummer per tenant met duidelijke foutmelding (`NewDriverDialog.tsx:343-348`).

**Niet slim genoeg, ruimte voor laaghangend fruit**

1. **Verloopmelding is passief.** De "60d"-KPI ziet alleen wie de tab opent. Er is geen inbox-item of e-mail bij T-60d, T-30d, T-7d. RCS gebruikt de `Inbox`-tab al als centraal actiebord, haak chauffeur-verloop daarop aan. Een dagelijkse cron-function scant en prikt een Inbox-item, klikbaar naar chauffeurs-tab gefilterd op die chauffeur.
2. **Adres-autofill op postcode+huisnummer.** Eerder is voor klanten al KvK-autofill gebouwd (commit f6b4fc9). Voor chauffeurs zou postcode+huisnr. → straat+plaats via PDOK (gratis, NL-officieel) de 4 adresvelden tot 2 reduceren. Analoog aan de klant-flow.
3. **Personeelsnummer auto-suggest.** Bij create: toon "volgend vrij nummer is 0043" als hint of als placeholder. Nu moet de user zelf raden en de unique-constraint vangt fouten pas achteraf op.
4. **Voertuig-conflict-detectie.** Twee chauffeurs aan dezelfde `current_vehicle_id` koppelen geeft nu geen waarschuwing. Vraag: "Peter is al aan BZ-12-34 gekoppeld. Wissel of behoud dubbel?".
5. **Termination_date automatisch uitvoeren.** Als `termination_date <= vandaag` zou `is_active` automatisch `false` moeten worden, via trigger of dagelijkse job. Nu moet iemand eraan denken.
6. **"Duplicaat-check vooraf"** op naam+geboortedatum of email+telefoon. Nu pas bij opslaan.
7. **Code 95 + rijbewijs koppelen aan verplicht certificaat voor C/CE.** Als een chauffeur gekoppeld is aan een C/CE-voertuig maar geen geldige Code 95 heeft, zou dat op de driver-card moeten flashen. `driver_gate_passed`-functie bestaat al voor voertuigcheck, zelfde idee uitbreiden naar compliance.

**Hoogst-hangende slimheid-vrucht (1-2 dagen):**
Inbox-integratie van verlopende certificaten en documenten. Cron-function in Supabase `driver-expiry-notifier` die dagelijks een gescan doet op `legitimation_expiry_date`, `code95_expiry_date` en `driver_certification_expiry.expiry_date`, drempels T-60/T-30/T-7, en een Inbox-rij inserteert. De UI-tab ziet 'm automatisch. Pakt 80% van de "ik zag het te laat"-klachten weg en leunt op bestaande infrastructuur.

---

## Prioriteitenlijst, top 10 acties

| # | Titel | Type | Effort | Impact | Bestand(en) |
|---|---|---|---|---|---|
| 1 | Rolscheiding op HR-velden: BSN, IBAN, adres, geboortedatum alleen zichtbaar voor admin/hr-rol | Sec | L | hoog | `baseline.sql` (policy per kolom of view), UI voor andere rollen maskeren |
| 2 | Server-side BSN-elfproef + IBAN-checksum via Postgres CHECK of trigger | Sec | M | hoog | `supabase/migrations/*` (nieuwe migratie), `driverSchema.ts` voor parity |
| 3 | Audit-log op driver-mutaties (create/update/delete, incl. status- en vehicle-wissel) | Sec | M | hoog | migratie trigger → `activity_log`, parallel aan clients-audit |
| 4 | Inbox-notificaties bij verlopend rijbewijs/Code 95/certificaat (T-60, T-30, T-7) | Smart | M | hoog | nieuwe Edge Function + inbox-tabel |
| 5 | Archive-pattern: default "Archiveer" (`is_active=false`), hard-delete secundair | UX | S | mid | `Chauffeurs.tsx:203-212`, `useDrivers.ts:110` |
| 6 | Adres-autofill via postcode+huisnummer (PDOK) | Smart | S | mid | `NewDriverDialog.tsx:451-511`, nieuwe hook analoog aan KvK-autofill |
| 7 | Vervang `window.confirm` in certificering/certificaat-delete door AlertDialog | UX | S | laag | `DriverCertificationsSection.tsx:93`, `DriverCertificateRecordsSection.tsx:215` |
| 8 | Aria-labels op icon-only edit/delete/more-knoppen | UX/a11y | S | mid | `Chauffeurs.tsx:582-587, 774-789` |
| 9 | Personeelsnummer auto-suggest + duplicaat-hint-vooraf bij create | Smart | S | laag | `NewDriverDialog.tsx:697-710`, `useDrivers.ts` |
| 10 | Termination_date >= vandaag triggert `is_active=false` via dagelijkse job of trigger | Smart | S | mid | nieuwe migratie, trigger op update + dagelijkse scan |

## Quick wins, binnen 1 dag

- Aria-labels op icon-knoppen (#8)
- `window.confirm` → `AlertDialog` (#7)
- Status-optie "inactief/uitdienst" toevoegen aan filter-dropdown
- Tooltip of helptekst waarom Certificaten-tab disabled is bij create (niet alleen een cursieve regel op de tab zelf)
- `maskBsn` daadwerkelijk gebruiken in de edit-dialog-weergave totdat een user expliciet "toon" klikt
- Waarschuwing bij sluiten van `NewDriverDialog` met unsaved changes

## Structurele verbeteringen, >1 dag

- Rolscheiding op HR-velden (#1)
- Audit-log op driver-mutaties (#3)
- Inbox-integratie verlopend (#4)
- Server-side BSN/IBAN-check (#2)
- Archive-pattern (#5) incl. data-migratie voor historische drivers

## Open vragen

1. Welke rollen bestaan er binnen RCS? Alleen "admin" of ook "planner/dispatcher" die géén BSN/IBAN hoeft te zien?
2. Is het wenselijk dat verwijderen van een chauffeur de voertuigchecks en beschikbaarheidsrecords cascadeert, of willen we die historie bewaren?
3. Moet de Inbox-notificatie van verlopen documenten naar één admin, of per-chauffeur (leidinggevende)?
4. Wat is het afgesproken moment om `is_active=false` te zetten: op `termination_date` precies, of `termination_date + N dagen` zodat er nog tijd is voor loonafsluiting?