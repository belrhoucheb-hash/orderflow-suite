-- ══════════════════════════════════════════════════════════════════════════
-- Sprint 4. Certificeringen voor chauffeurs als master-data.
--
-- Tot nu toe zat de lijst hard-coded in NewDriverDialog (ADR, Koeling,
-- Laadklep, Internationaal, Douane, Boxen, Hoya, Bakbus, DAF). Elke
-- wijziging kostte een code-deploy. Deze migratie zet de lijst als
-- echte master-data neer (analoog aan vehicle_types), zodat admins zelf
-- certificeringen kunnen beheren vanuit de Chauffeurs-pagina.
--
-- Daarnaast migreren we de bestaande drivers.certifications[] arrays
-- van labels naar codes, zodat de UI en filters op één set waarden
-- draaien (de codes).
-- ══════════════════════════════════════════════════════════════════════════

-- ─── Tabel ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.driver_certifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  sort_order  INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_driver_certifications_tenant
  ON public.driver_certifications (tenant_id);

COMMENT ON TABLE public.driver_certifications IS
  'Master-data: beschikbare certificeringen per tenant voor chauffeurs. drivers.certifications[] bevat de codes hieruit.';

-- ─── Trigger voor updated_at ─────────────────────────────────────────
DROP TRIGGER IF EXISTS update_driver_certifications_updated_at ON public.driver_certifications;
CREATE TRIGGER update_driver_certifications_updated_at
  BEFORE UPDATE ON public.driver_certifications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ─── RLS ─────────────────────────────────────────────────────────────
ALTER TABLE public.driver_certifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation: driver_certifications SELECT" ON public.driver_certifications;
CREATE POLICY "Tenant isolation: driver_certifications SELECT"
  ON public.driver_certifications
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS "Tenant isolation: driver_certifications INSERT" ON public.driver_certifications;
CREATE POLICY "Tenant isolation: driver_certifications INSERT"
  ON public.driver_certifications
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS "Tenant isolation: driver_certifications UPDATE" ON public.driver_certifications;
CREATE POLICY "Tenant isolation: driver_certifications UPDATE"
  ON public.driver_certifications
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS "Tenant isolation: driver_certifications DELETE" ON public.driver_certifications;
CREATE POLICY "Tenant isolation: driver_certifications DELETE"
  ON public.driver_certifications
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS "Service role: driver_certifications" ON public.driver_certifications;
CREATE POLICY "Service role: driver_certifications"
  ON public.driver_certifications
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

GRANT ALL ON TABLE public.driver_certifications TO anon;
GRANT ALL ON TABLE public.driver_certifications TO authenticated;
GRANT ALL ON TABLE public.driver_certifications TO service_role;

-- ─── Seed-functie ────────────────────────────────────────────────────
-- Volgorde gelijk aan de oude CERTIFICATION_OPTIONS array, zodat de
-- UI er visueel identiek uitziet voor bestaande klanten.
CREATE OR REPLACE FUNCTION public.seed_default_driver_certifications(p_tenant_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO public.driver_certifications (tenant_id, code, name, sort_order) VALUES
    (p_tenant_id, 'adr',             'ADR',             10),
    (p_tenant_id, 'koeling',         'Koeling',         20),
    (p_tenant_id, 'laadklep',        'Laadklep',        30),
    (p_tenant_id, 'internationaal',  'Internationaal',  40),
    (p_tenant_id, 'douane',          'Douane',          50),
    (p_tenant_id, 'boxen',           'Boxen',           60),
    (p_tenant_id, 'hoya',            'Hoya',            70),
    (p_tenant_id, 'bakbus',          'Bakbus',          80),
    (p_tenant_id, 'daf',             'DAF',             90)
  ON CONFLICT (tenant_id, code) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.seed_default_driver_certifications(UUID) IS
  'Idempotente seed van de negen default chauffeur-certificeringen per tenant.';

-- ─── Toepassen op alle bestaande tenants ─────────────────────────────
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    PERFORM public.seed_default_driver_certifications(t.id);
  END LOOP;
END $$;

-- ─── Bestaande drivers.certifications[] migreren naar codes ──────────
-- De negen bekende labels worden omgezet naar hun lowercase code, zodat
-- bestaande chauffeur-rijen na deze migratie blijven matchen met de
-- gezaaide master-data. Onbekende waardes laten we staan (handmatige
-- custom labels); de admin kan die naar keuze opschonen vanuit de UI.
UPDATE public.drivers
SET certifications = array_replace(certifications, 'ADR',            'adr')
WHERE 'ADR' = ANY(certifications);

UPDATE public.drivers
SET certifications = array_replace(certifications, 'Koeling',        'koeling')
WHERE 'Koeling' = ANY(certifications);

UPDATE public.drivers
SET certifications = array_replace(certifications, 'Laadklep',       'laadklep')
WHERE 'Laadklep' = ANY(certifications);

UPDATE public.drivers
SET certifications = array_replace(certifications, 'Internationaal', 'internationaal')
WHERE 'Internationaal' = ANY(certifications);

UPDATE public.drivers
SET certifications = array_replace(certifications, 'Douane',         'douane')
WHERE 'Douane' = ANY(certifications);

UPDATE public.drivers
SET certifications = array_replace(certifications, 'Boxen',          'boxen')
WHERE 'Boxen' = ANY(certifications);

UPDATE public.drivers
SET certifications = array_replace(certifications, 'Hoya',           'hoya')
WHERE 'Hoya' = ANY(certifications);

UPDATE public.drivers
SET certifications = array_replace(certifications, 'Bakbus',         'bakbus')
WHERE 'Bakbus' = ANY(certifications);

UPDATE public.drivers
SET certifications = array_replace(certifications, 'DAF',            'daf')
WHERE 'DAF' = ANY(certifications);

-- ─── ROLLBACK ────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.seed_default_driver_certifications(UUID);
-- DROP TABLE IF EXISTS public.driver_certifications;
-- Let op: de UPDATE-statements die labels naar codes migreren zijn niet
-- automatisch omkeerbaar. Een terugkeer naar labels vereist een
-- inverse array_replace per code, in dezelfde volgorde maar omgedraaid.
