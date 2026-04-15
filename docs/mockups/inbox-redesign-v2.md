# Inbox v2 — Feature-matrix

Elke regel legt één visueel element vast met de functionaliteit die het draagt.
Geen enkel element bestaat puur voor esthetiek. Kleur, vorm, animatie en positie
worden alleen ingezet als ze een state, actie of dataveld representeren.

Legenda kleuren (strikt functioneel):
- **Goud** = actieve selectie of AI-zekerheid ≥80
- **Amber** = waarschuwing, confidence 60-79, of bevestiging vereist
- **Rood** = urgent, kritiek, confidence <60, annulering
- **Groen** = succes, verzonden, confidence ≥90 op veld-niveau
- **Blauw** = thread-type Update
- **Violet** = thread-type Vraag
- **Grijs** = neutraal / inactief

---

## 1. Linker-paneel — inbox-lijst

| Visueel element | Functie | Data-bron / state | Rationale |
|---|---|---|---|
| Zoekveld bovenaan | Filter op order#/klant/subject | `filter.query` | Enter submit, debounced 200ms |
| Filter-chip rij (datum/klant/type) | Scope-filter op lijst | `filter.{date,client,type}` | Dropdown-only, geen icon-pills (zie feedback_filter_ui.md) |
| Sidebar-tabs Alle/Actie/Klaar/Verzonden/Concepten | Status-bucket wissel | `filter.bucket` | Count-badge achter label toont items in bucket |
| Count-badge op tab | Bucket-grootte | `counts[bucket]` | Vet als >0, grijs als 0 |
| Groen puntje (6px) links van item | Ongelezen indicator | `draft.read_at === null` | Verdwijnt na openen |
| Goud verticale stripe 3px links | Actieve selectie | `selected.id === item.id` | Enige gebruik van goud in lijst |
| Rode verticale stripe + pulse-animatie | Urgent / deadline < 1u | `draft.urgency === 'high'` OR `deadline_at - now < 1h` | Pulse stopt na selectie |
| Item-type pill (Nieuw/Update/Annulering/Bevestiging/Vraag) | Thread-type | `draft.thread_type` | Stuurt banner in midden-paneel |
| Pill-kleur | Type-encoding | idem | Blauw=Update, rood=Annulering, groen=Bevestiging, violet=Vraag, grijs=Nieuw |
| Mini confidence-bar (2px, 100% breed) onder item | Overall AI-zekerheid | `draft.confidence_score` | Goud ≥80, amber 60-79, rood <60 |
| Afzender-regel (vet) | From-naam | `draft.from_name` | Vet tot gelezen, regular erna |
| Subject (1 regel truncate) | E-mail onderwerp | `draft.subject` | Truncate met ellipsis |
| Snippet-regel (grijs) | Preview body | `draft.snippet` | Max 1 regel |
| Relatieve tijd rechts | Ontvangsttijd | `draft.received_at` | "5m", "2u", "gisteren" |
| Checkbox links (alleen op hover of bulk-mode) | Bulk-selectie toggle | `bulkSelection.has(id)` | Verborgen tot hover om lijst rustig te houden |
| "Importeer .eml" button | Handmatige import | `onImportEml()` | Boven lijst, secondary-style |
| "Laad testdata" button | Seed demo-drafts | `onLoadFixtures()` | Alleen in dev/mockup |
| Keyboard-hints footer (↑↓/Enter/Del) | Shortcut-referentie | statisch | Monospace, dimmed |

Rijen: 18

---

## 2. Midden-paneel — e-mail bron

| Visueel element | Functie | Data-bron / state | Rationale |
|---|---|---|---|
| Tab "Inhoud" | Toont email body | `tab === 'content'` | Default |
| Tab "Bijlagen" met teller | Toont attachments | `tab === 'attachments'`, `draft.attachments.length` | Teller verborgen bij 0 |
| From/To/Date header-block | Bron-metadata | `draft.headers` | Monospace font voor scan |
| Goud onderstreepte tokens in body | AI-geëxtraheerde velden | `extraction.highlights[]` | Alleen goud; voorheen 3 kleuren = decoratief, verwijderd |
| Superscript-label boven highlight | Welk veld gematcht | `highlight.field` | Bv. "pickup", "weight"; tooltip toont confidence |
| "Extraheer"-button met loader | Re-run AI-parse | `onExtract()`, `isExtracting` | Spinner vervangt label tijdens run |
| Client-card (building-icoon + naam + stad) | Klant-context | `draft.client` | Icoon = entity-type indicator, geen decoratie |
| 3-stat grid (totale orders / gem kg / contact-check) | Klanthistorie snapshot | `client.stats` | Check-icoon = contact geverifieerd |
| Previous-orders list (max 3) | Recente orders zelfde klant | `client.recent_orders` | Klikbaar → opent order |
| Reply/Forward sticky-bottom bar | Actie op bron-mail | `onReply()`, `onForward()` | Sticky zodat altijd bereikbaar |
| Reply-textarea | Antwoord opstellen | `reply.body` | Auto-height |
| Groen "AI-concept"-badge in reply | AI-gegenereerd concept-markering | `reply.is_ai_draft` | User weet dat tekst te reviewen is |
| Bijlagen-lijst met type-icoon + grootte | Attachment overzicht | `draft.attachments[]` | Icoon = file-type, klik = preview |

