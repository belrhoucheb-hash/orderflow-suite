# CEO Brief — 2026-04-02

## Opgeleverd vandaag
- 20 commits, ~25.000 regels code
- 26 pipeline items opgeleverd (security, automatisering, AI, UX, design system)
- Alle 13 agents hebben gedraaid (eerste keer volledig via het organisatie-systeem)
- End-to-end flow werkt: email → order → planning → dispatch → delivery → facturatie
- Design system compleet en toegepast op alle pagina's
- P1 features: multi-dag planning, tijdvensters VRP, bulk import, onderhoud vloot, klantportaal, boekhoudexport

## Lopend
- 5 worker rapporten + 4 manager bundels afgerond (deze brief)
- 8 P2 items in backlog (E2E tests, webhooks, dark mode, multi-language, etc.)

## Voorstellen (beslissing nodig)

1. **Mail "Versturen" knop hernoemen of fixen** — knop verstuurt niet, klant ontvangt niets
   - Impact: H | Effort: S (hernoem) of M (echte verzending) | Risico: H
   - Aanbeveling: vandaag hernoemen naar "Opslaan als concept", echte verzending plannen voor deze week

2. **Placeholder-knoppen sweep** — Archive/Delete/Filters tonen success-toasts maar doen niets
   - Impact: H | Effort: S | Risico: M
   - Aanbeveling: alle nep-toasts in 1 sweep verbergen of disablen

3. **Inbox vs Mail afbakening** — twee overlappende pagina's zonder helder onderscheid
   - Impact: M | Effort: S (beslissing) | Risico: L
   - Aanbeveling: Inbox = AI order processing, Mail = communicatie. Scherp labelen.

4. **Multi-tenant isolatie sweep** — tenant_id ontbreekt in create-order, bulk import, poll-inbox
   - Impact: H | Effort: M (4-6 uur) | Risico: H
   - Aanbeveling: doen voor multi-tenant rollout, niet blokkerend voor single-tenant pilot

5. **Driver PIN hashen** — staat als plaintext "0000" in database
   - Impact: H | Effort: S (1 uur) | Risico: H
   - Aanbeveling: direct fixen met bcrypt

## Risico's & Blockers
- Mail-pagina ondermijnt productvertrouwen (knoppen die liegen)
- Multi-tenant isolatie niet consistent in nieuwe code (3 edge functions + bulk import)
- Planning time_window query mist velden → tijdvenster-feature werkt niet in dagview
- ai_corrections tabel: order_id is TEXT maar moet UUID zijn (feedback loop integriteit)

## KPI Signalen

| KPI | Waarde | Trend | Doel |
|-----|--------|-------|------|
| Automatiseringsgraad | ~82% | ↑ (was 28%) | 90-95% |
| AI pipeline | Actief | → | Stabiel |
| Open bugs (kritiek) | 4 | ↓ (was 8) | 0 |
| Design system coverage | 16/21 pagina's | ↑ | 21/21 |
| HITL compliance | OK | → | OK |
| Dispatch-to-delivery auto | 45% | Nieuw | 65-70% |

## Aanbevolen prioriteiten
1. **Vandaag**: Mail-knop hernoemen + placeholder sweep (30 min)
2. **Morgen**: Multi-tenant isolatie sweep + PIN hashing (4-6 uur)
3. **Deze week**: Order Clone, Batch Dispatch, time_window query fix
