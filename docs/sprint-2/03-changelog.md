# Sprint 2, Fase 3, Changelog

Opgeleverd 2026-04-19. Sprint 2 is **volledig afgerond**. Dit document legt vast wat er is gebouwd, welke beslissingen genomen zijn, welke schulden zijn achtergelaten voor Sprint 3 en verder.

## Scope-samenvatting

Sprint 2 zette de tariefmotor op, integreerde die met de NewOrder Financieel-tab, en maakte het voertuigtype-beheer tenant-generiek. Royalty Cargo draait nu volledig op de motor, oude hardcoded matrix is weg.

## Wat er leeft

### Datamodel

| Migratie | Inhoud |
|---|---|
| `20260419000000_baseline.sql` | Dump van remote public-schema, vervangt alle oude migraties als startpunt. Oude migraties staan in `supabase/migrations_archive/`. |
| `20260419000050_vehicle_types_extend.sql` | `max_length_cm`, `max_width_cm`, `max_height_cm`, `max_weight_kg`, `max_volume_m3`, `max_pallets`, `has_tailgate`, `has_cooling`, `adr_capable`, `updated_at` op `vehicle_types`. |
| `20260419000100_tenant_settings.sql` | Tabel voor per-tenant feature-flags en config (pricing.engine_enabled). |
| `20260419000200_order_charges.sql` | Add-on kosten (wachturen, tol, correcties) per order. |
| `20260419000300_surcharges_time_windows.sql` | `time_from`, `time_to`, `day_type`, `sort_order` op `surcharges`. |
| `20260419000400_pricing_engine_helper.sql` | `is_pricing_engine_enabled(tenant_id)`, `can_enable_pricing(tenant_id)`. |
| `20260419000500_seed_defaults.sql` | `seed_default_vehicle_types(tenant)`, `seed_default_surcharges(tenant)`, aangeroepen voor elke bestaande tenant. |
| `20260419010000_royalty_cargo_seed.sql` | Royalty Cargo voertuigen (7), rate_card (1), rate_rules (23), surcharge-percentages geüpdatet. |
| `20260419020000_orders_vehicle_type_and_dates.sql` | `orders.vehicle_type_id`, `pickup_date`, `delivery_date`, 4 time-window-kolommen, 3 indexen. |

Remote-sync gebeurde via `scripts/remote_sync_sprint2.sql` (bundled script voor SQL editor, omdat `supabase db push` faalde op migration-history drift).

### Engine

Locatie: `supabase/functions/_shared/pricingEngine.ts` en `rateModels.ts` (canoniek), frontend importeert via shims in `src/lib/pricingEngine.ts` en `src/types/rateModels.ts`.

- `calculateOrderPrice(order, rateCard, surcharges)` pure functie, afrondingsbeleid R31.
- `matchesVehicleType`, `matchesTransportType` bestonden al.
- **Nieuw**: `matchesDieselToggle` filtert PER_KM rules op `conditions.diesel_included` mits de caller de toggle levert.
- **Nieuw**: `matchesOptionalPurpose` skipt rules met `conditions.optional=true` tenzij het purpose door de caller is opgevraagd (bijv. screening).
- 28 + 5 = 33 unit-tests groen in `src/__tests__/pricingEngine.test.ts` en `src/test/pricingEngineConfidence.test.ts`.

### Edge functions

- `calculate-order-price/index.ts`: bestaand, gedeployed met nieuwe engine-versie.
- `preview-order-price/index.ts`: **nieuw**. Neemt directe input (vehicle_type_id, distance_km, toggles), leest rate_cards + surcharges tenant-scoped, persist niets. Gebruikt door frontend voor live preview in NewOrder.

### Frontend

| Bestand | Mutatie |
|---|---|
| `src/hooks/useOrderPrice.ts` | Nieuw. Debounced 300ms, React Query cache 5s, invoked preview-order-price. |
| `src/hooks/useVehicleTypes.ts` | Nieuw. Laadt vehicle_types voor tenant. |
| `src/components/orders/FinancialTab.tsx` | Nieuw. Volledige Financieel-tab extractie uit NewOrder, rekent via engine, toont flag-off melding en override-pad. |
| `src/components/settings/VehicleTypeDialog.tsx` | Nieuw. Dialog met alle 7 sprint-2 velden + edit-knop. |
| `src/components/settings/MasterDataSection.tsx` | Inline add-row vervangen door dialog-trigger, tabel uitgebreid met afmetingen/gewicht/opties, edit-knop per rij. |
| `src/pages/NewOrder.tsx` | `VEHICLE_MATRIX`, `KM_BASIS`, `PERCENTAGE_TOESLAGEN`, `VASTE_TOESLAGEN` constanten verwijderd. Pricing useMemo weg. Financieel-tab render nu `<FinancialTab />`. State gereduceerd tot `pricingPayload` voor save. |

## Beslissingen

