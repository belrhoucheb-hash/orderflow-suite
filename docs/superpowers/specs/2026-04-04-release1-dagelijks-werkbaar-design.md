# Release 1 — "Dagelijks Werkbaar" Design Spec

**Datum:** 2026-04-04
**Doel:** Testklant kan dagelijks werken met OrderFlow Suite — nationaal, internationaal en specialistisch transport.
**Aanpak:** Feature-voor-feature, elk direct bruikbaar na oplevering.
**Volgorde:** F1 → F2 → F3 → F4 → F5 → F6 → F7

---

## Context

OrderFlow Suite is een multi-tenant TMS met ~50% automatisering (doel: 90-95%). De eerste testklant doet nationaal groupage/stukgoed, internationaal FTL/LTL, en specialistisch transport (koel, ADR, bulk). Release 1 dicht de feature gaps zodat deze klant dagelijks kan draaien zonder workarounds.

**Bestaande basis:** 24 pagina's, 35+ database tabellen, 70+ componenten, 7 Edge Functions, React/TypeScript/Supabase/Tailwind/Shadcn.

---

## Feature 1: Tijdvensters & Slotboeking

### Bestaand
- `orders.time_window_start/end` (HH:MM tekstvelden)
- `client_locations.time_window_start/end` (HH:MM tekstvelden)
- `trip_stops.planned_time`, `actual_arrival_time`, `actual_departure_time`

### Nieuwe tabellen

#### `location_time_windows`
Dag-specifieke openingstijden per locatie (bijv. ma-vr 08:00-17:00, za 09:00-13:00).

| Kolom | Type | Beschrijving |
|-------|------|-------------|
| id | UUID PK | |
| client_location_id | UUID FK → client_locations | |
| tenant_id | UUID NOT NULL | |
| day_of_week | INTEGER | 0=ma, 6=zo |
| open_time | TIME | |
| close_time | TIME | |
| slot_duration_min | INTEGER DEFAULT 30 | Duur per slot |
| max_concurrent_slots | INTEGER DEFAULT 1 | Gelijktijdige slots |
| notes | TEXT | |

#### `slot_bookings`
Concrete slot-reserveringen gekoppeld aan orders en trip_stops.

| Kolom | Type | Beschrijving |
|-------|------|-------------|
| id | UUID PK | |
| tenant_id | UUID NOT NULL | |
| client_location_id | UUID FK → client_locations | |
| order_id | UUID FK → orders | |
| trip_stop_id | UUID FK → trip_stops | |
| slot_date | DATE NOT NULL | |
| slot_start | TIME NOT NULL | |
| slot_end | TIME NOT NULL | |
| status | TEXT DEFAULT 'geboekt' | geboekt / bevestigd / geannuleerd / verlopen |
| booked_by | UUID FK → auth.users | |

#### ALTER `trip_stops`
| Kolom | Type | Beschrijving |
|-------|------|-------------|
| planned_window_start | TIME | Tijdvenster begin |
| planned_window_end | TIME | Tijdvenster einde |
| waiting_time_min | INTEGER | Auto-berekend |
| window_status | TEXT DEFAULT 'ONBEKEND' | OP_TIJD / TE_VROEG / TE_LAAT / GEMIST |

### Planning integratie
- **VRP solver:** tijdvensters als harde constraint — order mag niet buiten venster worden ingepland
- **Planning UI:** visuele tijdbalk per stop (groen/oranje/rood), slot-beschikbaarheid bij inplannen, automatisch boeken bij toewijzing
- **Conflict-detectie:** waarschuwing als rit twee stops heeft die niet beide binnen hun tijdvenster passen

### Chauffeur App
- Tijdvenster zichtbaar per stop met countdown
- Wachttijd auto-registratie: start bij aankomst (geofence), stopt bij "laden/lossen gestart"
- Te laat waarschuwing als ETA na venster-einde valt

### Rapportage
- On-time delivery % per klant, chauffeur, locatie
- Gemiddelde wachttijd per locatie
- Venster-overtredingen lijst met reden

---

## Feature 2: Geavanceerde Tariefmodellen

