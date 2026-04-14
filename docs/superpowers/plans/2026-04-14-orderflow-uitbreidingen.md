---
title: Orderflow Suite — uitbreidingen Q2 2026
date: 2026-04-14
status: draft (requirements, geen implementatieplan)
author: Badr
---

# Orderflow Suite — uitbreidingen

Dit document zet ruwe wensen om in toetsbare requirements. Per onderwerp:
**status nu** (audit), **doel**, **requirement**, **acceptatie**, **open vragen**.

Audit-referenties verwijzen naar bestaande code; "MISSING" betekent dat de
functionaliteit niet in de codebase voorkomt op 2026-04-14.

---

## 1. Inbox — factuur uitlezen

**Status nu:** Inbox bestaat ([src/pages/Inbox.tsx](src/pages/Inbox.tsx),
[src/hooks/useInbox.ts](src/hooks/useInbox.ts)) en parseert `.eml` / `.msg`
naar orders. Factuurherkenning ontbreekt.

**Doel:** Inkomende facturen (PDF/eml-attachment) automatisch herkennen,
extraheren en koppelen aan een order of leverancier.

**Requirement:**
- Detecteer facturen op basis van afzender, onderwerp en/of attachment-type
  (PDF met factuurnummer-patroon).
- Extractie-velden: factuurnummer, datum, leverancier, totaalbedrag,
  BTW, ordernummer-referentie (indien aanwezig).
- Routeer naar nieuwe sectie "Facturen in" — niet naar de orders-stroom.
- Bij match op ordernummer: koppel aan order; bij geen match: queue voor
  handmatige toewijzing.

**Acceptatie:** 10 testfacturen van verschillende leveranciers → ≥80%
correcte extractie van de 6 kernvelden zonder handmatige correctie.

**Open vraag:** OCR alleen op tekst-PDF, of ook scan-PDF (Tesseract /
Document AI)? Welke leveranciers eerst?

---

## 2. Order — afdeling, per-afdeling commentaar, zichtbare banner

**Status nu:** Geen `afdeling` op orders. Eén `comments`-veld.

**Doel:** Iedere order is gekoppeld aan een afdeling (Export, Operations).
Commentaar per afdeling apart, zodat het niet over het hoofd gezien wordt.

**Requirement:**
- Veld `department` op order: enum `export | operations` (verplicht).
- Velden `comments_export` en `comments_operations` (apart, niet één blob).
- UI: bij niet-leeg commentaar een **gekleurde banner** bovenaan de
  orderkaart per afdeling (export = oranje, operations = blauw, of n.t.b.).
  Banner moet op de lijstweergave ook zichtbaar zijn, niet pas in detail.

**Acceptatie:** Order met operations-commentaar toont rode/oranje banner
in lijstweergave; export-commentaar idem in eigen kleur; lege secties
geen banner.

**Open vraag:** Welke kleuren? Mogen banners ge-dismissed worden of moeten
ze blijven tot commentaar leeg is?

---

## 3. Auto-split bij gemengde traject-afdelingen

**Status nu:** MISSING.

**Doel:** Wanneer laden en lossen tot verschillende afdelingen behoren
(bijv. laden = operations, lossen = export RCS), splits automatisch in
twee opdrachten met de juiste afdeling per opdracht.

**Requirement:**
- Per traject-regel (pickup/dropoff) een `department`-veld (zie §11).
- Bij opslaan order: als `pickup.department <> dropoff.department`, maak
  twee gekoppelde opdrachten met:
  - opdracht 1: alleen operations-traject, afdeling = operations
  - opdracht 2: alleen export-traject, afdeling = export
- Beide opdrachten houden referentie naar de oorspronkelijke order
  (`parent_order_id`).

**Acceptatie:** Order met operations-laden + export-lossen genereert
twee opdrachten, juiste afdeling automatisch ingevuld, beide vindbaar
via parent.

**Open vraag:** Mag dit één gecombineerde rit blijven voor de chauffeur,
maar twee administratieve opdrachten? Of strikt gescheiden?

---

## 4. Per-regel afmetingen

**Status nu:** PARTIAL — één `dimensions` text-veld op order
([src/integrations/supabase/types.ts](src/integrations/supabase/types.ts)).

**Doel:** Iedere colli (pallet/doos) heeft eigen afmetingen + gewicht.

**Requirement:**
- Nieuwe tabel `order_items` met: `order_id`, `qty`, `length_cm`,
  `width_cm`, `height_cm`, `weight_kg`, `description`.
