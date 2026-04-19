# VISION, OrderFlow Suite

Noord-ster voor het eindproduct. Wanneer code, planning of prioriteiten botsen, wint dit document.

## In één zin

Een open, slimme cargo TMS die orders vanaf binnenkomst tot factuur begeleidt met minimale handmatige tussenkomst, bruikbaar voor planner, chauffeur en klant binnen dezelfde omgeving.

## Voor wie

Drie gelijkwaardige gebruikersgroepen. De suite moet voor elke groep eerste-klas werken, niet één primaire rol met bijrol-schermen.

**Planner (kantoor)**
- Overziet orderstroom, wijst ritten toe, lost uitzonderingen op.
- Wil zo min mogelijk klik-werk op de happy path, en volledige controle bij afwijkingen.
- Ziet financiën, KPI's, chauffeur-status, ritplanning, kaart.

**Chauffeur (onderweg)**
- Ontvangt ritten, bevestigt, rapporteert wachttijd, uploadt POD.
- Mobile-first, werkt met handschoenen, offline tolerant.
- Ziet alleen wat voor zijn rit relevant is.

**Klant (verlader)**
- Plaatst order, volgt status, ontvangt factuur en POD.
- Self-service portaal, geen telefoon nodig voor standaard-ritten.
- Ziet prijs vóór bevestiging, track-and-trace na toewijzing.

## Wat "slim" betekent

AI is geen marketing-laagje, maar ingebouwd op drie plekken:

1. **Order-intake.** E-mail, PDF of vrije tekst gaat via `parse-order` (Gemini) naar gestructureerde order. Planner bevestigt, corrigeert niet alleen indien nodig.
2. **Planning.** Systeem stelt chauffeur en route voor op basis van voertuigmatch, ETA, geografische clustering en chauffeur-beschikbaarheid. Planner accepteert of overrulet.
3. **Pricing.** Altijd km-gebaseerd met voertuigmatrix, minimum, screening-fee, tijd-toeslagen. Override alleen voor edge-cases met verplichte reden.

Slim betekent ook: het systeem **leert van correcties** (feedback-loop op parse-resultaten, planning-overrides, pricing-overrides) en wordt per tenant beter.

## Wat "open" betekent

- **Multi-tenant**, volledig gescheiden data met RLS. Nieuwe klant = nieuwe tenant, niet nieuwe deploy.
- **Configureerbaar per tenant**, niet per code-wijziging. Voertuigmatrix, warehouse-markers, pricing, toeslagen, tolken in DB, niet in hardcoded constanten.
- **API-first**, klanten en chauffeurs kunnen koppelen (TMS-to-TMS, boordcomputer, track-and-trace widgets).
- **Apache 2.0**, broncode openbaar, commerciële hosting mogelijk.

## Einstaat, concrete success-criteria

Het product is "af" wanneer, voor een gemiddelde tenant:

1. 80% van inkomende orders wordt zonder handmatige correctie gestructureerd.
2. 70% van ritten krijgt automatisch een geaccepteerd planning-voorstel.
3. Chauffeur ontvangt, bevestigt en sluit een rit zonder telefonisch contact.
4. Klant ziet prijs vóór bevestiging en factuur binnen 24 uur na POD.
5. Nieuwe tenant onboarden duurt minder dan één werkdag.

## Niet-doelen

Expliciet NIET in scope, voorkomt scope-creep:

- **Financiële boekhouding.** Wij factureren, de boekhouding gebeurt elders (Exact, Snelstart, etc. via export).
- **Warehouse Management.** Wij weten wat waar ophaalt/afzet, wij beheren geen voorraden.
- **Eigen boordcomputer-hardware.** Wij integreren met bestaande oplossingen.
- **Consumenten-bezorging.** B2B cargo, geen last-mile-to-consumer.

Klantbeheer (CRM) zit wél in het product, via de klantentab, geen losse CRM nodig.

## Ontwerp-principes

- **Minimale klik-diepte** op de happy path, diepte pas waar werk begint.
- **Configuratie vóór code**, als iets per tenant verschilt hoort het in DB, niet in code.
- **Nederlandse taal** in UI en klant-communicatie, tenzij tenant internationaal kiest.
- **Premium voelende UI** met luxe design-laag (gold-accent tokens), functioneel niet decoratief.
- **Respecteer bestaande patronen**, nieuwe features onder bestaande tabbladen, niet als losse sidebar-items.
