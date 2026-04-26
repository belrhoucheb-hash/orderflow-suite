# Skill: Change Documentation

## Wanneer gebruiken
Na elke goedgekeurde en geïmplementeerde wijziging, na CEO-besluiten, of bij roadmap-updates.

## Input
- Wat is gewijzigd (code, besluit, prioriteit)
- Waarom (context, voorstel dat goedgekeurd is)
- Door wie (welke agent/manager)

## Stappen

1. **Bepaal type documentatie:**
   - Changelog (code-wijziging)
   - Decision log (CEO/manager besluit)
   - Roadmap update (prioriteitswijziging)
   - Improvement pipeline (nieuw item of statuswijziging)
2. **Schrijf documentatie:**
   - Datum
   - Wat is gewijzigd
   - Waarom
   - Impact
   - Gerelateerde bestanden/besluiten
3. **Update relevante memory-bestanden**
4. **Verifieer consistentie** met bestaande documentatie

## Output
Bijgewerkte documentatie in het juiste bestand:
- `memory/decision-log.md` voor besluiten
- `memory/roadmap-memory.md` voor roadmap
- `memory/improvement-pipeline.md` voor verbeterpijplijn
- `logs/` voor changelogs

## Kwaliteitschecks
- [ ] Datum is ingevuld
- [ ] "Waarom" is gedocumenteerd, niet alleen "wat"
- [ ] Geen conflicten met bestaande documentatie
- [ ] Referenties naar gerelateerde items zijn gelegd

## Failure modes
- **Alleen "wat" zonder "waarom"**: nutteloos voor toekomstige context → altijd reden vastleggen
- **Verouderde referenties**: verwijzen naar verwijderde code → altijd verifiëren

## Escalatieregels
- Conflicterende documentatie → markeer en vraag verduidelijking
- Ontbrekende context → vraag aan bron-agent/manager