- UI: in orderform een dynamische lijst regels toevoegen.
- Som van gewicht/volume zichtbaar op order voor tariefberekening (zie §7).

**Acceptatie:** Order met 5 pallets in 3 verschillende afmetingen kan
opgeslagen worden en tarief-impact is zichtbaar.

---

## 5. PMT-flow (zending onveilig)

**Status nu:** MISSING.

**Doel:** Markeer zending als onveilig → start PMT-proces met variant
EDD of XRAY, koppel chauffeur, track aankomst en EAT.

**Requirement:**
- Order-veld `security_status`: `safe | unsafe`.
- Bij `unsafe`: verplicht veld `pmt_type`: `edd | xray` (klant bepaalt).
- **EDD:** genereer docsheet (template); extra kolommen op order:
  - `assigned_chauffeur` (FK naar drivers)
  - `arrived_at` (live tracking, zie §LiveTracking)
  - `eat` (estimated arrival time)
- **XRAY:** genereer Excel uit template, zelfde invoervelden, alleen
  het outputformaat verschilt; ook `assigned_chauffeur` zichtbaar.
- Beide templates opslaan als ingevuld document op de order.

**Acceptatie:** Onveilige zending markeren → kies EDD → docsheet PDF
met alle gegevens + chauffeur + EAT downloadbaar. Idem XRAY → Excel.

**Open vraag:** Templates aanleveren door klant; waar opslaan
(Supabase Storage)? Wie tekent docsheet?

---

## 6. KM-database check voor zendingen

**Status nu:** MISSING.

**Doel:** Zending verifiëren tegen externe KM-database vóór accepteren.

**Requirement:** Onduidelijk — welke database? API of bestand?
**→ NEEDS INPUT voordat dit een echte requirement wordt.**

---

## 7. Facturatie — tariefzichtbaarheid + auto-verzending

**Status nu:** PARTIAL — `per_km` en `per_rit` tarieftypes bestaan
([src/hooks/useInvoices.ts](src/hooks/useInvoices.ts)). Auto-verzending
op basis van stamgegevens MISSING.

**Doel:** Tarief direct zichtbaar bij orderintake op basis van
gewicht/lengte/breedte + uitzonderingen. Factuur automatisch naar
stamgegevens-contact van de klant.

**Requirement:**
- Tariefmatrix uitbreiden met dimensie- en gewichtsbrackets +
  uitzonderingen (per klant override).
- Bij orderintake: live-berekend tarief tonen op basis van
  `order_items` totalen.
- Klantstamgegevens veld `invoice_email` (apart van algemeen contact).
- Bij factuur "definitief": auto-verzend naar `invoice_email` (PDF
  bijlage), log in `invoice_sent_log`.

**Acceptatie:** Order met 800 kg, 2.4m lengte → tarief automatisch
zichtbaar inclusief lengtetoeslag. Factuur definitief maken → mail
binnen 1 minuut bij klant volgens stamgegevens.

---

## 8. Klantenportaal — order zelf invoeren + statusketen

**Status nu:** PARTIAL — portaal bestaat
([src/pages/portal/PortalOrders.tsx](src/pages/portal/PortalOrders.tsx)),
zelf orders aanmaken werkt. Statusberichten als follow-up op
opdrachtbevestiging MISSING (huidige follow-ups gaan over ontbrekende
velden, [src/components/inbox/InboxFollowUpPanel.tsx](src/components/inbox/InboxFollowUpPanel.tsx)).

**Doel:** Order → RCS-bevestiging → opdrachtbevestiging (OB) → alle
verdere mail (statussen, wijzigingen, POD) is een **reply-in-thread**
op de OB. Eén thread per order in klantmailbox.

**Requirement:**
- Bij verzenden OB: bewaar `Message-ID` op order.
- Alle volgende uitgaande mails: zet `In-Reply-To` en `References` op
  het OB-Message-ID.
- Mailtemplates voor: geladen, onderweg, geleverd, vertraging, POD.

**Acceptatie:** Klantmailbox toont alle order-correspondentie als één
thread per order.

---

## 9. POD — laden + lossen, auto-CMR, scan-validatie

**Status nu:** PARTIAL — POD viewer
([src/components/orders/PodViewer.tsx](src/components/orders/PodViewer.tsx))
en CMR-document
([src/components/orders/CMRDocument.tsx](src/components/orders/CMRDocument.tsx))
bestaan. Auto-mail CMR naar klant en split laden/lossen MISSING.

