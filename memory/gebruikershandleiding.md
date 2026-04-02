# Gebruikershandleiding — AI Organisatie orderflow-suite

## Voor wie is dit?

Voor jou, Badr, als CEO van de AI-organisatie die orderflow-suite continu doorontwikkelt. Deze handleiding legt uit hoe je de organisatie dagelijks gebruikt.

---

## 1. Wat heb je?

Je hebt een AI-bedrijf in je project met:

| Laag | Wie | Wat ze doen |
|------|-----|-------------|
| **CEO** | Jij (Badr) | Visie, beslissingen, goedkeuringen |
| **Orchestrator** | AI | Coördineert alles, stelt je briefs samen |
| **4 Managers** | AI | Filteren, prioriteren, samenvatten |
| **8 Workers** | AI | Analyseren, bouwen, reviewen |
| **1 Documentatie** | AI | Houdt alles bij |

---

## 2. Dagelijks gebruik

### Sessie starten

Open Claude Code in je orderflow-suite map en typ:

```
/start-organization
```

Dit doet:
- Checkt waar we gebleven zijn
- Toont openstaande items
- Vraagt wat je wilt doen

### Dagelijkse cyclus draaien

```
/run-daily-cycle
```

Dit draait de volledige organisatie:

```
Fase 1 (±10 min)    Workers analyseren parallel:
                     → UX review, feature scan, procesanalyse,
                       monitoring, QA check

Fase 2 (±5 min)     Managers bundelen:
                     → filteren, prioriteren, samenvatten

Fase 3 (±2 min)     CEO-brief wordt samengesteld

Fase 4              Jij leest, beslist, geeft feedback
```

### Alleen een CEO-brief willen

```
/generate-ceo-brief
```

Genereert een samenvatting van alles wat er speelt. Leesbaar in 2-3 minuten.

---

## 3. Wekelijks gebruik

### Wekelijkse review (bijv. vrijdag)

```
/weekly-executive-review
```

Dit geeft je:
- Alles wat deze week opgeleverd is
- KPI-dashboard met trends
- Vooruitgang per module
- Aanbevolen focus voor volgende week

---

## 4. Wanneer je iets specifieks wilt

| Wat je wilt | Command |
|-------------|---------|
| Breed productoverzicht | `/review-current-product` |
| Verbetervoorstellen krijgen | `/propose-next-improvements` |
| Kritiek issue melden | `/escalate-critical-issue` |

---

## 5. Hoe je besluiten neemt

Na elke CEO-brief krijg je voorstellen. Voor elk voorstel:

### Goedkeuren
Zeg: *"Goedgekeurd, ga bouwen"* of *"Akkoord op voorstel 1 en 3"*
→ Wordt gerouteerd naar de juiste developer
→ Wordt vastgelegd in decision-log

### Afwijzen
Zeg: *"Niet doen, te veel risico"* of *"Parkeren tot na dispatch"*
→ Wordt vastgelegd met reden
→ Item gaat naar geparkeerd of afgewezen

### Meer info vragen
Zeg: *"Ik wil meer detail over voorstel 2"*
→ Relevante manager geeft uitgebreidere analyse

### Prioriteit wijzigen
Zeg: *"Dispatch heeft nu prioriteit boven facturatie"*
→ Roadmap wordt geüpdatet
→ Alle managers passen hun werk aan

---

## 6. Wat je NIET hoeft te doen

| Dit hoef je niet | Dat doet |
|------------------|----------|
| Elke pagina zelf reviewen | UX Reviewer |
| Bugs zelf zoeken | QA Reviewer |
| Bedenken wat er ontbreekt | Feature Scout |
| Technische details uitzoeken | Engineering Manager |
| AI-kwaliteit monitoren | AI Systems Manager |
| Processen analyseren | Process Analyst |
| Documentatie bijhouden | Documentation Agent |

Jij beslist alleen over:
- Wat we bouwen (en wat niet)
- Wat prioriteit krijgt
- Wanneer iets naar productie gaat
- Wijzigingen in beleid

---

## 7. De CEO-brief lezen

Elke brief heeft deze secties:

```
Opgeleverd          → Wat is af sinds de vorige brief
Lopend              → Waar wordt aan gewerkt
Voorstellen         → Wat wacht op jouw beslissing
Risico's            → Wat kan misgaan
KPI Signalen        → Automatisering ↑↓, AI accuracy ↑↓
Aanbevolen focus    → Wat zou ik als CEO nu doen
```

**Tip:** Lees eerst "Voorstellen" en "Risico's" — dat is waar jouw input het meest nodig is.

---

## 8. Alerts en escalaties

Niet alles wacht op de dagelijkse cyclus. Bij kritieke problemen krijg je direct een alert:

```
KRITIEK ALERT — [datum]
Probleem: [wat]
Impact: [wie geraakt]
Aanbevolen actie: [wat nu]
```

Dit gebeurt bij:
- Security issues
- Data corruption risico
- Kernfunctionaliteit kapot
- Multi-tenant lekkage

---

## 9. Mens-in-de-loop: wanneer word je gevraagd?

| Situatie | Jij wordt gevraagd |
|----------|-------------------|
| AI confidence < 80% | Valideer de extractie |
| Database migratie | Goedkeuring geven |
| Nieuwe feature > maat S | Goedkeuring geven |
| AI-autonomie uitbreiden | Goedkeuring geven |
| Productie deploy | Goedkeuring geven |
| Klantcommunicatie templates | Eerste keer reviewen |
| Financiële logica wijzigen | Altijd goedkeuring |

Vuistregel: **alles wat klanten raakt of data kan breken, komt langs jou.**

---

## 10. Waar vind je wat?

| Wat | Waar |
|-----|------|
| Wie doet wat (organogram) | `memory/org-chart.md` |
| Hoe werkt de cyclus | `memory/operating-model.md` |
| Alle besluiten | `memory/decision-log.md` |
| Roadmap en status per module | `memory/roadmap-memory.md` |
| Alle verbeterideeën | `memory/improvement-pipeline.md` |
| KPI-doelen en metingen | `memory/kpi-framework.md` |
| Beleid voor automatisering | `memory/human-in-the-loop-policy.md` |
| Rapportageformaten | `memory/reporting-formats.md` |
| CEO-briefs | `inbox/ceo/` |
| Dagelijkse logs | `logs/daily/` |
| Alerts | `logs/alerts/` |

---

## 11. Organisatie uitbreiden

### Nieuwe worker toevoegen
1. Maak `.claude/agents/[naam].md` (kopieer format van bestaande worker)
2. Wijs toe aan een manager
3. Update `memory/org-chart.md`

### Nieuwe manager toevoegen
1. Maak `.claude/agents/[naam]-manager.md`
2. Wijs workers toe
3. Update `memory/org-chart.md` en `memory/operating-model.md`

### Nieuwe skill toevoegen
1. Maak `.claude/skills/[naam]/SKILL.md`
2. Definieer: wanneer, input, stappen, output, checks

### Nieuwe command toevoegen
1. Maak `.claude/commands/[naam].md`
2. Beschrijf de stappen die uitgevoerd moeten worden

---

## 12. Tips

1. **Start klein** — draai eerst een paar dagelijkse cycli voordat je grote beslissingen neemt
2. **Vertrouw het filter** — managers filteren zodat jij niet alles hoeft te zien
3. **Beslis snel** — hoe sneller je op voorstellen reageert, hoe sneller er gebouwd wordt
4. **Lees de KPI's** — de trends vertellen je of het de goede kant opgaat
5. **Parkeer mag** — niet alles hoeft nu, "parkeren" is een valide beslissing
6. **Vraag om detail** — als een voorstel onduidelijk is, vraag om meer info

---

## Snelreferentie

```
/start-organization           → Begin sessie
/run-daily-cycle              → Volledige cyclus
/generate-ceo-brief           → Alleen CEO-brief
/review-current-product       → Breed productoverzicht
/propose-next-improvements    → Verbetervoorstellen
/weekly-executive-review      → Wekelijks overzicht
/escalate-critical-issue      → Kritiek probleem melden
```