### Bestaand
- `client_rates` (basis: rate_type + amount per klant)
- `invoice_lines` (quantity, unit, unit_price — handmatig)
- `invoiceUtils.ts` (haversine afstandsberekening)

### Nieuwe tabellen

#### `rate_cards`
Tariefkaart per klant (of standaard voor alle klanten).

| Kolom | Type | Beschrijving |
|-------|------|-------------|
| id | UUID PK | |
| tenant_id | UUID NOT NULL | |
| client_id | UUID FK → clients | NULL = standaardtarief |
| name | TEXT NOT NULL | |
| valid_from | DATE | |
| valid_until | DATE | |
| is_active | BOOLEAN DEFAULT true | |
| currency | TEXT DEFAULT 'EUR' | |

#### `rate_rules`
Individuele tariefregels binnen een kaart.

| Kolom | Type | Beschrijving |
|-------|------|-------------|
| id | UUID PK | |
| rate_card_id | UUID FK → rate_cards | |
| rule_type | TEXT NOT NULL | PER_KM / PER_UUR / PER_STOP / PER_PALLET / PER_KG / VAST_BEDRAG / ZONE_TARIEF / STAFFEL |
| transport_type | TEXT | Filter: alleen voor dit type (NULL = alle) |
| amount | NUMERIC NOT NULL | |
| min_amount | NUMERIC | Minimumtarief per zending |
| conditions | JSONB | Flexibele voorwaarden |
| sort_order | INTEGER | |

**Conditions JSONB voorbeelden:**
- Staffel gewicht: `{"weight_from": 0, "weight_to": 500}` → €0.15/kg
- Staffel afstand: `{"distance_from": 0, "distance_to": 100}` → €1.85/km
- Zone-tarief: `{"from_zone": "NL", "to_zone": "DE"}` → vast €450
- Transport-type: `{"transport_type": "koeltransport"}` → €2.10/km

#### `surcharges`
Toeslagen (diesel, weekend, ADR, koeling, wachttijd).

| Kolom | Type | Beschrijving |
|-------|------|-------------|
| id | UUID PK | |
| tenant_id | UUID NOT NULL | |
| name | TEXT NOT NULL | |
| surcharge_type | TEXT NOT NULL | PERCENTAGE / VAST_BEDRAG / PER_KM / PER_KG |
| amount | NUMERIC NOT NULL | |
| applies_to | JSONB | Voorwaarden: `{"requirements": ["ADR"]}`, `{"day_of_week": [5,6]}`, `{"waiting_time_above_min": 30}` |
| is_active | BOOLEAN DEFAULT true | |

### Prijsberekening engine
`calculateOrderPrice(order, rateCard, surcharges)` → PriceBreakdown

1. Zoek juiste rate_card (klant-specifiek → standaard fallback)
2. Match rate_rules op order (transport_type, gewicht, afstand, zone)
3. Bereken basisbedrag (hoogste van berekening vs min_amount)
4. Pas surcharges toe (diesel-%, weekend, ADR, koeling, wachttijd)
5. Return: `{ basisbedrag, toeslagen[], totaal, regels[] voor factuur }`

### Migratie
Bestaande `client_rates` worden gemigreerd naar `rate_cards` + `rate_rules`. Oude tabel blijft als fallback tot migratie bevestigd.

### UI
- **Settings → Tarieven:** standaardtariefkaarten en toeslagen beheren
- **Klant detail → Tarieven tab:** klant-specifieke tariefkaart
- **Order detail → Prijsberekening:** live preview met breakdown
- **Factuur → Auto-regels:** factuurregels automatisch uit prijsberekening

---

## Feature 3: Kostentoerekening per rit

### Bestaand
- `trips.total_distance_km`
- `vehicles.fuel_consumption` (l/100km)
- `invoices` + `invoice_lines` (omzet per order)

### Nieuwe tabellen

#### `cost_types`
Configureerbare kostensoorten per tenant.

| Kolom | Type | Beschrijving |
|-------|------|-------------|
| id | UUID PK | |
| tenant_id | UUID NOT NULL | |
| name | TEXT NOT NULL | |
| category | TEXT NOT NULL | BRANDSTOF / TOL / CHAUFFEUR / VOERTUIG / OVERIG |
| calculation_method | TEXT NOT NULL | PER_KM / PER_UUR / PER_RIT / PER_STOP / HANDMATIG |
| default_rate | NUMERIC | Standaard €/eenheid |
| is_active | BOOLEAN DEFAULT true | |

