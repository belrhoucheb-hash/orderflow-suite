# KPI Framework

## Primaire KPI's

### 1. Automatiseringsgraad
**Definitie:** Percentage van TMS-processtappen dat zonder menselijke interventie verloopt.
**Doel:** 90-95%
**Meting:** Per module, gewogen gemiddelde
**Frequentie:** Wekelijks
**Eigenaar:** Operations Manager

| Module | Huidige schatting | Doel |
|--------|------------------|------|
| Email intake → Order | ~30% | 95% |
| Order validatie | ~50% | 90% |
| Planning/routing | ~30% | 85% |
| Dispatch | ~5% | 80% |
| Chauffeur communicatie | ~40% | 85% |
| Aflevering/POD | ~20% | 90% |
| Facturatie | ~20% | 95% |
| **Gewogen totaal** | **~28%** | **90%** |

### 2. AI Accuracy
**Definitie:** Percentage AI-extracties dat geen handmatige correctie nodig heeft.
**Doel:** >95%
**Meting:** ai_corrections tabel / totaal orders
**Frequentie:** Dagelijks
**Eigenaar:** AI Systems Manager

### 3. AI Confidence
**Definitie:** Gemiddelde confidence score van AI-extracties.
**Doel:** >90% gemiddeld
**Meting:** Confidence scores uit parse-order
**Frequentie:** Dagelijks
**Eigenaar:** AI Systems Manager

---

## Secundaire KPI's

### 4. Codekwaliteit
- TypeScript errors: 0
- Ongebruikte imports: 0
- Open QA-bevindingen: <5
**Eigenaar:** Engineering Manager

### 5. UX Score
- Kritieke UX-issues: 0
- Hoge UX-issues: <3
**Eigenaar:** Product Manager

### 6. Feature Velocity
- Features opgeleverd per week
- Voorstellen goedgekeurd vs afgewezen
**Eigenaar:** Product Manager

### 7. Incident Count
- Kritieke alerts per week: 0
- Waarschuwingen per week: <5
**Eigenaar:** Engineering Manager

---

## KPI Rapportage

KPI's worden gerapporteerd in:
- Dagelijkse CEO brief (hoofdKPI's als signaal)
- Wekelijkse executive review (alle KPI's met trend)
- Maandelijks: diepere analyse door relevante manager

## KPI Trend Notatie
- ↑ = verbeterend (positief)
- ↓ = verslechterend (negatief)
- → = stabiel
- ⚠ = onder drempel
