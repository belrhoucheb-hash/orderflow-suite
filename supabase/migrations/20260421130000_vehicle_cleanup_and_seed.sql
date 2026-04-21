-- ══════════════════════════════════════════════════════════════════════════
-- Sprint 4. Voertuig-afmetingen consolideren en seed uitbreiden.
--
-- Afmetingen zitten nu dubbel: op vehicle_types (max_length_cm enzovoort,
-- bron van waarheid) en op vehicles (cargo_length_cm enzovoort, legacy
-- uit sprint 0). De klant wil één bron. We droppen de cargo-kolommen op
-- vehicles zodat er geen drift meer mogelijk is, alle capaciteit komt
-- voortaan uit het gekoppelde voertuigtype.
--
-- Daarnaast uit klantlijst drie default types die ontbraken: Caddy,
-- Koeler klein, Koeler groot. Deze komen beschikbaar voor elke tenant
-- (bestaand en nieuw) via seed_default_vehicle_types.
-- ══════════════════════════════════════════════════════════════════════════

-- ─── Drop legacy cargo-kolommen op vehicles ──────────────────────────
-- Geen productie-code leest deze nog na deze migratie; useFleet,
-- VehicleDetail en de bijbehorende tests worden in dezelfde commit
-- aangepast. Eventuele live data gaat verloren; die waarden zijn
-- toch niet betrouwbaar bijgehouden en overlappen met vehicle_types.
ALTER TABLE public.vehicles
  DROP COLUMN IF EXISTS cargo_length_cm,
  DROP COLUMN IF EXISTS cargo_width_cm,
  DROP COLUMN IF EXISTS cargo_height_cm;

-- ─── Seed-functie uitbreiden met drie nieuwe default types ───────────
CREATE OR REPLACE FUNCTION public.seed_default_vehicle_types(p_tenant_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO public.vehicle_types (
    tenant_id, code, name, sort_order,
    max_length_cm, max_width_cm, max_height_cm, max_weight_kg, max_volume_m3, max_pallets,
    has_tailgate, has_cooling, adr_capable
  ) VALUES
    (p_tenant_id, 'compact',      'Compact bestelvoertuig',  10,
     200, 120, 130,   750,  3.12,  2,   false, false, false),
    (p_tenant_id, 'caddy',        'Caddy',                   15,
     200, 120, 110,   800,  2.64,  2,   false, false, false),
    (p_tenant_id, 'van',          'Bestelbus',               20,
     300, 180, 190,  1500, 10.26,  6,   false, false, false),
    (p_tenant_id, 'koeler-klein', 'Koeler klein',            25,
     300, 170, 180,  1500,  9.18,  4,   false, true,  false),
    (p_tenant_id, 'box-truck',    'Bakwagen met klep',       30,
     650, 240, 240,  8000, 37.44, 16,   true,  false, false),
    (p_tenant_id, 'koeler-groot', 'Koeler groot',            35,
     640, 245, 260,  8000, 40.77, 18,   false, true,  false),
    (p_tenant_id, 'tractor',      'Trekker-oplegger',        40,
     1360, 250, 280, 24000, 95.20, 33,  false, false, false)
  ON CONFLICT (tenant_id, code) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.seed_default_vehicle_types(UUID) IS
  'Idempotent seed van generieke voertuigmatrix per tenant. Bevat sinds sprint 4 ook caddy, koeler-klein en koeler-groot.';

-- ─── Toepassen op alle bestaande tenants ─────────────────────────────
-- ON CONFLICT zorgt dat bestaande rijen ongemoeid blijven, alleen de
-- drie nieuwe codes komen erbij per tenant.
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    PERFORM public.seed_default_vehicle_types(t.id);
  END LOOP;
END $$;

-- ─── ROLLBACK ────────────────────────────────────────────────────────
-- ALTER TABLE public.vehicles
--   ADD COLUMN IF NOT EXISTS cargo_length_cm integer,
--   ADD COLUMN IF NOT EXISTS cargo_width_cm  integer,
--   ADD COLUMN IF NOT EXISTS cargo_height_cm integer;
-- DELETE FROM public.vehicle_types
--   WHERE code IN ('caddy','koeler-klein','koeler-groot');
-- Let op: rollback van de seed-functie naar de sprint-2 versie vereist
-- de eerdere definitie uit 20260419000500_seed_defaults.sql opnieuw
-- uitvoeren.