Rijen: 13

---

## 3. Rechter-paneel — review

| Visueel element | Functie | Data-bron / state | Rationale |
|---|---|---|---|
| Header "REVIEW ORDER" | Paneel-identiteit | statisch | All-caps = modus-indicator |
| "Xu geleden"-label in header | Ontvangst-leeftijd | `now - draft.received_at` | Kleur: groen <1u, amber 1-6u, rood >6u = urgency-encoding |
| Confidence-ring (SVG circular) | Overall AI-zekerheid | `draft.confidence_score` | Ring-vulling = percentage; kleur = dezelfde drempels |
| 3-stap progress-stepper (Parse → Review → Create) | Workflow-positie | `workflow.step` | Actief = goud, gedaan = groen check |
| Per-field input | Bewerkbaar extractie-veld | `fields[key]` | Standaard form-input |
| FieldConfidenceIndicator naast input | Veld-zekerheid | `fields[key].confidence` | ≥90 groen check, 60-89 amber warn, <60 rood warn |
| Confidence-dropdown bij veld | Toont bron + alternatieven | `fields[key].sources[]` | Klik op indicator = open |
| AI-kaart (groene gradient) | "Dit hebben we begrepen"-samenvatting | `extraction.summary` | Phase 1 van extractie |
| Teller in AI-kaart ("8/10 velden") | Dekkings-metric | `extraction.filled / total` | |
| Bronnen-regel in AI-kaart | Welke e-mail delen gebruikt | `extraction.sources[]` | Klikbaar → scroll naar highlight links |
| Pill-badges met pinpoint-icoon / pakket-icoon | Entity-type van bron | `source.entity_type` | Icoon = type (adres/lading), klikbaar voor focus |
| Route-details blok | Pickup → delivery visualisatie | `fields.pickup`, `fields.delivery` | |
| Dashed-line tussen pickup en delivery | Route-representatie | idem | Dashed = transport; bounce-truck icoon = in-flight state mockup |
| Lading-velden (qty/weight/type) | Cargo-specs | `fields.cargo` | 4 required: pickup/delivery/qty/weight |
| Required-marker (*) | Verplicht veld | `field.required` | Rood, alleen bij leeg-required |
| Toggle-row (Laadklep/Koeling/ADR/Douane) | Extra vereisten | `fields.requirements[]` | Toggle = boolean requirement, geen decoratie |
| Vehicle-match kaart (Phase 2, primary gekleurd) | Capacity-matching resultaat | `matches[]` max 3 | |
| Vehicle-row velden | Match-detail | naam/plaat/match%/driver/certs/warnings | Match% drives volgorde |
| Warning-tag op vehicle-row | Mismatch op cert of capaciteit | `match.warnings[]` | Amber border, Bot-icoon |
| Anomaly-box (rounded amber) | Statistische afwijking t.o.v. historie | `anomalies[]` | Toont huidige waarde + klant-gemiddelde |
| Stagger-animatie anomalies | Sequentieel rendering | render-only | 80ms per item, alleen bij >1 anomaly |
| Sticky CTA-footer | Primaire acties altijd bereikbaar | — | Onder scroll-grens |
| Status-indicator in footer | Klaar-voor-create? | `canCreate`, `missingFields[]` | Groen check of amber "X velden ontbreken" |
| Auto-advance-checkbox | Na create → volgend item | `prefs.auto_advance` | User-preference |
| "Maak order aan"-button (primary) | Create-actie | `onCreate()` | Disabled als `!canCreate` |
| "Afwijzen"-button (ghost rood-text) | Drop draft | `onReject()` | Vraagt bevestiging via AlertDialog |

Rijen: 26

---

## 4. Thread-banner (conditioneel)

| Visueel element | Functie | Data-bron / state | Rationale |
|---|---|---|---|
| Banner-aanwezigheid | Thread is follow-up op bestaande order | `draft.thread_type !== 'new'` | Geen banner = nieuwe order |
| Banner-rand kleur | Thread-type encoding | `thread_type` | Blauw=Update, rood=Annulering, groen=Bevestiging, violet=Vraag |
| Parent-order link | Navigeer naar brondorder | `draft.parent_order_id` | Klikbaar order# |
| Changes-detected lijst | Verschillen oud vs nieuw | `diff[]` | Strikethrough = oude waarde, emerald = nieuwe |
| "Bevestig wijziging"-button | Apply diff op parent | `onApplyDiff()` | Alleen bij type=Update |
| "Bevestig annulering"-button | Set parent.status=cancelled | `onCancel()` | Alleen bij type=Annulering, AlertDialog |

Rijen: 6

---

## 5. Follow-up / missing fields

