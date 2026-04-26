# Skill: Technical Review

## Wanneer gebruiken
Na implementatie van features, bij signalering van technische problemen, of periodiek voor architectuur-assessment.

## Input
- Bestand(en) of module om te reviewen
- Of: specifiek technisch concern
- Context: wat is er gewijzigd of waarom review

## Stappen

1. **Lees de relevante code** — begrijp structuur en intent
2. **Check code kwaliteit:**
   - TypeScript types correct en volledig?
   - Error handling aanwezig waar nodig?
   - Geen hardcoded waarden die configurabel moeten zijn?
   - Geen ongebruikte imports of variabelen?
3. **Check architectuur:**
   - Past het in de bestaande patronen? (hooks, pages, components)
   - Zijn verantwoordelijkheden goed gescheiden?
   - Geen circular dependencies?
4. **Check database:**
   - Migraties correct en omkeerbaar?
   - Indexes op juiste kolommen?
   - RLS policies aanwezig voor multi-tenant?
5. **Check performance:**
   - Geen N+1 queries?
   - Grote lijsten gepagineerd?
   - Zware berekeningen niet in render-loop?
6. **Check security:**
   - Input validatie aanwezig?
   - Geen SQL injection risico?
   - RLS niet omzeild?
   - Geen secrets in code?
7. **Documenteer bevindingen**

## Output
Technisch review rapport met bevindingen per categorie.

## Kwaliteitschecks
- [ ] Elke bevinding heeft een bestandslocatie
- [ ] Bevindingen zijn actionable (niet alleen "kan beter")
- [ ] Security items zijn altijd als hoog gemarkeerd
- [ ] Database changes zijn gecontroleerd op migratie-veiligheid

## Failure modes
- **Te nitpicky**: focus op style ipv substance → prioriteer impact
- **Gemiste security**: niet goed genoeg gekeken → altijd security checklist doorlopen
- **Geen context**: review zonder te begrijpen waarom code zo is → lees git history

## Escalatieregels
- Security vulnerability → direct naar engineering-manager, niet wachten
- Data corruption risico → direct escaleren
- Performance issue in productie → direct escaleren