#### `trip_costs`
Werkelijke kosten per rit.

| Kolom | Type | Beschrijving |
|-------|------|-------------|
| id | UUID PK | |
| tenant_id | UUID NOT NULL | |
| trip_id | UUID FK → trips | |
| cost_type_id | UUID FK → cost_types | |
| amount | NUMERIC NOT NULL | |
| quantity | NUMERIC | km, uren, etc. |
| rate | NUMERIC | Tarief per eenheid |
| source | TEXT DEFAULT 'AUTO' | AUTO / HANDMATIG / IMPORT |
| notes | TEXT | |

#### `vehicle_fixed_costs`
Vaste kosten per voertuig per maand.

| Kolom | Type | Beschrijving |
|-------|------|-------------|
| id | UUID PK | |
| tenant_id | UUID NOT NULL | |
| vehicle_id | UUID FK → vehicles | |
| cost_type_id | UUID FK → cost_types | |
| monthly_amount | NUMERIC NOT NULL | |
| valid_from | DATE | |
| valid_until | DATE | |

#### ALTER `drivers`
| Kolom | Type | Beschrijving |
|-------|------|-------------|
| hourly_cost | NUMERIC | Interne kostprijs per uur |
| km_allowance | NUMERIC | Km-vergoeding |

### Auto-berekening bij rit-voltooiing
| Kostenpost | Berekening |
|------------|-----------|
| Brandstof | distance_km × (fuel_consumption/100) × dieselprijs |
| Tol | Tarief per land × km in dat land (of handmatig) |
| Chauffeur | actual_duration × hourly_cost |
| Voertuig (vast) | monthly_total / werkdagen_maand |
| Wachttijd | Σ waiting_time_min (F1) × chauffeur uurtarief |

### Marge-analyse
- **Per rit:** omzet (uit factuur) − kosten = marge €/% 
- **Per klant (maand):** geaggregeerde omzet − kosten
- **Per route:** netto opbrengst per kilometer

### UI
- **Rit detail → Kosten tab:** alle kostenposten (auto + handmatig), totaal, marge
- **Settings → Kostensoorten:** configureer standaard kostensoorten en tarieven
- **Settings → Brandstofprijs:** huidige dieselprijs instellen
- **Voertuig detail → Vaste kosten:** lease, verzekering, afschrijving, wegenbelasting
- **Dashboard → Marge widget:** marge % week/maand, trend
- **Rapportage → Rendabiliteit:** marge per klant, route, voertuig — top/flop

---

## Feature 4: Groupage / Consolidatie

### Bestaand
- Planning board (drag & drop)
- VRP solver (nearest-neighbor + 2-opt)
- useCapacityMatch hook (kg/pallets validatie)

### Consolidatie-algoritme
1. **Cluster op regio:** groepeer ongeplande orders op delivery-regio (postcode-prefix of afstand < 30km)
2. **Filter op tijdvenster-compatibiliteit:** alleen orders combineren met overlappende of sequentieel haalbare tijdvensters (F1)
3. **Check capaciteit & requirements:** cumulatief gewicht ≤ voertuig max, requirements matchen (ADR bij ADR, koel bij koel, geen ADR + food samen)
4. **Optimaliseer route:** VRP solver bepaalt optimale stopvolgorde per cluster
5. **Wijs voertuig toe:** match cluster met best passend beschikbaar voertuig

### Nieuwe tabellen

#### `consolidation_groups`
Voorstel tot gecombineerde rit.

| Kolom | Type | Beschrijving |
|-------|------|-------------|
| id | UUID PK | |
| tenant_id | UUID NOT NULL | |
| name | TEXT | Auto: "Regio Amsterdam 04-apr" |
| planned_date | DATE NOT NULL | |
| status | TEXT DEFAULT 'VOORSTEL' | VOORSTEL / GOEDGEKEURD / INGEPLAND / VERWORPEN |
| vehicle_id | UUID FK → vehicles | |
| total_weight_kg | NUMERIC | |
| total_pallets | NUMERIC | |
| total_distance_km | NUMERIC | |
| estimated_duration_min | INTEGER | |
| utilization_pct | NUMERIC | Beladingsgraad % |
| created_by | UUID FK → auth.users | |

