# Organisatie Organogram — orderflow-suite

## CEO
**Badr** — Visie, prioriteiten, beslissingen, goedkeuringen

## Orchestrator
**orchestrator.md** — Coördinatie, routing, dagelijkse cyclus, CEO-brief samenstelling

---

## Management Layer

### Product Manager
- **Rapporteert aan:** CEO
- **Ontvangt van:** UX Reviewer, Feature Scout, Process Analyst
- **Verantwoordelijk voor:** Backlog, productrichting, featurewaarde, roadmap

### Engineering Manager
- **Rapporteert aan:** CEO
- **Ontvangt van:** App Developer, AI Developer, QA Reviewer, Monitoring Analyst
- **Verantwoordelijk voor:** Technische kwaliteit, haalbaarheid, architectuur, bouw

### Operations Manager
- **Rapporteert aan:** CEO
- **Ontvangt van:** Process Analyst, Monitoring Analyst, UX Reviewer
- **Verantwoordelijk voor:** Procesefficiëntie, automatisering, mens-in-de-loop

### AI Systems Manager
- **Rapporteert aan:** CEO
- **Ontvangt van:** AI Developer, Monitoring Analyst, QA Reviewer
- **Verantwoordelijk voor:** AI-kwaliteit, confidence, automation coverage

---

## Worker Layer

### Analyse Workers
| Worker | Rapporteert aan | Kernactiviteit |
|--------|----------------|----------------|
| UX Reviewer | Product Manager | UX-reviews, frictie, verbetervoorstellen |
| Feature Scout | Product Manager | Ontbrekende features, kansen |
| Process Analyst | Operations Manager | Procesautomatisering, HITL-analyse |
| Monitoring Analyst | Eng/AI/Ops Manager | Logs, metrics, trends, afwijkingen |
| QA Reviewer | Engineering Manager | Regressies, kwaliteit, risico's |

### Bouw Workers
| Worker | Rapporteert aan | Kernactiviteit |
|--------|----------------|----------------|
| App Developer | Engineering Manager | React/TS features, UI, Supabase |
| AI Developer | Engineering + AI Manager | AI-flows, extractie, confidence |

### Ondersteunend
| Worker | Rapporteert aan | Kernactiviteit |
|--------|----------------|----------------|
| Documentation Agent | Orchestrator | Besluiten, changelogs, kennisbehoud |

---

## Rapportagelijnen

```
Workers ──→ Managers ──→ CEO
                ↑
          Orchestrator (coördineert)
                ↑
     Documentation Agent (documenteert)
```

## Escalatiepaden

```
Normaal:      Worker → Manager → CEO (via dagelijkse cyclus)
Urgent:       Worker → Manager → CEO (direct, buiten cyclus)
Kritiek:      Worker → CEO (direct, via alert format)
```
