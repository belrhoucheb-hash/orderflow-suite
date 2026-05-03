# Orderflow TMS Compliance Gap Analysis

Datum: 3 mei 2026  
Scope: Orderflow Suite als TMS voor planning, transportdossiers, vrachtbrieven/CMR, POD, tracking, facturatie, API-koppelingen en automatisering.  
Status: technische productscan, geen juridisch advies. Laat finale interpretatie toetsen door een jurist/privacy officer.

## Bronnen

- EU eFTI: https://transport.ec.europa.eu/transport-themes/logistics-and-multimodal-transport/efti-regulation_en
- EU NIS2: https://digital-strategy.ec.europa.eu/en/policies/nis2-directive
- ILT vrachtbrief: https://www.ilent.nl/onderwerpen/goederenvervoer-over-de-weg/belading-vrachtwagen/vrachtbrief
- UNECE e-CMR: https://unece.org/trade/documents/2023/10/executive-guide-e-cmr
- UNECE e-CMR protocol: https://unece.org/DAM/trans/conventn/e-CMRe.pdf
- Autoriteit Persoonsgegevens, volgsystemen in vervoer: https://autoriteitpersoonsgegevens.nl/themas/vervoer/werken-in-het-vervoer/volgsystemen-in-het-vervoer
- Belastingdienst bewaarplicht: https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/administratie_bijhouden/administratie_bewaren/administratie_bewaren
- Belastingdienst digitale administratie/facturen: https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/administratie_bijhouden/facturen_maken/uw_facturen_bewaren

## Executive Summary

Orderflow heeft al veel van de technische basis die je bij een moderne TMS verwacht: tenant-scoped RLS, audit/activity logs, API token scoping, facturatievelden, CMR-generatie, POD met handtekening/foto's, tracking, driver/vehicle compliance-documenten en security-hardening.

Maar: Orderflow is op dit moment nog niet aantoonbaar compliant als eFTI-platform of juridisch robuuste eCMR-oplossing. Ook AVG/GPS-retentie en fiscale archivering moeten explicieter worden ingericht. Het grootste risico is niet dat functionaliteit ontbreekt, maar dat bewaartermijnen, toegang, toestemming/grondslag, onveranderbaarheid en autoriteit-toegang nog niet productmatig afdwingbaar zijn.

## Huidige Sterke Basis

| Domein | Wat er al is | Bewijs in code |
| --- | --- | --- |
| Tenant security | RLS hardening, service role expliciet, JWT/CORS/security fixes | `SECURITY_AUDIT.md`, `supabase/migrations/20260423210000_rls_tenant_scope_authenticated.sql`, `supabase/migrations/20260423220000_rls_service_role_explicit.sql` |
| Audit trail | `audit_log`, `activity_log`, compact update-diffs, archive/prune-functies | `supabase/migrations/20260419000000_baseline.sql`, `supabase/migrations/20260424040000_audit_log_performance.sql` |
| API governance | API tokens met scopes, tenant/client scoping, request logging | `supabase/functions/api-v1/index.ts`, `supabase/migrations/20260425000000_api_tokens.sql`, `supabase/migrations/20260425010000_api_request_log.sql` |
| CMR/POD | CMR-document, CMR-nummer, POD signature/photos, offline POD sync | `src/components/orders/CMRDocument.tsx`, `src/pages/OrderDetail.tsx`, `src/pages/ChauffeurApp.tsx`, `src/lib/offlineStore.ts` |
| Tracking | GPS naar `vehicle_positions`, driver positions, offline position buffer | `src/hooks/useTracking.ts`, `src/hooks/useDriverTracking.ts`, `src/hooks/usePositionReporter.ts` |
| Driver/vehicle compliance | Chauffeursdocumenten, certificaten, voertuigdocumenten, tachograaf-documenttype | `supabase/migrations/20260422120000_driver_certificate_records.sql`, `supabase/migrations/20260423240000_vehicle_document_types_and_storage.sql` |
| Fiscaal | Invoice tables, invoice PDF URL, boekhoudkoppelingen | `supabase/migrations/20260419000000_baseline.sql`, `supabase/functions/connector-snelstart`, `supabase/functions/connector-exact_online` |