| # | Beslissing | Reden |
|---|---|---|
| B1 | Baseline-dump als startpunt, oude migraties archiveren | Lokale migratiehistorie met 12x `20260402_*` collision was niet meer te repareren zonder dataverlies-risico. Schone snit is veiliger. |
| B2 | Engine rekent, UI toont | Eén plek voor prijs-logica, audit trail consistent. |
| B3 | Feature-flag `tenant_settings.pricing.engine_enabled` | Royalty Cargo cutover los van andere tenants, nul-downtime. |
| B4 | Royalty Cargo matrix als eenmalige SQL-seed naar `rate_cards` / `vehicle_types` | Sneller dan wachten tot stamgegevens-form af is. 1-op-1 zelfde prijzen als hardcoded. |
| B5 | Diesel-toggle via `conditions.diesel_included`, screening via `conditions.optional` | Generieke toggles zonder engine-code voor Royalty-Cargo-specifieke concepten. |
| B6 | FinancialTab als apart component in plaats van in-plaats refactor | Kleinere diff, scope afbakenen, makkelijker onderhoudbaar. |
| B7 | Dialog in plaats van inline-row voor voertuigtype-form | 7 nieuwe velden pasten niet in de smalle table-row. |

## Ingeluide schulden

- **D1. `orders.vehicle_type_id` wordt nog niet gevuld.** Engine kiest het voertuigtype, maar schrijft het alleen in `shipments.pricing` JSONB snapshot. Voor Sprint 3 CP-04 is invullen op `orders` nodig, anders skipt auto-plan met reason-tag. Oplossing klein: Edge Function `calculate-order-price` ook naar `orders.vehicle_type_id` laten schrijven.
- **D2. `default_capacity_kg` en `max_weight_kg` worden beide gebruikt.** UI-upsert spiegelt `max_weight_kg` naar `default_capacity_kg` voor backwards-compat. Consumenten (fleet-selectie, capacity-check) lezen nog de oude kolom. Uitfaseren in later sprint.
- **D3. `migrations_archive/`** bevat 106 bestanden die niet meer draaien. Ooit opruimen na stable-state op alle tenants.
- **D4. Oude voertuigtypen van Royalty Cargo** (busje, bakwagen, koelwagen, etc. uit pre-sprint-2) staan nog in `vehicle_types` met `max_weight_kg=NULL`. Actie voor Badr: via de nieuwe dialog afmetingen aanvullen of `is_active=false` zetten om ze te deactiveren. Anders blijven ze in de dropdown verschijnen.
- **D5. Supabase `types.ts` is niet hergegenereerd** na de schema-wijzigingen. Daarom de `as unknown as VehicleType[]` casts in hooks. Oplossen met `supabase gen types typescript` wanneer handig.
- **D6. CI op main staat al sinds 2026-04-17 op rood.** Niet veroorzaakt door sprint-2 werk (geverifieerd door terug te rollen naar pre-commit staat, zelfde 14 failures). Oorzaken: niet-gemockte `useTenantOptional`/`useWarehouses` in `dashboard-chauffeur-settings.test.tsx`, queries die `undefined` terugsturen (warning als error), i18n-translation-file keys niet in sync tussen NL/EN/DE/FR, ChauffeurApp POD-sync test-mock. Apart refactor-traject, niet blokkerend voor sprint-3 want build + pricing-tests slagen.

## Commits van deze sprint

```
711369f sprint-2(db): orders.vehicle_type_id plus pickup/delivery datum en tijdvensters
e0261af sprint-2(ui): voertuigtype-form met afmetingen, gewicht en opties
3ae14a9 sprint-2(ui): Financieel-tab van hardcoded matrix naar engine
dbe826f sprint-2(engine): preview-order-price endpoint plus client-hooks
bc0c584 sprint-2(engine): diesel-match en optional-purpose skip in motor
4434087 sprint-2(db): seed Royalty Cargo naar tariefmotor
2d517e7 sprint-2(db): baseline + ontbrekende pricing-engine migraties
```

Plus voorbereidend werk uit eerdere commits:

```
eb987c2 sprint-2(engine): fix Edge Function schema-mismatch
7a34ddb sprint-2(engine): calculate-order-price Edge Function
d08b856 sprint-2(docs): onderzoek, plan en 34 risico-mitigaties
4c9eaed sprint-2(engine): motor verhuist naar supabase/functions/_shared
f539f85 sprint-2(db): seed defaults voor tariefmotor
96d6def sprint-2(db): datamodel voor tariefmotor
```

## Definitie van klaar

- [x] Datamodel op remote in sync met code
- [x] Edge functions gedeployed: `calculate-order-price`, `preview-order-price`
- [x] Royalty Cargo draait op engine (engine_enabled=true, prijzen identiek aan oude matrix)
- [x] Alle 33 unit-tests groen
- [x] Vite build slaagt
- [x] Tariefmotor-feature-flag werkt per tenant
- [x] Voertuigtype-form uitgebreid met afmetingen en opties voor elke tenant
- [x] Pre-flight voor Sprint 3 gedaan (orders extra kolommen)

## Vooruitblik

Sprint 3 (planbord-upgrade, auto-plan, dagsetup, contracturen) kan starten zonder datamodel-blockers. Zie `docs/sprint-3/02-plan.md`. §0.1 en §1.2 zijn bijgewerkt om te reflecteren dat de orders-kolommen nu al klaarstaan.
