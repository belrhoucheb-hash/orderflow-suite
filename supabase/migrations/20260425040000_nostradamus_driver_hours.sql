-- Nostradamus chauffeururen: opslag van geimporteerde, feitelijk gewerkte uren.
-- Los van driver_hours_per_week, want die view bevat geplande uren uit trips.

ALTER TABLE public.integration_credentials
  DROP CONSTRAINT IF EXISTS integration_credentials_provider_chk;

ALTER TABLE public.integration_credentials
  ADD CONSTRAINT integration_credentials_provider_chk
  CHECK (provider IN ('snelstart', 'exact_online', 'twinfield', 'samsara', 'nostradamus'));

CREATE TABLE IF NOT EXISTS public.driver_external_hours (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL,
  provider             TEXT NOT NULL,
  driver_id            UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  work_date            DATE NOT NULL,
  hours_worked         NUMERIC(8,2) NOT NULL CHECK (hours_worked >= 0),
  external_employee_id TEXT,
  source_payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT driver_external_hours_provider_chk
    CHECK (provider IN ('nostradamus'))
);

CREATE UNIQUE INDEX IF NOT EXISTS driver_external_hours_tenant_provider_driver_date_uniq
  ON public.driver_external_hours (tenant_id, provider, driver_id, work_date);

CREATE INDEX IF NOT EXISTS idx_driver_external_hours_tenant_provider_week
  ON public.driver_external_hours (tenant_id, provider, work_date DESC);

CREATE OR REPLACE FUNCTION public.touch_driver_external_hours_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS driver_external_hours_touch_updated_at ON public.driver_external_hours;
CREATE TRIGGER driver_external_hours_touch_updated_at
  BEFORE UPDATE ON public.driver_external_hours
  FOR EACH ROW EXECUTE FUNCTION public.touch_driver_external_hours_updated_at();

ALTER TABLE public.driver_external_hours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "driver_external_hours: tenant read" ON public.driver_external_hours;
CREATE POLICY "driver_external_hours: tenant read"
  ON public.driver_external_hours
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS "driver_external_hours: service_role full" ON public.driver_external_hours;
CREATE POLICY "driver_external_hours: service_role full"
  ON public.driver_external_hours
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

GRANT SELECT ON public.driver_external_hours TO authenticated;
GRANT ALL ON public.driver_external_hours TO service_role;

CREATE OR REPLACE VIEW public.driver_actual_hours_per_week AS
SELECT
  tenant_id,
  provider,
  driver_id,
  date_trunc('week', work_date)::date AS week_start,
  SUM(hours_worked)                   AS actual_hours
FROM public.driver_external_hours
GROUP BY tenant_id, provider, driver_id, date_trunc('week', work_date)::date;

COMMENT ON VIEW public.driver_actual_hours_per_week IS
  'Feitelijk geimporteerde uren per chauffeur per week uit externe bronnen zoals Nostradamus.';

-- --- ROLLBACK -------------------------------------------------------
-- DROP VIEW IF EXISTS public.driver_actual_hours_per_week;
-- DROP POLICY IF EXISTS "driver_external_hours: service_role full" ON public.driver_external_hours;
-- DROP POLICY IF EXISTS "driver_external_hours: tenant read" ON public.driver_external_hours;
-- DROP TRIGGER IF EXISTS driver_external_hours_touch_updated_at ON public.driver_external_hours;
-- DROP FUNCTION IF EXISTS public.touch_driver_external_hours_updated_at();
-- DROP INDEX IF EXISTS idx_driver_external_hours_tenant_provider_week;
-- DROP INDEX IF EXISTS driver_external_hours_tenant_provider_driver_date_uniq;
-- DROP TABLE IF EXISTS public.driver_external_hours;
