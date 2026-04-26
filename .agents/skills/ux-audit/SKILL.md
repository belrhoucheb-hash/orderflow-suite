# Skill: UX Audit

## Wanneer gebruiken
Bij het reviewen van een pagina, component of user flow op UX-kwaliteit. Gebruik na elke significante UI-wijziging of periodiek als onderdeel van de dagelijkse cyclus.

## Input
- Pagina of component pad (bijv. `src/pages/Orders.tsx`)
- Of: user flow beschrijving (bijv. "email naar order flow")
- Optioneel: focus-gebieden (accessibility, mobile, consistency)

## Stappen

1. **Lees de pagina/component** — begrijp de structuur en intent
2. **Identificeer gebruikersrollen** — wie gebruikt dit? (planner, dispatcher, chauffeur, manager)
3. **Loop de user flow door** — van binnenkomst tot doel bereikt
4. **Check per element:**
   - Is het duidelijk wat dit doet?
   - Is de labeling consistent met andere pagina's?
   - Zijn foutmeldingen informatief?
   - Werkt formuliervalidatie correct?
   - Is de visuele hiërarchie logisch?
5. **Check consistentie** — vergelijk met andere pagina's in het project
6. **Check responsive** — werkt het op mobile (check Tailwind breakpoints)
7. **Check accessibility** — aria-labels, keyboard navigation, contrast
8. **Documenteer bevindingen** in het UX Review outputformaat

## Output
Gestructureerd rapport volgens het formaat in `ux-reviewer.md`:
- Per bevinding: ernst, type, locatie, beschrijving, impact, voorstel, confidence
- Samenvatting met tellingen per ernst-niveau
- Topprioriteit-aanbeveling

## Kwaliteitschecks
- [ ] Elke bevinding heeft een concrete bestandslocatie
- [ ] Elke bevinding heeft een concreet verbetervoorstel
- [ ] Ernst-niveaus zijn consistent toegepast
- [ ] Geen vage bevindingen ("kan beter" zonder uitleg)
- [ ] Vergeleken met minimaal 2 andere pagina's voor consistentie

## Failure modes
- **Te vaag**: bevindingen zonder concrete locatie of voorstel → herdoen met specifieke code-referenties
- **Te veel**: >20 bevindingen → prioriteer top 10, parkeer de rest
- **Geen context**: review zonder te begrijpen wie de gebruiker is → eerst gebruikersrol bepalen

## Escalatieregels
- Kritieke UX-blocker → direct naar product-manager, niet wachten op cyclus
- Security-gerelateerde UX-issue (bijv. wachtwoord zichtbaar) → direct naar engineering-manager
- Accessibility-violation → markeer als hoog, rapporteer in volgende cyclus
