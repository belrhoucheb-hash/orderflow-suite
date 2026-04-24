-- Sprint 7. Driver schedules, per chauffeur per dag.
--
-- Doel:
--   Chauffeurs kunnen ingepland worden per dag, onafhankelijk van orders.
--   Eén rij per (tenant, chauffeur, datum) geeft aan wélk rooster, welke
--   starttijd, welk voertuig en wat de status is (werkt/vrij/ziek/verlof).
--   De order-planning in Planning.tsx leest dit als prefill voor chauffeur-
--   en voertuig-toewijzing.
--
-- Velden:
--   shift_template_id : verwijzing naar shift_templates (Vroeg/Dag/...).
--                        Mag NULL zijn voor ad-hoc dagen zonder template.
--   start_time        : override van template-default. NULL = gebruik
--                        default_start_time van de template.
--   end_time          : idem voor eindtijd.
--   vehicle_id        : voertuig dat de chauffeur rijdt die dag. NULL als
--                        er nog niets toegewezen is (of bij status != werkt).
--   status            : werkt / vrij / ziek / verlof / feestdag.
--   notitie           : vrije tekst (bijv. "halve dag, middagpauze tot 13:00").
--
-- Uniekheid: één rij per (tenant, driver, date). Nachtdiensten lossen we
-- op via end_time < start_time (logische interpretatie: eindtijd op volgende
-- dag), niet via twee rijen. Dat houdt de matrix-weergave simpel.

CREATE TABLE IF NOT EXISTS public.driver_schedules (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID        NOT NULL,
  driver_id          UUID        NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  date               DATE        NOT NULL,
  shift_template_id  UUID        REFERENCES public.shift_templates(id) ON DELETE SET NULL,
  start_time         TIME,
  end_time           TIME,
  vehicle_id         UUID        REFERENCES public.vehicles(id) ON DELETE SET NULL,
  status             TEXT        NOT NULL DEFAULT 'werkt',
  notitie            TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by         UUID,
  CONSTRAINT driver_schedules_status_chk
    CHECK (status IN ('werkt', 'vrij', 'ziek', 'verlof', 'feestdag')),
  CONSTRAINT driver_schedules_notitie_len_chk
    CHECK (notitie IS NULL OR length(notitie) <= 500),
  CONSTRAINT driver_schedules_unique_per_day
    UNIQUE (tenant_id, driver_id, date)
);

CREATE INDEX IF NOT EXISTS idx_driver_schedules_tenant_date
  ON public.driver_schedules (tenant_id, date);

CREATE INDEX IF NOT EXISTS idx_driver_schedules_tenant_vehicle_date
  ON public.driver_schedules (tenant_id, vehicle_id, date)
  WHERE vehicle_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_driver_schedules_driver_date
  ON public.driver_schedules (driver_id, date);

COMMENT ON TABLE public.driver_schedules IS
  'Rooster-rij per (tenant, chauffeur, datum). Bron van waarheid voor wie wanneer werkt met welk voertuig. Door Planning-pagina gebruikt als prefill voor PlanningVehicleCard.';

COMMENT ON COLUMN public.driver_schedules.status IS
  'werkt|vrij|ziek|verlof|feestdag. Bij status != werkt mogen start_time, end_time, vehicle_id leeg zijn.';

COMMENT ON COLUMN public.driver_schedules.start_time IS
  'Override van shift_templates.default_start_time. NULL = gebruik template-default.';

-- ─── updated_at trigger ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_driver_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS driver_schedules_touch_updated_at ON public.driver_schedules;
CREATE TRIGGER driver_schedules_touch_updated_at
  BEFORE UPDATE ON public.driver_schedules
  FOR EACH ROW EXECUTE FUNCTION public.touch_driver_schedules_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────────
ALTER TABLE public.driver_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Driver schedules: tenant select" ON public.driver_schedules;
CREATE POLICY "Driver schedules: tenant select"
  ON public.driver_schedules
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS "Driver schedules: tenant insert" ON public.driver_schedules;
CREATE POLICY "Driver schedules: tenant insert"
  ON public.driver_schedules
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS "Driver schedules: tenant update" ON public.driver_schedules;
CREATE POLICY "Driver schedules: tenant update"
  ON public.driver_schedules
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS "Driver schedules: tenant delete" ON public.driver_schedules;
CREATE POLICY "Driver schedules: tenant delete"
  ON public.driver_schedules
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS "Driver schedules: service_role full" ON public.driver_schedules;
CREATE POLICY "Driver schedules: service_role full"
  ON public.driver_schedules
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- ─── ROLLBACK ──────────────────────────────────────────────────────
-- DROP POLICY IF EXISTS "Driver schedules: service_role full" ON public.driver_schedules;
-- DROP POLICY IF EXISTS "Driver schedules: tenant delete" ON public.driver_schedules;
-- DROP POLICY IF EXISTS "Driver schedules: tenant update" ON public.driver_schedules;
-- DROP POLICY IF EXISTS "Driver schedules: tenant insert" ON public.driver_schedules;
-- DROP POLICY IF EXISTS "Driver schedules: tenant select" ON public.driver_schedules;
-- DROP TRIGGER IF EXISTS driver_schedules_touch_updated_at ON public.driver_schedules;
-- DROP FUNCTION IF EXISTS public.touch_driver_schedules_updated_at();
-- DROP INDEX IF EXISTS idx_driver_schedules_driver_date;
-- DROP INDEX IF EXISTS idx_driver_schedules_tenant_vehicle_date;
-- DROP INDEX IF EXISTS idx_driver_schedules_tenant_date;
-- DROP TABLE IF EXISTS public.driver_schedules;
