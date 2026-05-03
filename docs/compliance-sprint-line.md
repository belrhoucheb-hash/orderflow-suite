# Orderflow Compliance Sprint Line

Datum: 3 mei 2026  
Doel: Orderflow aantoonbaar compliant maken voor TMS-gebruik, AVG/GPS, POD/CMR, fiscale bewaarplicht, API/security governance en eFTI-readiness.

## Werkwijze

- Deze sprint-lijn loopt parallel aan productontwikkeling.
- Elke sprint levert zichtbare productfunctionaliteit, database-controls en bewijsvoering op.
- Geen compliance claim zonder auditbaar bewijs in logs, exports of instellingen.
- Juridische toets blijft nodig voor finale claims richting klanten.

## Sprint 1 - Compliance Foundation

Doel: bewaartermijnen, bewijslog en dataclassificatie centraal afdwingen.

### Scope

- Dataclassificatie per domein: orders, POD, GPS, CMR, facturen, chauffeurs, voertuigen, API logs.
- Retentiebeleid per datatype.
- Legal hold ondersteuning.
- Scheduled archive/purge jobs.
- Admin auditlog voor elke compliance-run.

### Deliverables

- `data_retention_policies` tabel.
- `legal_holds` tabel.
- `retention_runs` tabel.
- Scheduler voor bestaande `prune_audit_log()` en `prune_activity_log()`.
- Nieuwe jobs voor GPS-posities, POD-bestanden, driver positions en tijdelijke/offline data.
- Settings-pagina voor bewaartermijnen per tenant.

### Acceptatiecriteria

- Admin ziet per datatype: bewaartermijn, laatste run, volgende run, aantal records verwerkt.
- Records met legal hold worden niet verwijderd.
- Elke purge/archive run is terug te vinden in een auditlog.
- Fiscale data kan minimaal 7 jaar vastgezet worden.

## Sprint 2 - Private POD & Evidence Storage

Doel: POD-handtekeningen en foto's veilig opslaan en alleen gecontroleerd delen.

### Scope

- `pod-files` bucket private maken.
- Public URLs vervangen door signed URL service.
- Download/view audit logging.
- Offline POD payloads beperken en automatisch opschonen.
- Migratiepad voor bestaande publieke POD URLs.

### Deliverables

- Private storage policies voor POD.
- Edge function `get-pod-file-url`.
- `pod_access_log` tabel.
- Migratie voor bestaande `pod_signature_url` en `pod_photos`.
- TTL en retry/purge voor IndexedDB POD queue.

### Acceptatiecriteria

- Geen nieuwe POD-bestanden hebben publieke URLs.
- Elke view/download van POD-bestand wordt gelogd met user, tenant, order en timestamp.
- Offline POD data wordt na succesvolle sync verwijderd.
- Mislukte offline POD data wordt na ingestelde termijn gepurged of opnieuw aangeboden.

## Sprint 3 - AVG/GPS & Driver Privacy

Doel: tracking aantoonbaar rechtmatig, beperkt en transparant maken.

### Scope

- Tracking alleen tijdens actieve rit/taak.
- Driver privacy notice in ChauffeurApp.
- Purpose logging voor tracking.
- Off-duty/private mode waar van toepassing.
- Access logging voor live tracking en historische posities.
- Data subject export/delete workflow.

### Deliverables

- `tracking_purposes` en `tracking_access_log`.
- Driver notice component.
- Tracking status indicator in ChauffeurApp.
- Privacy mode/off-duty control.
- Persoonsdata-export voor chauffeur/order/contact.
- Verwijder/anonymiseer workflow met legal-hold blokkades.
- `privacy_requests` en `privacy_request_events` voor AVG-verzoeken.
- RPC voor chauffeur/klant/order-contact export.
- RPC voor chauffeur-anonimisering met legal-hold blokkade.

### Acceptatiecriteria

- Chauffeur ziet wanneer tracking actief is en waarom.
- GPS wordt niet verzonden zonder actieve trip/context.
- Planner/admin views van tracking worden gelogd.
- Data-export bevat relevante persoonsgegevens in leesbaar formaat.
- Verwijderen blokkeert automatisch bij fiscale of juridische bewaarplicht.

## Sprint 4 - CMR/eCMR Evidence Layer

Doel: van "CMR document genereren" naar bewijsbaar, onveranderbaar CMR-dossier.

### Scope

- CMR finalization.
- Document hash.
- Versiebeheer.
- Append-only CMR event log.
- Ondertekening per partij.
- Verificatiepagina voor CMR/POD.

### Deliverables

- `cmr_documents` tabel.
- `cmr_document_versions` tabel.
- `cmr_events` append-only log.
- Hashing van definitieve CMR PDF/data.
- Sign-flow voor afzender, vervoerder, ontvanger.
- Public/private verification endpoint met beperkte data.
- RPC `finalize_cmr_document` voor hash, versie en eventlog.
- `verify-cmr-document` endpoint met token, hash-check en verification eventlog.

### Acceptatiecriteria