## Compliance Gaps

### P0 - Direct Inrichten

| Gap | Waarom belangrijk | Aanbevolen inrichting |
| --- | --- | --- |
| eFTI ontbreekt | Vanaf 9 juli 2027 moeten autoriteiten elektronische vrachtinformatie accepteren via gecertificeerde eFTI-platforms. Orderflow heeft geen eFTI-dataset, certificering, authority access flow of B2A-inspectielink. | Maak een `efti_cases`/`efti_datasets` model, mapping van orders naar eFTI common data set, authority access link/QR-flow, machine-readable export, auditlog voor inspecties en keuze: zelf certificeren of koppelen met gecertificeerde provider. |
| eCMR is nog CMR-print, geen juridisch sterke eCMR | e-CMR vereist o.a. betrouwbare authenticatie, integriteit vanaf definitieve opmaak, wijzigingsdetectie en toegang voor gerechtigde partijen. Huidige CMR is renderbaar en printbaar, maar mist immutable finalization/versioning en party-authentication. | Voeg CMR finalization toe: hash, versie, append-only events, ondertekening per partij, wijzigingsredenen, exportpakket, verificatiepagina en bewijslog. Label huidige module als "CMR document" tot eCMR-flow af is. |
| POD-bestanden via public URL | Handtekeningen/foto's zijn persoonsgegevens en bewijsstukken. Code gebruikt `getPublicUrl("pod-files")`; archived migratie toont publieke buckethistorie. | Maak `pod-files` private, gebruik signed URLs met korte TTL, tenant/path policies, download audit logging, geen publieke links in DB, migratie voor bestaande URLs. |
| Offline POD/GPS persoonsgegevens in IndexedDB | Handtekeningen, foto's en GPS kunnen lokaal onversleuteld blijven hangen bij sync-fouten. | Encrypt offline payloads, stel max TTL/retry in, toon pending privacy state, purge na termijn, log sync-fouten centraal. |
| GPS/werknemer privacy niet expliciet | AP: niet-verplichte tracking mag alleen met geldige reden, belangenafweging, goede beveiliging en wissen zodra niet nodig. Privégebruik vraagt extra bescherming. | Privacy/driver notice, purpose selector, tracking only during active trip, off-duty/private toggle waar relevant, DPIA-template, retention per positie, access logging, rolrestricties en export/delete workflow. |
| Retentie is onvolledig afgedwongen | Audit prune-functies bestaan, maar geen scheduler gevonden; voor POD, GPS, driver positions, invoices en orderdocumenten ontbreekt centrale matrix. | Maak `data_retention_policies`, scheduled jobs, per-table retention, legal hold, purge/archiverun logs, tenant-config en admin UI. Fiscale data minimaal 7 jaar bewaren. |

### P1 - Voor Productierijpheid

| Gap | Waarom belangrijk | Aanbevolen inrichting |
| --- | --- | --- |
| Fiscale archivering niet immutable genoeg | Belastingdienst verlangt controleerbare administratie; facturen moeten in originele digitale vorm bewaard blijven. | Invoice archive met immutable PDF/source snapshot, creditnota/correctieflow, export voor controle, 7 jaar lock, hash per document. |
| NIS2 governance deels buiten product | NIS2 raakt transport en digitale dienstverleners afhankelijk van scope/grootte. Code heeft security-basis, maar geen procesbewijzen. | Incident response plan, vulnerability management, access reviews, supplier register, backup/restore tests, logging/alerting, incident reporting playbook. |
| API-token lifecycle mist compliance controls | Scopes/logging zijn er, maar compliance vraagt review, rotatie, owner, expiry, revoke-proces. | Verplichte expiry, laatste gebruik, token owner, scope approval, rotation reminders, anomaly alerts, audit export. |
| Data subject requests ontbreken | AVG vereist inzage/export/verwijdering waar toegestaan. | Admin workflow voor persoonsgegevens exporteren, corrigeren, verwijderen/anonymiseren met blokkades voor fiscale/legal hold data. |
| Chauffeursdocumenten en tachograaf | Documenttypes bestaan, rijtijdwaarschuwingen zijn assistief, geen volledige tachograaf-compliance. | Koppel tachograafdata/provider, label waarschuwingen als assistief, bewaar downloadbewijzen, expiry/validity alerts, audit per wijziging. |

