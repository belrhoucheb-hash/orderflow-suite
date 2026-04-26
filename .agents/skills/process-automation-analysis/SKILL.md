# Skill: Process Automation Analysis

## Wanneer gebruiken
Bij het analyseren van een specifiek TMS-proces op automatiseringsmogelijkheden. Kern van de 90-95% automatiseringsdoelstelling.

## Input
- Proces of module om te analyseren
- Huidige bekende pijnpunten (optioneel)

## Stappen

1. **Definieer het proces** — begin tot eind, alle stappen
2. **Trace door de code:**
   - Welke pages zijn betrokken?
   - Welke hooks halen data op?
   - Welke edge functions verwerken data?
   - Welke database tabellen worden geraakt?
3. **Per stap, classificeer:**
   - Volledig automatisch (geen menselijke actie nodig)
   - Semi-automatisch (mens bevestigt of corrigeert)
   - Volledig handmatig (mens doet alles)
4. **Per handmatige/semi-auto stap:**
   - Waarom is dit handmatig?
   - Kan het geautomatiseerd worden?
   - Wat is het risico?
   - Is menselijke controle hier nodig?
5. **Bereken automatiseringsgraad:**
   - Tel: auto stappen / totaal stappen
   - Weeg: op basis van tijdbesteding per stap
6. **Formuleer verbeterplan**

## Output
Procesanalyse rapport volgens process-analyst outputformaat.

## Kwaliteitschecks
- [ ] Elke stap is geverifieerd in code
- [ ] Automatiseringsgraad is berekend
- [ ] Human-in-the-loop is per stap beoordeeld
- [ ] Verbeterplan is concreet en haalbaar

## Failure modes
- **Proces niet gevonden in code**: mogelijk nog niet gebouwd → documenteer als feature gap
- **Te optimistisch**: 100% automatisering claimen → altijd edge cases benoemen

## Escalatieregels
- Proces zonder enige menselijke controle bij risico → operations-manager
- Ontbrekend proces dat kritiek is → feature-scout + product-manager
