# Operating Model — AI Organisatie orderflow-suite

## Dagelijkse Cyclus

### Fase 1: Worker Analyse (parallel)
**Trigger:** Start van sessie of `/run-daily-cycle`
**Duur:** ~10-15 min
**Uitvoering:** Subagents parallel

| Worker | Dagelijkse taak | Output naar |
|--------|----------------|-------------|
| UX Reviewer | Review 1-2 pagina's (rotatie) | Product Manager |
| Feature Scout | Scan 1 module | Product Manager |
| Process Analyst | Analyse 1 proces | Operations Manager |
| Monitoring Analyst | Dagelijkse check | Alle managers |
| QA Reviewer | Check recente wijzigingen | Engineering Manager |

### Fase 2: Manager Bundeling (sequentieel)
**Trigger:** Na worker-fase
**Duur:** ~5-10 min

Elke manager:
1. Ontvangt relevante worker-output
2. Filtert overlap
3. Prioriteert
4. Bepaalt: intern afhandelen of escaleren
5. Levert input voor CEO-brief

### Fase 3: CEO Brief
**Trigger:** Na manager-fase
**Duur:** ~2-3 min

Orchestrator stelt brief samen via `executive-briefing` skill.

### Fase 4: CEO Feedback
**Trigger:** CEO leest brief
**Acties:**
- Goedkeuren voorstellen → route naar developers
- Afwijzen → documenteer reden
- Vragen → route naar relevante manager
- Prioriteit wijzigen → update roadmap

### Fase 5: Bouw (indien goedgekeurd)
**Trigger:** CEO-goedkeuring
**Uitvoering:** App Developer en/of AI Developer

### Fase 6: Documentatie
**Trigger:** Na elke fase
**Uitvoering:** Documentation Agent

---

## Wekelijkse Cyclus

Elke vrijdag (of einde van de week):

1. **Weekly Executive Review** — uitgebreid overzicht
2. **Backlog-review** — Product Manager herprioriteerd
3. **KPI-update** — alle managers leveren metrics
4. **Roadmap-check** — is de koers nog juist?

---

## UX Review Rotatie

Week-rotatie over alle pagina's:

| Dag | Pagina(s) |
|-----|-----------|
| Ma | Dashboard, Orders |
| Di | NewOrder, OrderDetail |
| Wo | Inbox, Mail |
| Do | Planning, Dispatch (trips) |
| Vr | Fleet, Chauffeurs, ChauffeurApp |
| Za | Facturatie, Rapportage |
| Zo | Clients, Settings, Login |

---

## Feature Scout Rotatie

| Week | Module |
|------|--------|
| 1 | Inbox/AI Pipeline |
| 2 | Orders/Dispatch |
| 3 | Planning/Routing |
| 4 | Fleet/Chauffeurs |
| 5 | Facturatie/Rapportage |
| 6 | Cross-module integraties |

---

## Hoe de organisatie te starten

1. Open Claude Code in orderflow-suite directory
2. Run: `/start-organization`
3. Kies: dagelijkse cyclus of specifieke taak
4. Bij dagelijkse cyclus: `/run-daily-cycle`
5. Bij CEO-brief: `/generate-ceo-brief`
6. Bij productreview: `/review-current-product`