#### `consolidation_orders`
Orders in een consolidatiegroep.

| Kolom | Type | Beschrijving |
|-------|------|-------------|
| id | UUID PK | |
| group_id | UUID FK → consolidation_groups | |
| order_id | UUID FK → orders | |
| stop_sequence | INTEGER | |
| pickup_sequence | INTEGER | |

### Planning UI
- **"Auto-groeperen" knop** op planbord: analyseert ongeplande orders, genereert consolidatievoorstellen
- **Voorstellen als kaarten:** regio, # orders, gewicht, beladingsgraad, afstand/duur, aanbevolen voertuig
- **Drag & drop:** orders tussen groepen verslepen, handmatig toevoegen/verwijderen
- **Goedkeuren → Trip:** één klik om voorstel om te zetten naar trip met stops
- **Kaartweergave:** clusters op kaart met kleurcodering per groep

### Slimme suggesties
- Bij nieuwe order: "Past bij Groep Amsterdam-Zuid (68% → 81%). Toevoegen?"
- Lage beladingsgraad: "Groep Rotterdam-West is 35% beladen. Combineren met Rotterdam-Oost?"
- Incompatibiliteit: "Order #1042 (ADR) niet combineerbaar met #1038 (food)."
- Deadline: "Order #1045 heeft tijdvenster 09:00-10:00. Eerste stop."

---

## Feature 5: Retourzendingen & Emballage

### Bestaand
- `orders.parent_order_id` (aanwezig, nog niet gebruikt)
- `loading_units` tabel (stamgegevens laadeenheden)

### Retourorders

Retour is een order met `order_type = 'RETOUR'` en `parent_order_id`. Geen aparte tabel.

#### ALTER `orders`
| Kolom | Type | Beschrijving |
|-------|------|-------------|
| order_type | TEXT DEFAULT 'ZENDING' | ZENDING / RETOUR / EMBALLAGE_RUIL |
| return_reason | TEXT | BESCHADIGD / VERKEERD / WEIGERING / OVERSCHOT / OVERIG |

- Pickup en delivery worden omgedraaid t.o.v. originele order
- "Retour aanmaken" knop vult automatisch in
- Retourorders verschijnen in groupage-engine (F4) als pickup-stops

### Emballage-tracking

#### `packaging_movements`
Elke uitgifte of ontvangst van emballage.

| Kolom | Type | Beschrijving |
|-------|------|-------------|
| id | UUID PK | |
| tenant_id | UUID NOT NULL | |
| client_id | UUID FK → clients | |
| order_id | UUID FK → orders | |
| trip_stop_id | UUID FK → trip_stops | |
| loading_unit_id | UUID FK → loading_units | |
| direction | TEXT NOT NULL | UIT (meegegeven) / IN (terugontvangen) |
| quantity | INTEGER NOT NULL | |
| recorded_by | UUID FK → auth.users | |
| recorded_at | TIMESTAMPTZ DEFAULT now() | |
| notes | TEXT | |

#### `packaging_balances` (VIEW)
```sql
CREATE VIEW packaging_balances AS
SELECT tenant_id, client_id, loading_unit_id,
  SUM(CASE WHEN direction='UIT' THEN quantity ELSE -quantity END) AS balance
FROM packaging_movements
GROUP BY tenant_id, client_id, loading_unit_id
```
NB: View heeft tenant_id nodig voor RLS filtering.

### Emballage-flow
1. Bij levering: chauffeur registreert "6 europallets afgegeven" → UIT
2. Bij ophaal/retour: chauffeur registreert "4 europallets meegenomen" → IN
3. Saldo: klant heeft 2 pallets uitstaan
4. Optioneel: openstaand saldo als factuurpost (bijv. €7.50/pallet/week)

### UI
- **Order detail → "Retour aanmaken"** knop
- **Orders overzicht:** filter op order_type, retour-badge
- **Klant detail → Emballage tab:** saldo per type, bewegingshistorie, grafiek
- **Chauffeur app → Stop detail:** emballage-registratie (type, aantal, richting)
- **Rapportage → Emballage:** totaal uitstaand, top-klanten, ouderdom
- **Dashboard → Emballage widget:** totaal uitstaand, trend

