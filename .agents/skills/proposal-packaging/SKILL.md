# Skill: Proposal Packaging

## Wanneer gebruiken
Wanneer een verbetering, feature of wijziging klaar is om als voorstel naar CEO te gaan.

## Input
- Worker-analyse of bevinding
- Manager-beoordeling
- Technische haalbaarheid (van engineering-manager)
- Impact-inschatting

## Stappen

1. **Verzamel alle input** van betrokken workers en managers
2. **Formuleer het probleem** — wat is er aan de hand, waarom is dit belangrijk
3. **Beschrijf de oplossing** — concreet, niet abstract
4. **Beoordeel:**
   - Impact op gebruikers
   - Impact op automatiseringsgraad
   - Technische effort
   - Risico's
   - Afhankelijkheden
5. **Formuleer alternatieven** — wat zijn de opties
6. **Geef aanbeveling** — wat raad je aan en waarom
7. **Definieer success criteria** — hoe weten we dat het werkt
8. **Schrijf in CEO-format**

## Output
```markdown
# Voorstel: [titel]

**Prioriteit:** [P0-P3]
**Impact:** [hoog/middel/laag]
**Effort:** [S/M/L/XL]
**Risico:** [hoog/middel/laag]

## Probleem
[2-3 zinnen]

## Voorstel
[Concrete oplossing]

## Alternatieven
1. [optie A] — [trade-off]
2. [optie B] — [trade-off]

## Impact
- Gebruikers: [effect]
- Automatisering: [effect op %]
- Technisch: [wat verandert]

## Risico's
- [risico 1]
- [risico 2]

## Success criteria
- [meetbaar criterium 1]
- [meetbaar criterium 2]

## Aanbeveling
[Wat raden we aan en waarom]
```

## Kwaliteitschecks
- [ ] Probleem is helder voor niet-technisch publiek
- [ ] Voorstel is concreet en uitvoerbaar
- [ ] Alternatieven zijn eerlijk gepresenteerd
- [ ] Aanbeveling is onderbouwd
- [ ] Success criteria zijn meetbaar

## Failure modes
- **Te technisch**: CEO begrijpt het niet → herschrijf in business-taal
- **Geen alternatieven**: lijkt alsof er maar één optie is → altijd minimaal "niets doen" als optie

## Escalatieregels
- P0 voorstel → direct naar CEO, niet wachten op cyclus
- Voorstel met afhankelijkheden van extern → markeer blocker