**Doel:** Iedere order heeft 2 PODs (laden + lossen). CMR krijgt
chauffeur mee én opdrachtgever ontvangt deze. Gescande documenten
worden gevalideerd tegen orderdata.

**Requirement:**
- Splits POD in `pod_load` en `pod_unload` (handtekening + foto's per
  fase).
- Bij scan/upload: OCR + cross-check kernvelden (ordernummer, aantal
  colli, gewicht) tegen order; afwijkingen flaggen.
- Auto-mail CMR naar klant zodra `pod_unload` compleet is.

**Acceptatie:** Chauffeur tekent bij laden → status; tekent bij lossen
→ CMR PDF wordt automatisch naar klant gemaild. Scan met afwijkend
gewicht → waarschuwing in admin.

---

## 10. RouteLogic — al aanwezig

**Status nu:** EXISTS — VRP-solver
([src/lib/vrpSolver.ts](src/lib/vrpSolver.ts)) en route-optimizer met
2-opt ([src/lib/routeOptimizer.ts](src/lib/routeOptimizer.ts)).

**Actie:** Geen nieuwe requirement; valideren of huidige solver dekt
wat in de praktijk nodig is (combinatieritten zie §13).

---

## 11. Per-regel afdelingskoppeling (pickup/dropoff)

**Zie §3.** Implementatie van `department` op iedere traject-regel is
de fundering voor de auto-split.

---

## 12. Nostradamus HR-koppeling

**Status nu:** MISSING.

**Doel:** Chauffeur-/personeelsgegevens uit Nostradamus halen i.p.v.
dubbel onderhouden.

**Requirement:** Onduidelijk — API beschikbaar? Welke velden?
Read-only sync of bidirectioneel?
**→ NEEDS INPUT voordat dit een requirement wordt.**

---

## 13. Slimme "geladen"-mail bij combinatieritten

**Status nu:** MISSING.

**Probleem:** Bij gecombineerde rit (meerdere ophalingen op
verschillende locaties, meerdere afleveringen) is "uw zending is
geladen" misleidend — kan nog uren duren tot aankomst.

**Voorgestelde regel:**
- Verstuur "geladen"-mail **alleen** als de eerstvolgende stop voor
  die zending de aflevering is.
- Bij gecombineerde rit: vervang "geladen"-mail door **ETA-mail** met
  tijdsindicatie, getriggerd op moment dat resterende stops vóór
  aflevering ≤ 1 zijn (of op X minuten/km voor aankomst).
- RCS export "take it or leave it" rit (1 ophaal, 1 aflever): mag
  direct "geladen"-mail krijgen.

**Acceptatie:** Combinatierit met 3 ophalingen → klant 1 krijgt geen
geladen-mail bij eerste ophaal, krijgt ETA-mail vlak voor aankomst.
Solo-rit → klant krijgt direct geladen-mail.

**Open vraag:** Wat is "vlak voor aankomst" — vaste 30 min, of na
laatste tussenstop?

---

## 14. RCS export auto-mail bij T.I.O.L.I.-rit

**Onderdeel van §13.** Solo-rit + RCS export = direct mail toegestaan.

---

## 15. Postbode / boxen-service

**Status nu:** MISSING.

**Doel:** Aparte tab voor boxen-opdrachten; dispatch naar chauffeur
via WhatsApp; status terugkoppelen in tab.

**Requirement:**
- Nieuwe sectie/tab `Postbode` los van reguliere orders.
- Order-aanmaak met velden: ophaal, aflever, deadline, doosgrootte.
- WhatsApp-dispatch: bestaande WhatsApp-webhook
  ([supabase/functions/whatsapp-webhook/](supabase/functions/whatsapp-webhook/))
  hergebruiken.
- Statusupdates van chauffeur (geladen/geleverd) terug in tab.

**Acceptatie:** Operator maakt boxen-opdracht → chauffeur ontvangt
WhatsApp → reply "geleverd" → status zichtbaar in Postbode-tab.

---

## 16. Schadeportaal

**Status nu:** MISSING.

**Doel:** Schade vastleggen en historie opbouwen, inclusief
mid-trip-check.

**Requirement:**
- Tabel `damages`: voertuig, chauffeur, order (optioneel), datum,
  beschrijving, foto's, ernst.
