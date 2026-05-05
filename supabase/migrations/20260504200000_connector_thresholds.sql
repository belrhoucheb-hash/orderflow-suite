-- Connector-thresholds: per-tenant en per-provider alarmgrenzen voor de
-- monitoring-laag (Marketplace fase 4). Tenant-bound, RLS via tenant_members.

CREATE TABLE IF NOT EXISTS public.connector_thresholds (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID         NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider        TEXT         NOT NULL,
  max_failures    INTEGER      NOT NULL DEFAULT 5  CHECK (max_failures BETWEEN 1 AND 1000),
  window_minutes  INTEGER      NOT NULL DEFAULT 5  CHECK (window_minutes BETWEEN 1 AND 1440),
  max_latency_ms  INTEGER      NOT NULL DEFAULT 1500 CHECK (max_latency_ms BETWEEN 100 AND 600000),
  notify_planner  BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT connector_thresholds_uniq UNIQUE (tenant_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_connector_thresholds_tenant
  ON public.connector_thresholds (tenant_id);

COMMENT ON TABLE public.connector_thresholds IS
  'Per-tenant alarmgrenzen voor connectoren: max failures per venster en max latency.';

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_connector_thresholds_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS connector_thresholds_touch_updated_at ON public.connector_thresholds;
CREATE TRIGGER connector_thresholds_touch_updated_at
  BEFORE UPDATE ON public.connector_thresholds
  FOR EACH ROW EXECUTE FUNCTION public.touch_connector_thresholds_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────────
ALTER TABLE public.connector_thresholds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "connector_thresholds: tenant member select" ON public.connector_thresholds;
CREATE POLICY "connector_thresholds: tenant member select"
  ON public.connector_thresholds
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = connector_thresholds.tenant_id
    )
  );

DROP POLICY IF EXISTS "connector_thresholds: tenant admin insert" ON public.connector_thresholds;
CREATE POLICY "connector_thresholds: tenant admin insert"
  ON public.connector_thresholds
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = connector_thresholds.tenant_id
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'planner'::text])
    )
  );

DROP POLICY IF EXISTS "connector_thresholds: tenant admin update" ON public.connector_thresholds;
CREATE POLICY "connector_thresholds: tenant admin update"
  ON public.connector_thresholds
  FOR UPDATE TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = connector_thresholds.tenant_id
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'planner'::text])
    )
  );

DROP POLICY IF EXISTS "connector_thresholds: service_role full" ON public.connector_thresholds;
CREATE POLICY "connector_thresholds: service_role full"
  ON public.connector_thresholds
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

GRANT SELECT, INSERT, UPDATE ON public.connector_thresholds TO authenticated;
GRANT ALL ON public.connector_thresholds TO service_role;

-- --- ROLLBACK -------------------------------------------------------
-- DROP POLICY IF EXISTS "connector_thresholds: service_role full" ON public.connector_thresholds;
-- DROP POLICY IF EXISTS "connector_thresholds: tenant admin update" ON public.connector_thresholds;
-- DROP POLICY IF EXISTS "connector_thresholds: tenant admin insert" ON public.connector_thresholds;
-- DROP POLICY IF EXISTS "connector_thresholds: tenant member select" ON public.connector_thresholds;
-- DROP TRIGGER IF EXISTS connector_thresholds_touch_updated_at ON public.connector_thresholds;
-- DROP FUNCTION IF EXISTS public.touch_connector_thresholds_updated_at();
-- DROP INDEX IF EXISTS idx_connector_thresholds_tenant;
-- DROP TABLE IF EXISTS public.connector_thresholds;
