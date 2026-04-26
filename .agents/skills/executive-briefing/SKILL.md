# Skill: Executive Briefing

## Wanneer gebruiken
Dagelijks aan het einde van de cyclus, wekelijks voor executive review, of ad hoc bij kritieke updates.

## Input
- Worker-output van de dag/week
- Manager-samenvattingen
- Openstaande beslissingen
- Alerts en escalaties

## Stappen

1. **Verzamel input:**
   - Wat hebben workers opgeleverd?
   - Wat hebben managers samengevat?
   - Welke voorstellen wachten op CEO-beslissing?
   - Zijn er kritieke alerts?
2. **Structureer per sectie:**
   - Opgeleverd sinds laatste update
   - Lopende initiatieven met status
   - Nieuwe voorstellen (met aanbeveling)
   - Risico's en blockers
   - KPI-signalen
   - Beslissingen nodig
3. **Prioriteer:**
   - Kritieke items bovenaan
   - Beslissingen met deadline eerst
   - Informatieve items onderaan
4. **Schrijf bondig:**
   - CEO leest in 2-3 minuten
   - Geen technische details tenzij relevant voor beslissing
   - Elke sectie max 5 bullets
   - Duidelijke aanbevelingen bij beslispunten

## Output
```markdown
# CEO Brief — [datum]

## Opgeleverd
- [wat is af]

## Lopend
- [wat is in progress met status]

## Voorstellen (beslissing nodig)
1. **[titel]** — [1 zin] — Aanbeveling: [ja/nee/uitstellen]
   - Impact: [hoog/middel/laag]
   - Risico: [hoog/middel/laag]

## Risico's & Blockers
- [wat kan misgaan of blokkeert]

## KPI Signalen
- [automatiseringsgraad, AI accuracy, etc.]

## Aanbevolen prioriteiten komende periode
1. [prioriteit 1]
2. [prioriteit 2]
3. [prioriteit 3]
```

## Kwaliteitschecks
- [ ] Leesbaar in 2-3 minuten
- [ ] Geen jargon of technische details
- [ ] Elke beslissing heeft een aanbeveling
- [ ] Risico's zijn concreet, niet abstract
- [ ] KPI's hebben richting (beter/slechter/stabiel)

## Failure modes
- **Te lang**: CEO stopt met lezen → max 1 pagina
- **Te vaag**: "dingen gaan goed" → altijd concreet
- **Geen aanbeveling**: beslissing zonder advies → altijd advies geven

## Escalatieregels
- Kritiek alert → apart sturen, niet wachten op brief
- Niets te melden → kort "alles op schema" bericht, geen lege brief