- Schadegeschiedenis-view per voertuig en per chauffeur.
- Mid-trip check: chauffeur krijgt halverwege een trip prompt om
  voertuigstatus te bevestigen / schade te melden.

**Acceptatie:** Schade gemeld → zichtbaar in voertuighistorie + in
chauffeurhistorie + telt mee in dashboard.

---

## 17. Voertuigcheck als gate vóór orderzichtbaarheid

**Status nu:** MISSING.

**Doel:** Chauffeur kan pas orders zien/starten nadat voertuigcheck
van die dag is afgerond.

**Requirement:**
- Tabel `vehicle_checks`: chauffeur, voertuig, datum, checklist-items
  (boolean per item), opmerkingen, foto's, ondertekening.
- In `ChauffeurApp` ([src/pages/ChauffeurApp.tsx](src/pages/ChauffeurApp.tsx)):
  bij eerste login van de dag → forceer voertuigcheck-scherm.
- Orderlijst pas zichtbaar als check voor vandaag bestaat én alle
  blokkerende items "ok" zijn.
- Schade gevonden → automatisch entry in §16 + admin-flag.

**Acceptatie:** Chauffeur logt in 's ochtends → ziet alleen
voertuigcheck; vult in → orderlijst verschijnt. Probeert direct naar
order te navigeren → redirect naar check.

---

## 22. Info-tracking — "incompleet maar planbaar"

**Status nu:** MISSING. Vandaag wordt *dossier compleet* verward met
*dossier planbaar*. Gevolg: chauffeur staat op laadadres zonder laadref →
planning belt klant → tijdverlies. Alternatief (wachten tot compleet) =
dedicated rit = duur.

**Probleem:** Veel klanten zeggen "laadref volgt" en vergeten dat vervolgens.
We willen wél alvast inplannen (combinatierit blijft mogelijk), maar het
systeem moet de klant proactief achter de broek zitten — niet de chauffeur
's ochtends om 08:30.

**Kernidee:** Naast `status` (DRAFT / PLANNED / ...) een tweede, parallelle
dimensie `info_status` (COMPLETE / AWAITING_INFO / OVERDUE). Afgeleid, niet
handmatig. Blokkeert het inplannen **niet**.

**Requirements:**
- **REQ-22.1** `orders.info_status` enum (COMPLETE | AWAITING_INFO | OVERDUE),
  afgeleid uit openstaande `order_info_requests`.
- **REQ-22.2** Orders met `info_status ≠ COMPLETE` blijven inplanbaar
  (voertuig, chauffeur, datum). De bestaande DRAFT-guard checkt **alleen**
  `department_id`, niet overige velden.
- **REQ-22.3** In NewOrder/OrderDetail kan per veld (laadref, losref, mrn,
  contactpersoon, tijdslot) aangevinkt worden "📩 volgt van klant". Het
  veld blijft leeg, er wordt een `order_info_requests`-rij aangemaakt met
  `expected_by` (default T-4u vóór pickup).
- **REQ-22.4** T-4u vóór pickup: automatische reminder-mail/WhatsApp naar
  `promised_by_contact`.
- **REQ-22.5** T-1u vóór pickup: escalatie naar planner via
  NotificationCenter (geen mail). `info_status` → OVERDUE.
- **REQ-22.6** **Chauffeur pre-departure banner.** In
  [src/pages/ChauffeurApp.tsx](src/pages/ChauffeurApp.tsx): bij "Start rit"
  op order met `info_status ≠ COMPLETE` → rode modal "⚠️ Laadref nog niet
  ontvangen van klant X — bel planner vóór vertrek" + knop "Bel planner".
  Niet hard-blokkerend: planner kan "toch vertrekken" goedkeuren.
- **REQ-22.7** Inbox-parser: reply van klant met ref → AI-extract vult
  veld, zet request op FULFILLED, banner verdwijnt.
- **REQ-22.8** Audit-trail per request: wie beloofde wat, wanneer, welke
  reminders zijn verstuurd (`reminder_sent_at[]`, `escalated_at`).
- **REQ-22.9** Visuele indicators op Orders-lijst en Planbord: ⏳ geel =
  AWAITING_INFO, 🔴 rood = OVERDUE. Filter "Openstaande info".

**Databaseschema (voorstel):**