---

## Feature 6: Proactieve klantnotificaties

### Bestaand
- `notifications` tabel (interne notificaties)
- `send-confirmation` Edge Function
- `/track` (TrackTrace pagina)

### Automatische triggers

| Trigger | Ontvanger | Kanaal |
|---------|-----------|--------|
| Order bevestigd | Opdrachtgever | Email |
| Rit gestart | Ontvanger(s) | Email + SMS |
| ETA wijziging > 15 min | Ontvanger(s) | Email + SMS |
| Chauffeur aangekomen | Ontvanger | SMS |
| Afgeleverd + POD | Opdrachtgever | Email |
| Uitzondering / mislukt | Opdrachtgever | Email + SMS |

### Nieuwe tabellen

#### `notification_templates`
Aanpasbare templates per tenant.

| Kolom | Type | Beschrijving |
|-------|------|-------------|
| id | UUID PK | |
| tenant_id | UUID NOT NULL | |
| trigger_event | TEXT NOT NULL | ORDER_CONFIRMED / TRIP_STARTED / ETA_CHANGED / DRIVER_ARRIVED / DELIVERED / EXCEPTION |
| channel | TEXT NOT NULL | EMAIL / SMS |
| subject_template | TEXT | Met {{variabelen}} |
| body_template | TEXT NOT NULL | |
| is_active | BOOLEAN DEFAULT true | |

#### `notification_log`
Volledige verzendhistorie.

| Kolom | Type | Beschrijving |
|-------|------|-------------|
| id | UUID PK | |
| tenant_id | UUID NOT NULL | |
| template_id | UUID FK → notification_templates | |
| order_id | UUID FK → orders | |
| trip_id | UUID FK → trips | |
| recipient_email | TEXT | |
| recipient_phone | TEXT | |
| channel | TEXT NOT NULL | |
| status | TEXT DEFAULT 'QUEUED' | QUEUED / SENT / DELIVERED / FAILED / BOUNCED |
| sent_at | TIMESTAMPTZ | |
| error_message | TEXT | |

#### ALTER `orders`
| Kolom | Type | Beschrijving |
|-------|------|-------------|
| recipient_name | TEXT | Ontvanger (kan anders zijn dan opdrachtgever) |
| recipient_email | TEXT | |
| recipient_phone | TEXT | |
| notification_preferences | JSONB DEFAULT '{"email": true, "sms": false}' | |

### Architectuur
Event-driven: DB trigger/Supabase Realtime → Edge Function `send-notification` → Resend (email) / Twilio (SMS)

**Template variabelen:** `{{order_number}}`, `{{client_name}}`, `{{pickup_address}}`, `{{delivery_address}}`, `{{eta}}`, `{{track_url}}`, `{{driver_name}}`, `{{company_name}}`, `{{company_logo}}`

### UI
- **Settings → Notificaties:** templates beheren, kanaal aan/uit, variabelen-helper, live preview
- **Klant detail → Notificatie-voorkeuren:** standaard kanaal per klant
- **Order detail → Notificatie-log:** verzonden meldingen met status en timestamp
- **Track & Trace:** verbeterd met live status, ETA, kaart (link in elke notificatie)

---

## Feature 7: Uitgebreid Klantportaal

### Bestaand
- `/portal` (ClientPortal) — basis: authenticatie, orderlijst, status
- `/track` (TrackTrace) — publiek tracking

### Authenticatie & toegang
- **Magic link login** (geen wachtwoord), uitnodiging door transporteur
- Nieuwe rol `klant` in tenant_members, RLS filtert op client_id
- Multi-user per klant-bedrijf

### Nieuwe tabellen

#### `client_portal_users`
Portaalgebruikers gekoppeld aan klant.