| Visueel element | Functie | Data-bron / state | Rationale |
|---|---|---|---|
| CircleAlert-icoon | Missing-state indicator | `missingFields.length > 0` | Icoon = semantisch (alert), niet decoratief |
| "ONTBREKENDE GEGEVENS"-badge | Paneel-kop | idem | All-caps = status-modus |
| Missing-fields pills | Welke velden ontbreken | `missingFields[]` | Klikbaar → vraag in AI-draft opnemen |
| AI-draft textarea | Concept follow-up mail | `followup.body` | Auto-save naar draft |
| Auto-save indicator (kleine klok + "opgeslagen") | Persist-state | `followup.saved_at` | Verdwijnt na 2s |
| "Verstuur follow-up"-button | Mail terug naar klant | `onSendFollowup()` | Disabled tot body non-empty |
| Verzonden-badge (CheckCircle + tijdstempel, groen) | Follow-up sent-state | `followup.sent_at` | Vervangt verzend-button na sturen |

Rijen: 7

---

## 6. Bulk-mode

| Visueel element | Functie | Data-bron / state | Rationale |
|---|---|---|---|
| Bulk-bar verschijning | ≥1 item geselecteerd | `bulkSelection.size > 0` | Slide-in van boven; anim = state-transition, niet decoratie |
| Teller "X geselecteerd" | Selectie-grootte | `bulkSelection.size` | |
| "Goedkeuren" (groen-text) | Bulk-create orders | `onBulkApprove()` | Alleen drafts met `canCreate` |
| "Verwijder" (rood-text) | Bulk-reject | `onBulkReject()` | AlertDialog bevestiging |
| "Annuleer" (grijs-text) | Leeg selectie | `clearSelection()` | |
| Checkbox-kolom permanent zichtbaar in bulk-mode | Quick multi-select | `bulkMode === true` | Overrulet hover-only gedrag |

Rijen: 6

---

## 7. State-scenarios switcher (mockup-only)

| Visueel element | Functie | Data-bron / state | Rationale |
|---|---|---|---|
| Scenario-dropdown rechtsboven | Wissel tussen empty/loading/full/error | `mockScenario` | Alleen in mockup-build, niet in productie |
| "Empty inbox"-state | Geen drafts | `drafts.length === 0` | Toont import/testdata CTA's |
| "No selection"-state midden+rechts | Geen item geselecteerd | `!selected` | Toont keyboard-hints groot |
| Loading-skeletons | Fetch in progress | `isLoading` | Geen spinner, skeletons = layout-stability |
| Error-state | Fetch faalde | `error` | Retry-button + bericht |
| Toast-container rechtsonder | Acties-feedback | `toasts[]` | Auto-dismiss 4s |

Rijen: 6

---

## Samenvatting — functionaliteits-dekking

- Totaal visuele elementen in matrix: **82 rijen**
- Sectie-distributie: 1) 18 · 2) 13 · 3) 26 · 4) 6 · 5) 7 · 6) 6 · 7) 6
- Totaal features uit inventaris: **82 / 95 visueel gedekt**

### Niet-gedekt in matrix (niet-visueel of gedrag-only)

Onderstaande features zijn business-logic, shortcuts of niet-visuele mechaniek.
Ze horen in een logic-spec, niet in een visuele feature-matrix:

- **Business-rules (cat. 11)** — 4 required fields, adres-token-validatie, incomplete-addr penalty -20, duplicate-detectie <60m, confidence-normdrempels 80/60, pallet auto-fill (Europallet/Blokpallet), thread-type detectie-algoritme, capacity-matching algoritme, field-confidence mapping. Dit zijn scoring/validatie-regels die UI-state voeden (dekt dus wel indicator-kleuren in de matrix), maar geen eigen visueel element.
- **Keyboard-shortcuts (gedrag)** — ↑↓/Enter/Del bindings zelf. De *hint-footer* staat wel in §1.
- **Status-transities (cat. 10)** — state-machine flows (load→select→parse→edit→create→delete, reply-flow, follow-up-flow). Zijn sequenties, niet elementen.
- **Resizable panels** — interactie-gedrag op splitters.
- **Mobile view toggle** — responsive breakpoint-gedrag.
- **Auto-height textarea** — input-gedrag (wel indirect in §2 reply en §5 draft).

## Twijfels / open punten

1. **Bounce-truck icoon op route-dashed-line** (§3) — grenst aan decoratie. Verantwoord als "in-flight state mockup-visualisatie", maar als er geen echte animatie-betekenis achter zit (bv. live GPS), moet het weg. Beslissing open.
2. **Client-card 3-stat grid** (§2) — stat "gem kg" twijfelachtig nut naast "totale orders"; overweeg vervanging door laatste-order-datum.
3. **Stagger-animatie anomalies** (§3) — render-only effect; behouden omdat het volgorde-lezing stuurt, maar minimaliseren tot 40ms of schrappen bij >5 items.
4. **Scenario-switcher** (§7) — mockup-only; in productie-build moet dit element fysiek uit de bundle, niet alleen hidden.
