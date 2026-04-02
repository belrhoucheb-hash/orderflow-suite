# Rapportageformaten

## 1. Worker → Manager

Elke worker levert output in dit format:

```markdown
## Bevinding: [onderwerp]

- **Onderwerp:** [kort en duidelijk]
- **Bevinding:** [wat is ontdekt]
- **Impact:** [hoog/middel/laag — wat is het gevolg]
- **Urgentie:** [hoog/middel/laag — hoe snel moet dit opgepakt worden]
- **Aanbeveling:** [concrete actie]
- **Confidence:** [hoog/middel/laag — hoe zeker is de bevinding]
- **Bewijs/context:** [bestandspad, data, of analyse die de bevinding onderbouwt]
- **Voorgestelde vervolgstap:** [wie moet wat doen]
```

---

## 2. Manager → CEO

Elke manager levert executive output in dit format:

```markdown
## [Manager] Update — [datum]

### Opgeleverd
- [wat is afgerond]

### Ontdekt
- [nieuwe bevindingen van workers]

### Voorgesteld
- **[titel]** — [1 zin] | Impact: H/M/L | Effort: S/M/L/XL
  - Aanbeveling: [doen/niet doen/uitstellen]

### Risico's
- [wat kan misgaan]

### Beslissing gevraagd
- [wat moet CEO beslissen]
  - Aanbevolen keuze: [wat raad je aan]
```

---

## 3. CEO Brief (dagelijks)

```markdown
# CEO Brief — [datum]

## Opgeleverd
- [resultaten]

## Lopend
- [in progress items]

## Voorstellen (beslissing nodig)
1. **[titel]** — Impact: H/M/L | Aanbeveling: [advies]

## Risico's & Blockers
- [items]

## KPI Signalen
| KPI | Waarde | Trend |
|-----|--------|-------|

## Aanbevolen prioriteiten
1. [wat eerst]
```

---

## 4. Critical Alert

```markdown
# KRITIEK ALERT — [datum]

**Probleem:** [1 zin]
**Ernst:** KRITIEK/HOOG
**Impact:** [wie wordt geraakt]
**Oorzaak:** [bekend/vermoedelijk]
**Status:** [wat is er al gedaan]
**Aanbevolen actie:** [wat moet er NU]
**Risico bij niet-handelen:** [consequentie]
```

---

## Regels voor alle rapportages

1. **Concreet, niet vaag** — "Orders.tsx regel 45 heeft geen loading state" niet "de UX kan beter"
2. **Altijd aanbeveling** — nooit alleen probleem melden zonder voorstel
3. **Altijd confidence** — hoe zeker ben je van deze bevinding
4. **Altijd impact** — wat is het gevolg als we niets doen
5. **CEO-brief max 1 pagina** — als het langer is, is het niet goed samengevat
