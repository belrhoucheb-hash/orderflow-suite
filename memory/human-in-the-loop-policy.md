# Human-in-the-Loop Policy

## Kernregel
Bij twijfel: altijd menselijke controle. Liever één keer te veel vragen dan één keer te weinig.

---

## Wanneer menselijke controle VERPLICHT is

### 1. Lage Confidence
- AI-extractie confidence < 80% → dispatcher moet valideren
- Adresherkenning confidence < 85% → handmatige check
- Klantherkenning bij nieuwe afzender → altijd menselijke bevestiging

### 2. Risicovolle Wijzigingen
- Database migraties → CEO goedkeuring
- Wijzigingen in auth/security → CEO goedkeuring
- Wijzigingen aan AI-autonomie levels → CEO goedkeuring
- Productie deploys → CEO goedkeuring
- Schema-wijzigingen die data kunnen raken → engineering-manager + CEO

### 3. Operationele Uitzonderingen
- Order met onbekende klant → dispatcher bevestigt
- Adres niet gevonden via Google Places → handmatig invoeren
- Chauffeur meldt uitzondering → dispatcher beoordeelt
- Conflicterende instructies in email → menselijke interpretatie

### 4. Grote Productkeuzes
- Nieuwe modules toevoegen → CEO
- Bestaande flows significant wijzigen → CEO
- Integraties met externe systemen → CEO
- Prijsmodel/factuurlogica wijzigen → CEO

### 5. Productiewijzigingen met Impact
- Wijzigingen die alle tenants raken → CEO
- Performance-impactvolle queries → engineering-manager
- Wijzigingen aan email-flows naar klanten → CEO

### 6. AI-output die niet autonoom vertrouwd mag worden
- Financiële berekeningen → altijd menselijke validatie
- Klantcommunicatie → review bij eerste keer per template
- Routeplanning bij uitzonderlijke omstandigheden → planner review
- Voorstellen voor minder menselijke controle → CEO beslissing

---

## Wanneer automatisch handelen MAG

### Hoge confidence + laag risico
- AI-extractie > 95% confidence bij bekende klant → automatisch order aanmaken
- Standaard routeplanning zonder uitzonderingen → automatisch
- Bevestigingsmail bij volledige order → automatisch
- Statusupdates bij barcode-scan → automatisch

### Interne organisatie-acties
- Workers mogen altijd analyses uitvoeren
- Managers mogen lage-impact items intern afhandelen
- Documentation agent mag altijd documenteren
- Monitoring mag altijd rapporteren

---

## Escalatie-niveaus

| Niveau | Trigger | Actie |
|--------|---------|-------|
| INFO | Lage confidence, maar geen risico | Log, verwerk normaal |
| WAARSCHUWING | Lage confidence + operationeel risico | Manager review |
| HOOG | Mogelijke fout met klantimpact | Manager + CEO notificatie |
| KRITIEK | Data-integriteit of security risico | Direct CEO, stop proces |

---

## Review van dit beleid

Dit beleid wordt maandelijks gereviewd door AI Systems Manager en Operations Manager, met CEO-goedkeuring voor wijzigingen.
