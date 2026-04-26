# Skill: Monitoring Analysis

## Wanneer gebruiken
Dagelijks als onderdeel van de cyclus, of ad hoc bij signalen van problemen.

## Input
- Periode om te analyseren
- Of: specifiek signaal om te onderzoeken
- Beschikbare databronnen (logs, Supabase, ai_corrections)

## Stappen

1. **Verzamel beschikbare data:**
   - Database tabellen: orders (statussen, timestamps), ai_corrections, trips
   - Edge function logs (indien beschikbaar)
   - Error patterns in code (try/catch, error boundaries)
2. **Analyseer patronen:**
   - Zijn er terugkerende fouten?
   - Zijn er ongebruikelijke volumes?
   - Zijn er confidence-trends?
   - Zijn er performance-indicatoren?
3. **Check AI-kwaliteit:**
   - ai_corrections: welke velden worden het meest gecorrigeerd?
   - Per klant: zijn er klanten met systematisch lage accuracy?
   - Trend: wordt het beter of slechter over tijd?
4. **Check operationele gezondheid:**
   - Orders in onverwachte statussen?
   - Trips zonder chauffeur?
   - Facturen in draft die te lang openstaan?
5. **Documenteer bevindingen**

## Output
Monitoring rapport met signalen, trends en aanbevelingen.

## Kwaliteitschecks
- [ ] Data-bronnen expliciet benoemd
- [ ] Trends met richting (↑↓→)
- [ ] Concrete cijfers, niet alleen "meer" of "minder"
- [ ] Aanbevelingen zijn actionable

## Failure modes
- **Geen data**: bronnen niet beschikbaar → documenteer welke data ontbreekt
- **Valse alarmen**: normaal patroon als probleem melden → altijd baselines gebruiken

## Escalatieregels
- Plotselinge anomalie → direct relevant manager
- Structureel dalende AI-kwaliteit → ai-systems-manager
- Operationele verstoring → operations-manager