| Kolom | Type | Beschrijving |
|-------|------|-------------|
| id | UUID PK | |
| tenant_id | UUID NOT NULL | |
| client_id | UUID FK → clients | |
| user_id | UUID FK → auth.users | |
| portal_role | TEXT DEFAULT 'viewer' | viewer / editor (mag orders plaatsen) / admin |
| invited_by | UUID FK → auth.users | |
| invited_at | TIMESTAMPTZ | |
| last_login_at | TIMESTAMPTZ | |
| is_active | BOOLEAN DEFAULT true | |

#### ALTER `orders`
| Kolom | Type | Beschrijving |
|-------|------|-------------|
| source | TEXT DEFAULT 'INTERN' | INTERN / EMAIL / PORTAL / EDI (toekomst) |
| portal_submitted_by | UUID FK → auth.users | |
| portal_submitted_at | TIMESTAMPTZ | |

### Portaal-modules
1. **Orders:** overzicht met filters, nieuwe order plaatsen (vereenvoudigd formulier, vooringevulde adressen), retour aanvragen. Portal-orders komen als DRAFT met source=PORTAL.
2. **Tracking:** live kaart met chauffeurpositie, ETA per zending, realtime statusupdates, notificatie-voorkeuren.
3. **Documenten:** CMR, POD, labels, facturen als PDF downloaden.
4. **Facturatie:** facturenlijst met status, PDF download, totaal openstaand, betalingsoverzicht.
5. **Rapportage:** on-time %, volume per week/maand, emballage-saldo (F5), CSV export.
6. **Instellingen:** locaties beheren (+ tijdvensters), gebruikers uitnodigen, notificatie-voorkeuren, contactgegevens.

### White-label
- Portaal gebruikt automatisch tenant branding (logo, primary_color, company_name)
- Geen OrderFlow branding zichtbaar
- Eigen domein (toekomst): subdomain per tenant

### Planner-kant
- **Klant detail → Portaal tab:** uitgenodigde gebruikers, login-activiteit, portaal aan/uit
- **Inbox:** portal-orders naast email-orders met source=PORTAL badge
- **Settings → Portaal:** modules aan/uit per portaal

---

## Totaal nieuwe database-objecten

### Nieuwe tabellen (14)
1. `location_time_windows` (F1)
2. `slot_bookings` (F1)
3. `rate_cards` (F2)
4. `rate_rules` (F2)
5. `surcharges` (F2)
6. `cost_types` (F3)
7. `trip_costs` (F3)
8. `vehicle_fixed_costs` (F3)
9. `consolidation_groups` (F4)
10. `consolidation_orders` (F4)
11. `packaging_movements` (F5)
12. `notification_templates` (F6)
13. `notification_log` (F6)
14. `client_portal_users` (F7)

### Nieuwe views (1)
1. `packaging_balances` (F5)

### ALTER bestaande tabellen
- `trip_stops` + 4 kolommen (F1)
- `drivers` + 2 kolommen (F3)
- `orders` + 9 kolommen (F5: order_type, return_reason; F6: recipient_name/email/phone, notification_preferences; F7: source, portal_submitted_by/at)

### Nieuwe Edge Functions (1)
1. `send-notification` (F6) — template rendering + Resend/Twilio dispatch

### Nieuwe lib modules
1. `calculateOrderPrice()` (F2) — prijsberekening engine
2. `consolidationEngine()` (F4) — groupage clustering + matching
3. `calculateTripCosts()` (F3) — auto-kostenberekening

### Migratie
- `client_rates` → `rate_cards` + `rate_rules` (eenmalig script)

---

## Feature-afhankelijkheden

```
Harde afhankelijkheden (moet eerst gebouwd):
F1 (Tijdvensters) ──→ F4 (Groupage) — tijdvensters als constraint
F2 (Tariefmodellen) ──→ F3 (Kostentoerekening) — omzet uit F2 vs kosten
F6 (Notificaties) ──→ F7 (Klantportaal) — track-link + notificatie-integratie

Zachte afhankelijkheden (profiteert van, maar werkt ook zonder):
F4 (Groupage) ←── F5 (Retour) — retourorders als pickup-stops in groupage
F7 (Klantportaal) ←── F1 (tijdvensters), F5 (emballage-saldo)
F3 (Kostentoerekening) ←── F1 (wachttijden als kostenpost)
```

**Bouwvolgorde:** F1 → F2 → F3 → F4 → F5 → F6 → F7
