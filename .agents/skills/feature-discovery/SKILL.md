# Skill: Feature Discovery

## Wanneer gebruiken
Bij het zoeken naar ontbrekende functies, uitbreidingsmogelijkheden of gaten in de huidige TMS-workflow. Periodiek als onderdeel van de verbetercyclus.

## Input
- Domein om te scannen (bijv. "dispatch", "facturatie", "planning")
- Of: specifieke workflow (bijv. "order lifecycle")
- Optioneel: vergelijkingsrichting (bijv. "wat doen standaard TMS-systemen hier")

## Stappen

1. **Scan het domein** — lees relevante pages, hooks, types, en database schema's
2. **Map de huidige functionaliteit** — wat bestaat er al?
3. **Identificeer gaten:**
   - Welke stappen in het logistieke proces ontbreken?
   - Welke data wordt wel opgeslagen maar niet getoond?
   - Welke tabellen hebben velden die nergens gebruikt worden?
   - Welke flows stoppen halverwege?
4. **Vergelijk met TMS-standaarden:**
   - Order management: intake, validatie, confirmatie, tracking, POD, facturatie
   - Fleet: voertuigbeheer, onderhoud, certificaten, brandstof
   - Planning: route-optimalisatie, capaciteit, tijdslots, restricties
   - Dispatch: communicatie, real-time tracking, uitzonderingen
5. **Waardeer elke kans** — impact vs effort
6. **Documenteer** in het Feature Discovery outputformaat

## Output
Gestructureerd rapport per ontdekte kans:
- Feature titel, impact, effort, urgentie, domein
- Beschrijving, waarde, bewijs, aanpak, afhankelijkheden

## Kwaliteitschecks
- [ ] Elke feature heeft bewijs uit de codebase (niet speculatief)
- [ ] Impact en effort zijn realistisch ingeschat
- [ ] Afhankelijkheden zijn benoemd
- [ ] Geen duplicatie met bestaande functionaliteit
- [ ] Waardepropositie is duidelijk voor een logistiek bedrijf

## Failure modes
- **Feature al bestaat**: niet goed genoeg gezocht → altijd grep/glob eerst
- **Te ambitieus**: features die maanden kosten → splits in MVP + uitbreidingen
- **Geen waarde**: feature klinkt cool maar helpt niemand → altijd "wie profiteert?" beantwoorden

## Escalatieregels
- Feature die architectuurwijziging vereist → markeer voor engineering-manager review
- Feature die productrichting verandert → escaleer via product-manager naar CEO
- Feature met compliance/legal implicaties → direct escaleren