```sql
ALTER TABLE orders
  ADD COLUMN info_status TEXT NOT NULL DEFAULT 'COMPLETE'
    CHECK (info_status IN ('COMPLETE','AWAITING_INFO','OVERDUE'));

CREATE TABLE order_info_requests (
  id UUID PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  field_name TEXT,                -- 'laadref' | 'losref' | 'mrn' | ...
  status TEXT DEFAULT 'PENDING',  -- PENDING | FULFILLED | OVERDUE | CANCELLED
  promised_by_contact_id UUID,    -- FK client_contacts
  promised_by_name TEXT,
  promised_at TIMESTAMPTZ DEFAULT now(),
  expected_by TIMESTAMPTZ,        -- T-4u vóór pickup
  fulfilled_at TIMESTAMPTZ,
  fulfilled_value TEXT,
  reminder_sent_at TIMESTAMPTZ[],
  escalated_at TIMESTAMPTZ
);
```

**Auto-reminder engine:** edge-function `check-info-requests`, cron 15 min:
- expected_by binnen 4u + geen reminder → stuur klant-reminder.
- expected_by binnen 1u + al gereminded → planner-alert + `info_status` = OVERDUE.
- pickup-dag + rit gestart + nog niet FULFILLED → push naar ChauffeurApp.

**Acceptatie:**
- Order zonder laadref kan als PLANNED opgeslagen worden, krijgt ⏳ badge.
- T-4u: klant ontvangt reminder; `reminder_sent_at` gelogd.
- T-1u: planner-toast verschijnt; badge wordt 🔴.
- Chauffeur klikt "Start rit" op OVERDUE-order → rode modal met "Bel planner".
- Klant reply't met ref → veld gevuld, request FULFILLED, badge weg.

**Relatie tot bestaande DRAFT-guard:** guard blijft zoals hij is — zonder
`department_id` kan planbord de order niet tonen, dus die blokkering is
terecht. Alle andere velden vallen onder info-tracking, niet onder de guard.

**Open vragen:**
- Per-klant reminder-policy (notoire vergeters strengere cadans)? Opslaan in
  `clients.info_policy`?
- Klantportaal deeplink in reminder-mail i.p.v. reply-mail?
- Welke velden zijn default "kan volgen van klant" vs. verplicht bij intake?

**Scope-opties:**

| Optie | Inhoud | Inschatting |
|-------|--------|-------------|
| A. MVP | `info_status` + `order_info_requests` + checkboxes NewOrder + banner OrderDetail + ⏳ badge. Geen cron. | ~1 dag |
| B. + reminders | A + cron edge-function + reminder-template | ~2 dagen |
| **C. + chauffeur-banner** | **B + pre-departure check in ChauffeurApp + "bel planner". Lost kern-pijnpunt op.** | **~2,5 dagen** |
| D. Volledig | C + per-klant policy + klantportaal-deeplink + AI-reply-parser | meer |

**Advies:** start bij C. Dat fikst het chauffeur-op-laadadres-scenario
en is een afgerond iteratiestuk. D als vervolg-prio.

---

## Prioriteitsvoorstel

| Prio | Item | Reden |
|------|------|-------|
| P0 | §17 voertuigcheck-gate | Veiligheid + verzekering |
| P0 | §2 afdeling + banner | Fundering voor §3, §11 |
| P0 | §4 per-regel afmetingen | Fundering voor §7 tarief |
| P1 | §3 + §11 auto-split | Operationele tijdwinst |
| P1 | §9 POD/CMR auto-mail | Klantbelofte |
| P1 | §13 slimme geladen-mail | Klantbelofte + reputatie |
| P1 | §5 PMT-flow | Compliance |
| P2 | §1 factuur-inbox | Admin-tijdwinst |
| P2 | §7 tariefzichtbaarheid + auto-verzend | Cash flow |
| P2 | §15 postbode-tab | Nieuwe service |
| P2 | §16 schadeportaal | Risicobeheer |
| P2 | §8 mailthread-keten | UX klantmail |
| P3 | §6 KM-DB check | NEEDS INPUT |
| P3 | §12 Nostradamus | NEEDS INPUT |
| P0 | §22 info-tracking (optie C) | Voorkomt chauffeur-op-laadadres zonder ref; ontkoppelt compleet van planbaar |

---

## UITDAGING

> Het origineel sluit af met "UITDAGING;" zonder inhoud. Wat is hier de
> uitdaging die je wil dat we adresseren? (Migratie? Volgorde van
> uitrol? Iets anders?) — **ingevuld laten tot verduidelijking.**