### P2 - Afhankelijk Van Klanten/Transportsoort

| Domein | Wanneer nodig | Aanbevolen inrichting |
| --- | --- | --- |
| ADR/gevaarlijke stoffen | Als klanten gevaarlijke stoffen vervoeren | ADR velden, UN-nummers, gevarenklasse, verpakkingsgroep, documenten, voertuig/chauffeur certificaten, emergency instructions. |
| Douane/export | Bij grensoverschrijdend of douanegoederen | Douane-documenten, MRN, exportstatus, document retention, connector naar douanesystemen/provider. |
| Temperatuur/cold chain | Bij food/pharma/gekoeld transport | Sensorintegratie, temperatuur-trace, alarms, immutable temp report bij POD. |
| Afvaltransport | Bij afvalstromen | Afvalstroomnummers, begeleidingsbrieven, wettelijke bewaarplicht, autoriteit-export. |

## Aanbevolen Backlog

### Sprint 1 - Compliance Foundation

1. Maak `docs/compliance/register.md` met verwerkingsregister, subverwerkers, bewaartermijnen en grondslagen.
2. Voeg database-tabellen toe voor retention policies, legal holds en retention runs.
3. Maak scheduler voor `prune_audit_log()` en `prune_activity_log()`.
4. Maak GPS/POD retention jobs.
5. Zet `pod-files` om naar private storage met signed URL service.
6. Voeg privacy/access logs toe voor POD, GPS en CMR views/downloads.

### Sprint 2 - AVG/GPS

1. Driver privacy notice in ChauffeurApp.
2. Tracking alleen actief bij actieve rit/stop.
3. Private/off-duty mode waar contractueel toegestaan.
4. DPIA checklist in Settings.
5. Data subject export/delete workflow met legal-hold uitzonderingen.

### Sprint 3 - CMR/eCMR

1. CMR finalization met document hash.
2. Append-only CMR event log.
3. Ondertekening per partij met identity metadata.
4. Verificatiepagina voor CMR/POD.
5. Exportpakket met CMR PDF, POD, audit trail en hashes.

### Sprint 4 - eFTI Readiness

1. eFTI data model en mapping vanuit orders/shipments.
2. eFTI common data set export.
3. Authority inspection access flow met QR/link.
4. Machine-readable JSON/XML export.
5. Besluit: eigen eFTI-certificering of koppeling met gecertificeerde eFTI-provider.

### Sprint 5 - Security/NIS2 Operations

1. Incident response runbook.
2. Backup/restore bewijslog.
3. Access review workflow.
4. API-token expiry/rotation.
5. Monitoring op mislukte logins, API anomalies, webhook failures.
6. Supplier/security register voor connectors en subprocessors.

## Conclusie

Orderflow past functioneel al goed bij een modern TMS, maar compliance moet als aparte laag worden vastgezet. De hoogste prioriteit ligt bij: private POD-opslag, expliciete GPS/AVG-controls, afdwingbare retentie, juridisch sterke CMR-finalization en eFTI-roadmap. Daarna kun je richting klanten eerlijk zeggen: "TMS-ready nu, eCMR/eFTI-ready volgens roadmap", zonder te claimen dat het al gecertificeerd is.
