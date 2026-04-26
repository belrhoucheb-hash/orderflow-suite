# Skill: Automation Opportunity Analysis

## Wanneer gebruiken
Bij het identificeren van handmatige processen die geautomatiseerd kunnen worden. Kernskill voor het bereiken van 90-95% automatisering.

## Input
- Module of flow om te analyseren
- Of: specifiek handmatig proces dat gesignaleerd is
- Huidige automatiseringsgraad (indien bekend)

## Stappen

1. **Map het huidige proces** — lees code, edge functions, hooks
2. **Identificeer elke stap** — is deze handmatig, semi-automatisch, of volledig automatisch?
3. **Per handmatige stap, beoordeel:**
   - Kan dit geautomatiseerd worden?
   - Wat is het risico van fouten bij automatisering?
   - Is menselijke controle hier noodzakelijk?
   - Wat is de frequentie van deze stap?
   - Wat is de tijdsbesparing bij automatisering?
4. **Beoordeel human-in-the-loop noodzaak:**
   - Financiële beslissingen → mens verplicht
   - Klantcommunicatie → mens bij lage confidence
   - Data-extractie → mens bij <80% confidence
   - Routing/planning → mens bij uitzonderingen
   - Standaard-flows → automatisch mag
5. **Bereken automatiseringsgraad** — huidig vs na wijzigingen
6. **Prioriteer** — hoogste impact / laagste risico eerst

## Output
Procesanalyse met:
- Stappenlijst met automatiseringsstatus
- Per kans: voorstel, impact, risico, mens-in-de-loop beoordeling
- Automatiseringsgraad huidig vs voorgesteld

## Kwaliteitschecks
- [ ] Elke stap is geverifieerd in de code
- [ ] Human-in-the-loop is expliciet beoordeeld per stap
- [ ] Risico's zijn realistisch, niet onderschat
- [ ] Frequentie en tijdsbesparing zijn geschat
- [ ] Geen aanname dat alles geautomatiseerd "moet"

## Failure modes
- **Over-automatisering**: wil alles automatiseren zonder risico-afweging → altijd HITL beoordelen
- **Onderschatten complexiteit**: "gewoon automatiseren" zonder edge cases → altijd failure modes benoemen
- **Geen meetbaarheid**: geen manier om te weten of het werkt → altijd success metrics definiëren

## Escalatieregels
- Automatisering die menselijke controle vermindert → ai-systems-manager + CEO
- Automatisering van financiële flows → operations-manager + CEO
- Automatisering met privacy-impact → direct naar CEO