- Definitieve CMR kan niet stil gewijzigd worden.
- Elke wijziging na finalization wordt een nieuwe versie met reden.
- CMR export bevat PDF/data, hash, ondertekeningen en eventlog.
- Verificatiepagina toont of document intact is.

## Sprint 5 - Fiscal & Invoice Archive

Doel: facturen en financiële administratie controleerbaar en onveranderbaar bewaren.

### Scope

- Originele digitale facturen/PDF's bewaren.
- 7 jaar fiscale lock.
- Creditnota/correctieflow.
- Audit export voor controle.
- Boekhoudconnector bewijslog.

### Deliverables

- `invoice_archive` tabel.
- Hash per factuurdocument.
- Immutable invoice PDF snapshot.
- Creditnota workflow.
- Exportpakket voor Belastingdienst/accountant.
- Connector sync log voor SnelStart/Exact.
- Fiscale lock op verzonden/betaalde facturen met minimale 7 jaar bewaartermijn.
- Append-only `invoice_archive_events` voor view/export/correctie-bewijs.
- RPC `archive_invoice_snapshot` voor hash, snapshot en lock.

### Acceptatiecriteria

- Verzonden facturen worden niet overschreven.
- Correcties lopen via creditnota of nieuwe versie met audit trail.
- Facturen blijven minimaal 7 jaar beschikbaar.
- Export kan binnen redelijke termijn worden gegenereerd.

## Sprint 6 - API, Integrations & NIS2 Operations

Doel: externe toegang, incidenten en leveranciers aantoonbaar beheersen.

### Scope

- API-token lifecycle.
- Scope approval.
- Expiry/rotation.
- Incident response workflow.
- Backup/restore bewijs.
- Supplier/subprocessor register.
- Security monitoring.

### Deliverables

- Token owner, expiry en rotation reminders.
- API anomaly alerts.
- Incident register.
- Access review workflow.
- Backup restore test log.
- Supplier/subprocessor overzicht.
- Verplichte API-token eigenaar, expiry, reviewdatum en rotation deadline.
- Append-only `api_token_events` voor review, rotatie, revoke en anomalies.
- Gateway weigert tokens waarvan rotatie vereist is.

### Acceptatiecriteria

- Geen permanent API-token zonder owner en expiry.
- Tokengebruik is per tenant inzichtelijk.
- Incidenten hebben status, eigenaar, impact en tijdlijn.
- Access reviews zijn periodiek aantoonbaar uitgevoerd.
- Backup restore test is zichtbaar en gedocumenteerd.

## Sprint 7 - eFTI Readiness

Doel: Orderflow voorbereiden op eFTI en beslissing nemen over certificering of provider-koppeling.

### Scope

- eFTI common data set mapping.
- Authority inspection access.
- Machine-readable export.
- QR/link voor inspectie.
- Provider/certificering keuze.

### Deliverables

- `efti_datasets` tabel.
- Mapping van orders/shipments naar eFTI velden.
- eFTI JSON/XML export.
- Authority access log.
- QR/link flow voor inspectie.
- Beslisdocument: zelf certificeren of integreren met gecertificeerde eFTI-provider.

### Acceptatiecriteria

- Per transportdossier kan een eFTI dataset gegenereerd worden.
- Inspectie-toegang is beperkt, tijdelijk en gelogd.
- Export is machine-readable.
- Product claim blijft "eFTI-ready" totdat certificering/provider actief is.

## Sprint 8 - Conditional Transport Modules

Doel: sector-specifieke compliance alleen activeren waar klanten dit nodig hebben.

### Modules

- ADR/gevaarlijke stoffen.
- Douane/export.
- Cold chain/temperatuur.
- Afvaltransport.
- Farma/food.

### Acceptatiecriteria

- Module is tenant-configurable.
- Velden, documenten en bewaartermijnen verschijnen alleen als de module actief is.
- Elke module heeft eigen documenttypes, validaties en exports.

## Definition Of Done

Een compliance-feature is pas klaar als:

- De UI het proces ondersteunt.
- De database het afdwingt.
- RLS/permissions kloppen.
- Retentie en auditlog zijn ingericht.
- Er een export of bewijsrapport is.
- Er tests zijn voor kritieke rechten/retentieflows.
- De claim in de UI/documentatie niet verder gaat dan wat technisch aantoonbaar is.

## Eerste Aanbevolen Bouwvolgorde

1. Sprint 2: Private POD & Evidence Storage.
2. Sprint 1: Compliance Foundation.
3. Sprint 3: AVG/GPS & Driver Privacy.
4. Sprint 4: CMR/eCMR Evidence Layer.
5. Sprint 5: Fiscal & Invoice Archive.
6. Sprint 6: API, Integrations & NIS2 Operations.
7. Sprint 7: eFTI Readiness.
8. Sprint 8: Conditional Transport Modules.

Reden: POD en GPS bevatten de meest gevoelige persoonsgegevens en bewijsstukken. Daarna volgt CMR/eCMR en fiscale bewijskracht. eFTI is strategisch belangrijk, maar de harde ingangsdatum geeft ruimte om dit parallel te ontwerpen terwijl de basis eerst sluitend wordt.
