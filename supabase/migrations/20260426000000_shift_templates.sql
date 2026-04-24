-- Sprint 7. Shift-templates (rooster-types) per tenant.
--
-- Waarom:
--   Klanten plannen chauffeurs in dagdelen (Vroeg/Dag/Laat/Hoya/Nacht/...).
--   Die rooster-namen en bijbehorende default start- en eindtijden verschillen
--   per tenant. In plaats van een hardcoded enum, beheert elke tenant zijn
--   eigen lijst roosters via Settings.
--
-- Vorm:
--   name              : bijvoorbeeld 'Vroeg', 'Dag', 'Laat', 'Hoya'
--   default_start_time: default-starttijd voor een chauffeur in dit rooster
--   default_end_time  : default-eindtijd (nullable, bijvoorbeeld als eindtijd
--                       afhankelijk is van ritten)
--   color             : hex-kleur voor UI-weergave in de week- en maandmatrix
--   sort_order        : volgorde waarin roosters getoond worden (oplopend)
--   is_active         : soft-toggle; inactieve templates blijven bewaard voor
--                       historische rooster-rijen maar verschijnen niet in
--                       nieuwe selecties.
--
-- Geen seed: iedere tenant begint leeg en voegt zijn eigen roosters toe.

CREATE TABLE IF NOT EXISTS public.shift_templates (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID        NOT NULL,
  name               TEXT        NOT NULL,
  default_start_time TIME        NOT NULL,
  default_end_time   TIME,
  color              TEXT        NOT NULL DEFAULT '#94a3b8',
  sort_order         INTEGER     NOT NULL DEFAULT 0,
  is_active          BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT shift_templates_name_len_chk CHECK (length(btrim(name)) BETWEEN 1 AND 40),
  CONSTRAINT shift_templates_color_hex_chk CHECK (color ~* '^#[0-9a-f]{6}$'),
  CONSTRAINT shift_templates_unique_name_per_tenant UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_shift_templates_tenant_active
  ON public.shift_templates (tenant_id, sort_order)
  WHERE is_active = TRUE;

COMMENT ON TABLE public.shift_templates IS
  'Per-tenant rooster-types (Vroeg/Dag/Laat/Hoya/...) met default start- en eindtijd. Gebruikt door driver_schedules en drivers.default_shift_template_id.';

-- ─── updated_at trigger ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_shift_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shift_templates_touch_updated_at ON public.shift_templates;
CREATE TRIGGER shift_templates_touch_updated_at
  BEFORE UPDATE ON public.shift_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_shift_templates_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────────
ALTER TABLE public.shift_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Shift templates: tenant select" ON public.shift_templates;
CREATE POLICY "Shift templates: tenant select"
  ON public.shift_templates
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS "Shift templates: tenant insert" ON public.shift_templates;
CREATE POLICY "Shift templates: tenant insert"
  ON public.shift_templates
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS "Shift templates: tenant update" ON public.shift_templates;
CREATE POLICY "Shift templates: tenant update"
  ON public.shift_templates
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS "Shift templates: tenant delete" ON public.shift_templates;
CREATE POLICY "Shift templates: tenant delete"
  ON public.shift_templates
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS "Shift templates: service_role full" ON public.shift_templates;
CREATE POLICY "Shift templates: service_role full"
  ON public.shift_templates
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- ─── ROLLBACK ──────────────────────────────────────────────────────
-- DROP POLICY IF EXISTS "Shift templates: service_role full" ON public.shift_templates;
-- DROP POLICY IF EXISTS "Shift templates: tenant delete" ON public.shift_templates;
-- DROP POLICY IF EXISTS "Shift templates: tenant update" ON public.shift_templates;
-- DROP POLICY IF EXISTS "Shift templates: tenant insert" ON public.shift_templates;
-- DROP POLICY IF EXISTS "Shift templates: tenant select" ON public.shift_templates;
-- DROP TRIGGER IF EXISTS shift_templates_touch_updated_at ON public.shift_templates;
-- DROP FUNCTION IF EXISTS public.touch_shift_templates_updated_at();
-- DROP INDEX IF EXISTS idx_shift_templates_tenant_active;
-- DROP TABLE IF EXISTS public.shift_templates;
