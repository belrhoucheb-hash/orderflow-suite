# Skill: QA Regression Check

## Wanneer gebruiken
Na elke significante codewijziging, voor deployment, of wanneer onverwacht gedrag gesignaleerd wordt.

## Input
- Gewijzigde bestanden of feature
- Of: beschrijving van onverwacht gedrag
- Context: wat is er veranderd

## Stappen

1. **Inventariseer wijzigingen** — welke bestanden, functies, types zijn gewijzigd
2. **Bepaal blast radius** — welke andere componenten gebruiken deze code?
   - Grep voor imports en referenties
   - Check hooks die gewijzigde data gebruiken
   - Check pages die gewijzigde componenten renderen
3. **Per geraakt component:**
   - Werkt de TypeScript compilatie nog?
   - Kloppen de props/types nog?
   - Zijn database queries nog correct na schema-wijziging?
   - Werken bestaande flows nog end-to-end?
4. **Check edge cases:**
   - Lege states (geen data)
   - Fout-states (API failures)
   - Grenswaarden (maximale invoer)
   - Multi-tenant correctheid
5. **Check data-integriteit:**
   - Foreign keys intact?
   - Constraints niet geschonden?
   - Migratie backwards compatible?
6. **Formuleer test-scenario's** voor handmatige verificatie

## Output
Regressie-rapport met:
- Geraakte componenten
- Risico-beoordeling per component
- Test-scenario's voor verificatie
- Aanbevelingen

## Kwaliteitschecks
- [ ] Blast radius volledig in kaart
- [ ] Alle geraakte componenten beoordeeld
- [ ] Test-scenario's zijn uitvoerbaar
- [ ] Multi-tenant impact beoordeeld

## Failure modes
- **Incomplete blast radius**: niet alle referenties gevonden → altijd grep breed
- **Valse geruststelling**: "ziet er goed uit" zonder diep te kijken → altijd edge cases checken

## Escalatieregels
- Regressie in core flow (order/planning/dispatch) → direct engineering-manager
- Data-integriteit risico → direct escaleren
- Multi-tenant lekkage → KRITIEK, direct naar CEO
