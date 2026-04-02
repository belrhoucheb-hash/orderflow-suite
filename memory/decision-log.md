# Decision Log

Alle CEO-besluiten en significante managementbeslissingen.

| Datum | Beslissing | Genomen door | Context | Status |
|-------|-----------|-------------|---------|--------|
| 2026-04-02 | AI-organisatie opgezet met 4 managers, 8 workers, orchestrator | CEO (Badr) | Continu doorontwikkeling TMS via AI-team | Doorgevoerd |
| 2026-04-02 | Human-in-the-loop policy vastgesteld | CEO (Badr) | Veilige automatisering met menselijke controle | Actief |
| 2026-04-02 | Doel: 90-95% automatisering met mens-in-de-loop | CEO (Badr) | Kernvisie voor het TMS | Actief |
| 2026-04-02 | Security fixes eerst: debug bypass verwijderen, tenant isolatie fixen | CEO (Badr) | P0 security issues uit productreview | Doorgevoerd |
| 2026-04-02 | Status-systeem unificeren naar DB-statussen (DRAFT/PENDING/PLANNED/IN_TRANSIT/DELIVERED/CANCELLED) | CEO (Badr) | Twee conflicterende status-systemen veroorzaakten bugs | Doorgevoerd |
| 2026-04-02 | Dispatch pagina bouwen als kern-UI voor ritten/stops/POD beheer | CEO (Badr) | Schema was klaar maar geen UI — kern van TMS | Doorgevoerd |
| 2026-04-02 | Design system gekozen: Inter (body) + Space Grotesk (display), semantic kleuren | CEO (Badr) | Consistente visuele taal voor het hele platform, professionele uitstraling | Doorgevoerd |
| 2026-04-02 | Toast systeem geunificeerd naar sonner | Engineering | 11 bestanden gebruikten verschillende toast-implementaties, sonner gekozen als standaard | Doorgevoerd |
| 2026-04-02 | Status kleuren gecentraliseerd in statusColors.ts | Engineering | Kleuren waren verspreid over meerdere componenten, nu single source of truth | Doorgevoerd |
| 2026-04-02 | Auto-extractie bij email selectie (geen handmatig klikken) | Product | Vermindert kliks per order, snellere verwerking | Doorgevoerd |
| 2026-04-02 | HITL-conforme auto-approve bij >=95% confidence + bekende klant | CEO (Badr) | Automatisering verhogen zonder veiligheid op te geven; onbekende klanten altijd handmatig | Doorgevoerd |
| 2026-04-02 | Rijtijdregistratie EU 561/2006 geimplementeerd (DriveTimeMonitor) | Operations | Wettelijke verplichting voor transportbedrijven; 4,5u pauze, 9u dagmaximum | Doorgevoerd |
| 2026-04-02 | PDF factuur generatie via jsPDF | Engineering | Professionele facturen nodig voor klanten; geen externe service nodig | Doorgevoerd |
| 2026-04-02 | Offline POD opslag via IndexedDB | Engineering | Chauffeurs moeten POD kunnen registreren zonder internet; auto-sync bij verbinding | Doorgevoerd |
| 2026-04-02 | Geofence aankomstdetectie (< 200m) met HITL bevestiging | Operations | Automatische statusupdate bij aankomst, maar chauffeur bevestigt (HITL) | Doorgevoerd |
| 2026-04-02 | 2-opt route optimalisatie als post-processing | AI Systems | Nearest-neighbor geeft goede maar niet optimale routes; 2-opt verbetert met 3-5% | Doorgevoerd |
| 2026-04-02 | Client extraction templates na 5+ orders | AI Systems | Terugkerende klanten hebben voorspelbare formaten; templates verhogen accuracy | Doorgevoerd |

---

## Format voor nieuwe entries

```markdown
| [datum] | [beslissing] | [CEO/manager] | [waarom] | [doorgevoerd/lopend/geparkeerd/afgewezen] |
```
