-- ═══════════════════════════════════════════════════════════════════════════
-- REMOTE SYNC SPRINT 2, alles-in-1 script
--
-- Plak het geheel in de Supabase SQL Editor en voer uit. Bij een fout
-- rollt alles terug dankzij BEGIN/COMMIT.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. vehicle_types uitbreiden naar volle prijs-schema ───────────────────

ALTER TABLE public.vehicle_types
  ADD COLUMN IF NOT EXISTS max_length_cm  INTEGER,
  ADD COLUMN IF NOT EXISTS max_width_cm   INTEGER,
  ADD COLUMN IF NOT EXISTS max_height_cm  INTEGER,
  ADD COLUMN IF NOT EXISTS max_weight_kg  INTEGER,
  ADD COLUMN IF NOT EXISTS max_volume_m3  NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS max_pallets    INTEGER,
  ADD COLUMN IF NOT EXISTS has_tailgate   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_cooling    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS adr_capable    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS update_vehicle_types_updated_at ON public.vehicle_types;
CREATE TRIGGER update_vehicle_types_updated_at
  BEFORE UPDATE ON public.vehicle_types
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ─── 2. tenant_settings tabel ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tenant_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  category text NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, category)
);

ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON public.tenant_settings;
CREATE POLICY "tenant_isolation" ON public.tenant_settings
  FOR ALL USING (
    tenant_id = COALESCE(
      (auth.jwt()->'app_metadata'->>'tenant_id')::uuid,
      (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() LIMIT 1)
    )
  );

-- ─── 3. order_charges tabel + RLS ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.order_charges (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id            UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  charge_type         TEXT NOT NULL CHECK (charge_type IN
                        ('waiting','toll','extra_stop','correction','manual','other')),
  description         TEXT NOT NULL,
  source_description  TEXT,
  quantity            NUMERIC(10,3),
  unit                TEXT,
  unit_price_cents    INTEGER,
  amount_cents        INTEGER NOT NULL,
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_charges_order ON public.order_charges(order_id);
CREATE INDEX IF NOT EXISTS idx_order_charges_tenant_type
  ON public.order_charges(tenant_id, charge_type, created_at DESC);

ALTER TABLE public.order_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_charges_tenant_select" ON public.order_charges;
CREATE POLICY "order_charges_tenant_select" ON public.order_charges
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS "order_charges_tenant_insert" ON public.order_charges;
CREATE POLICY "order_charges_tenant_insert" ON public.order_charges
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS "order_charges_tenant_update" ON public.order_charges;
CREATE POLICY "order_charges_tenant_update" ON public.order_charges
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS "order_charges_tenant_delete" ON public.order_charges;
CREATE POLICY "order_charges_tenant_delete" ON public.order_charges
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS "order_charges_service_role" ON public.order_charges;
CREATE POLICY "order_charges_service_role" ON public.order_charges
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─── 4. surcharges tijdvensters ────────────────────────────────────────────

ALTER TABLE public.surcharges
  ADD COLUMN IF NOT EXISTS time_from TIME,
  ADD COLUMN IF NOT EXISTS time_to   TIME,
  ADD COLUMN IF NOT EXISTS day_type  TEXT
    CHECK (day_type IN ('weekday','saturday','sunday','holiday','any'))
    DEFAULT 'any',
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- ─── 5. helper-functies ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_pricing_engine_enabled(p_tenant_id UUID)
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT (settings->>'engine_enabled')::boolean
     FROM public.tenant_settings
     WHERE tenant_id = p_tenant_id AND category = 'pricing'
     LIMIT 1),
    false
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.can_enable_pricing(p_tenant_id UUID)
RETURNS TABLE (
  can_enable          BOOLEAN,
  has_vehicle_types   BOOLEAN,
  has_rate_cards      BOOLEAN,
  reason              TEXT
) AS $$
DECLARE
  v_vt_count INTEGER;
  v_rc_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_vt_count
    FROM public.vehicle_types
    WHERE tenant_id = p_tenant_id AND is_active = true;

  SELECT COUNT(*) INTO v_rc_count
    FROM public.rate_cards
    WHERE tenant_id = p_tenant_id AND is_active = true;

  has_vehicle_types := v_vt_count > 0;
  has_rate_cards    := v_rc_count > 0;
  can_enable        := has_vehicle_types AND has_rate_cards;

  IF can_enable THEN
    reason := 'ok';
  ELSIF NOT has_vehicle_types AND NOT has_rate_cards THEN
    reason := 'Voeg eerst voertuigtypen en minstens een tariefkaart toe.';
  ELSIF NOT has_vehicle_types THEN
    reason := 'Voeg eerst voertuigtypen toe in Stamgegevens.';
  ELSE
    reason := 'Voeg eerst een tariefkaart toe voor minstens een klant.';
  END IF;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.is_pricing_engine_enabled(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_enable_pricing(UUID)        TO authenticated, service_role;

-- ─── 6. seed-functies en data ──────────────────────────────────────────────

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

DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    PERFORM public.seed_default_vehicle_types(t.id);
    PERFORM public.seed_default_surcharges(t.id);
  END LOOP;
END $$;

INSERT INTO public.tenant_settings (tenant_id, category, settings)
SELECT id, 'pricing', '{"engine_enabled": false}'::jsonb
FROM public.tenants
ON CONFLICT (tenant_id, category) DO NOTHING;

GRANT EXECUTE ON FUNCTION public.seed_default_vehicle_types(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_default_surcharges(UUID)    TO service_role;

-- ─── 7. migration history bijwerken ────────────────────────────────────────

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES
  ('20260419000050', 'vehicle_types_extend'),
  ('20260419000100', 'tenant_settings'),
  ('20260419000200', 'order_charges'),
  ('20260419000300', 'surcharges_time_windows'),
  ('20260419000400', 'pricing_engine_helper'),
  ('20260419000500', 'seed_defaults')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Verificatie, draai los na COMMIT
-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname='public'
--   AND tablename IN ('order_charges','tenant_settings','surcharges','vehicle_types');
--
-- SELECT proname FROM pg_proc
-- WHERE proname IN ('is_pricing_engine_enabled','can_enable_pricing',
--                   'seed_default_vehicle_types','seed_default_surcharges');
--
-- SELECT COUNT(*) AS vehicle_types_seeded FROM public.vehicle_types;
-- SELECT COUNT(*) AS surcharges_seeded FROM public.surcharges;
