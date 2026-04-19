-- ──────────────────────────────────────────────────────────────────────────
-- Sprint 2. Seed-functies voor default voertuigtypen en toeslagen.
--
-- Generiek, geen merknamen. Elke tenant krijgt dezelfde basis-set; aanpassen
-- in stamgegevens blijft mogelijk. Idempotent via ON CONFLICT DO NOTHING op
-- unique (tenant_id, code) en (tenant_id, name).
--
-- Wordt aangeroepen voor alle bestaande tenants onderaan deze migratie en
-- bij elke toekomstige tenant via de onboarding-flow (buiten scope Sprint 2).
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.seed_default_vehicle_types(p_tenant_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO public.vehicle_types (
    tenant_id, code, name, sort_order,
    max_length_cm, max_width_cm, max_height_cm, max_weight_kg, max_volume_m3, max_pallets,
    has_tailgate, has_cooling, adr_capable
  ) VALUES
    (p_tenant_id, 'compact',   'Compact bestelvoertuig', 10,
     200, 120, 130, 750, 3.12, 2,   false, false, false),
    (p_tenant_id, 'van',       'Bestelbus',              20,
     300, 180, 190, 1500, 10.26, 6, false, false, false),
    (p_tenant_id, 'box-truck', 'Bakwagen met klep',      30,
     650, 240, 240, 8000, 37.44, 16, true,  false, false),
    (p_tenant_id, 'tractor',   'Trekker-oplegger',       40,
     1360, 250, 280, 24000, 95.2, 33, false, false, false)
  ON CONFLICT (tenant_id, code) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.seed_default_vehicle_types(UUID) IS
  'Idempotent seed van generieke voertuigmatrix per tenant. Tenant past aan naar eigen vloot.';

-- ─── Surcharges seed ─────────────────────────────────────────
-- Unique nodig voor ON CONFLICT. Bestaande surcharges-tabel heeft geen
-- unique op (tenant_id, name), dus partial unique toevoegen.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_surcharges_tenant_name
  ON public.surcharges (tenant_id, name);

CREATE OR REPLACE FUNCTION public.seed_default_surcharges(p_tenant_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO public.surcharges (
    tenant_id, name, surcharge_type, amount, applies_to,
    time_from, time_to, day_type, sort_order, is_active
  ) VALUES
    (p_tenant_id, 'Ochtendtoeslag',   'PERCENTAGE', 0, '{}'::jsonb,
     '00:00', '08:00', 'any',      10, false),
    (p_tenant_id, 'Avondtoeslag',     'PERCENTAGE', 0, '{}'::jsonb,
     '18:00', '22:00', 'any',      20, false),
    (p_tenant_id, 'Nachttoeslag',     'PERCENTAGE', 0, '{}'::jsonb,
     '22:00', '06:00', 'any',      30, false),
    (p_tenant_id, 'Zaterdagtoeslag',  'PERCENTAGE', 0, '{}'::jsonb,
     NULL,   NULL,    'saturday', 40, false),
    (p_tenant_id, 'Zondagtoeslag',    'PERCENTAGE', 0, '{}'::jsonb,
     NULL,   NULL,    'sunday',   50, false),
    (p_tenant_id, 'Feestdagtoeslag',  'PERCENTAGE', 0, '{}'::jsonb,
     NULL,   NULL,    'holiday',  60, false)
  ON CONFLICT (tenant_id, name) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.seed_default_surcharges(UUID) IS
  'Structuur-seed: zes toeslag-rijen per tenant op 0% en inactief. Tenant activeert en vult bedragen.';

-- ─── Aanroep voor alle bestaande tenants ─────────────────────
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    PERFORM public.seed_default_vehicle_types(t.id);
    PERFORM public.seed_default_surcharges(t.id);
  END LOOP;
END $$;

-- Zet tenant_settings.pricing.engine_enabled = false voor elke tenant die nog
-- geen rij heeft. Default-uit, conform feature-flag strategie.
INSERT INTO public.tenant_settings (tenant_id, category, settings)
SELECT id, 'pricing', '{"engine_enabled": false}'::jsonb
FROM public.tenants
ON CONFLICT (tenant_id, category) DO NOTHING;

GRANT EXECUTE ON FUNCTION public.seed_default_vehicle_types(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_default_surcharges(UUID)    TO service_role;

-- ─── ROLLBACK ─────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.seed_default_surcharges(UUID);
-- DROP FUNCTION IF EXISTS public.seed_default_vehicle_types(UUID);
-- DROP INDEX IF EXISTS public.uniq_surcharges_tenant_name;
