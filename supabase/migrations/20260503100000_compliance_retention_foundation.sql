-- Compliance Sprint: central retention foundation.
--
-- This migration adds the governance layer around existing prune functions:
-- policies, legal holds, run logging and a service-role runner.

CREATE TABLE IF NOT EXISTS public.data_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  domain TEXT NOT NULL,
  table_name TEXT NOT NULL,
  description TEXT,
  retention_days INTEGER NOT NULL,
  archive_after_days INTEGER,
  legal_basis TEXT,
  is_fiscal_record BOOLEAN NOT NULL DEFAULT false,
  requires_legal_hold_check BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  CONSTRAINT data_retention_policies_retention_chk CHECK (retention_days > 0),
  CONSTRAINT data_retention_policies_archive_chk CHECK (
    archive_after_days IS NULL OR archive_after_days > 0
  )
);

CREATE INDEX IF NOT EXISTS idx_data_retention_policies_tenant
  ON public.data_retention_policies (tenant_id, is_active, domain);

DROP TRIGGER IF EXISTS update_data_retention_policies_updated_at ON public.data_retention_policies;
CREATE TRIGGER update_data_retention_policies_updated_at
  BEFORE UPDATE ON public.data_retention_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.data_retention_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "data_retention_policies tenant read" ON public.data_retention_policies;
CREATE POLICY "data_retention_policies tenant read"
  ON public.data_retention_policies
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS "data_retention_policies tenant admin write" ON public.data_retention_policies;
CREATE POLICY "data_retention_policies tenant admin write"
  ON public.data_retention_policies
  FOR ALL TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = data_retention_policies.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  )
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = data_retention_policies.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "data_retention_policies service role" ON public.data_retention_policies;
CREATE POLICY "data_retention_policies service role"
  ON public.data_retention_policies
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON public.data_retention_policies TO authenticated;
GRANT ALL ON public.data_retention_policies TO service_role;

COMMENT ON TABLE public.data_retention_policies IS
  'Tenant-level retention matrix: what data is kept, archived or purged, and why.';

CREATE TABLE IF NOT EXISTS public.legal_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  released_by UUID,
  released_at TIMESTAMPTZ,
  release_reason TEXT,
  CONSTRAINT legal_holds_status_chk CHECK (status IN ('active', 'released', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_legal_holds_tenant_entity
  ON public.legal_holds (tenant_id, entity_type, entity_id, status);

CREATE INDEX IF NOT EXISTS idx_legal_holds_active
  ON public.legal_holds (tenant_id, status, expires_at)
  WHERE status = 'active';

ALTER TABLE public.legal_holds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "legal_holds tenant read" ON public.legal_holds;
CREATE POLICY "legal_holds tenant read"
  ON public.legal_holds
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS "legal_holds tenant admin write" ON public.legal_holds;
CREATE POLICY "legal_holds tenant admin write"
  ON public.legal_holds
  FOR ALL TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = legal_holds.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  )
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = legal_holds.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "legal_holds service role" ON public.legal_holds;
CREATE POLICY "legal_holds service role"
  ON public.legal_holds
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON public.legal_holds TO authenticated;
GRANT ALL ON public.legal_holds TO service_role;

COMMENT ON TABLE public.legal_holds IS
  'Blocks deletion/anonymisation for records under dispute, audit, tax or legal review.';

CREATE TABLE IF NOT EXISTS public.retention_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  policy_id UUID REFERENCES public.data_retention_policies(id) ON DELETE SET NULL,
  job_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  archived_count INTEGER NOT NULL DEFAULT 0,
  purged_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  executed_by TEXT NOT NULL DEFAULT 'system',
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT retention_runs_status_chk CHECK (status IN ('running', 'success', 'failed', 'partial'))
);

CREATE INDEX IF NOT EXISTS idx_retention_runs_tenant_started
  ON public.retention_runs (tenant_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_retention_runs_job_started
  ON public.retention_runs (job_name, started_at DESC);

ALTER TABLE public.retention_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "retention_runs tenant admin read" ON public.retention_runs;
CREATE POLICY "retention_runs tenant admin read"
  ON public.retention_runs
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = retention_runs.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "retention_runs service role" ON public.retention_runs;
CREATE POLICY "retention_runs service role"
  ON public.retention_runs
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON public.retention_runs TO authenticated;
GRANT ALL ON public.retention_runs TO service_role;

COMMENT ON TABLE public.retention_runs IS
  'Audit log for archive/prune jobs across compliance domains.';

CREATE OR REPLACE FUNCTION public.seed_default_data_retention_policies(p_tenant_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.data_retention_policies (
    tenant_id,
    code,
    domain,
    table_name,
    description,
    retention_days,
    archive_after_days,
    legal_basis,
    is_fiscal_record,
    requires_legal_hold_check
  ) VALUES
    (p_tenant_id, 'audit-log', 'security', 'audit_log', 'Operational audit log', 730, 365, 'security accountability', false, false),
    (p_tenant_id, 'activity-log', 'operations', 'activity_log', 'User and system activity log', 730, 365, 'operational accountability', false, false),
    (p_tenant_id, 'api-request-log', 'security', 'api_request_log', 'API request and rate-limit log', 7, null, 'security monitoring', false, false),
    (p_tenant_id, 'orders', 'transport', 'orders', 'Transport dossiers and order records', 2555, null, 'transport contract and fiscal evidence', true, true),
    (p_tenant_id, 'invoices', 'finance', 'invoices', 'Sales invoices and fiscal records', 2555, null, 'Dutch fiscal retention', true, true),
    (p_tenant_id, 'pod-evidence', 'transport', 'pod-files/proof_of_delivery', 'Proof of Delivery signatures, photos and metadata', 730, null, 'delivery evidence', false, true),
    (p_tenant_id, 'vehicle-positions', 'privacy', 'vehicle_positions', 'Live and historical vehicle GPS positions', 90, null, 'route execution and customer ETA', false, true),
    (p_tenant_id, 'driver-positions', 'privacy', 'driver_positions', 'Driver GPS positions', 90, null, 'route execution and safety', false, true),
    (p_tenant_id, 'vehicle-check-photos', 'fleet', 'vehicle_check_photos', 'Vehicle inspection photos', 180, null, 'fleet safety evidence', false, true)
  ON CONFLICT (tenant_id, code) DO UPDATE
  SET
    domain = EXCLUDED.domain,
    table_name = EXCLUDED.table_name,
    description = EXCLUDED.description,
    retention_days = EXCLUDED.retention_days,
    archive_after_days = EXCLUDED.archive_after_days,
    legal_basis = EXCLUDED.legal_basis,
    is_fiscal_record = EXCLUDED.is_fiscal_record,
    requires_legal_hold_check = EXCLUDED.requires_legal_hold_check,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.seed_default_data_retention_policies(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_default_data_retention_policies(UUID) TO service_role;

DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    PERFORM public.seed_default_data_retention_policies(t.id);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.run_compliance_retention(p_executed_by TEXT DEFAULT 'system')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_audit_archived INTEGER := 0;
  v_audit_purged INTEGER := 0;
  v_activity_archived INTEGER := 0;
  v_activity_purged INTEGER := 0;
  v_api_purged INTEGER := 0;
  v_run_id UUID;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'run_compliance_retention requires service_role';
  END IF;

  INSERT INTO public.retention_runs (job_name, status, executed_by, metadata)
  VALUES ('compliance-retention', 'running', COALESCE(p_executed_by, 'system'), '{"scope":"global"}'::jsonb)
  RETURNING id INTO v_run_id;

  SELECT archived_rows, purged_rows
    INTO v_audit_archived, v_audit_purged
  FROM public.prune_audit_log();

  INSERT INTO public.retention_runs (
    job_name,
    status,
    archived_count,
    purged_count,
    executed_by,
    metadata,
    finished_at
  ) VALUES (
    'prune-audit-log',
    'success',
    COALESCE(v_audit_archived, 0),
    COALESCE(v_audit_purged, 0),
    COALESCE(p_executed_by, 'system'),
    jsonb_build_object('parent_run_id', v_run_id),
    now()
  );

  SELECT archived_rows, purged_rows
    INTO v_activity_archived, v_activity_purged
  FROM public.prune_activity_log();

  INSERT INTO public.retention_runs (
    job_name,
    status,
    archived_count,
    purged_count,
    executed_by,
    metadata,
    finished_at
  ) VALUES (
    'prune-activity-log',
    'success',
    COALESCE(v_activity_archived, 0),
    COALESCE(v_activity_purged, 0),
    COALESCE(p_executed_by, 'system'),
    jsonb_build_object('parent_run_id', v_run_id),
    now()
  );

  SELECT public.prune_api_request_log() INTO v_api_purged;

  INSERT INTO public.retention_runs (
    job_name,
    status,
    purged_count,
    executed_by,
    metadata,
    finished_at
  ) VALUES (
    'prune-api-request-log',
    'success',
    COALESCE(v_api_purged, 0),
    COALESCE(p_executed_by, 'system'),
    jsonb_build_object('parent_run_id', v_run_id),
    now()
  );

  UPDATE public.retention_runs
  SET
    status = 'success',
    archived_count = COALESCE(v_audit_archived, 0) + COALESCE(v_activity_archived, 0),
    purged_count = COALESCE(v_audit_purged, 0) + COALESCE(v_activity_purged, 0) + COALESCE(v_api_purged, 0),
    finished_at = now(),
    metadata = jsonb_build_object(
      'audit_archived', COALESCE(v_audit_archived, 0),
      'audit_purged', COALESCE(v_audit_purged, 0),
      'activity_archived', COALESCE(v_activity_archived, 0),
      'activity_purged', COALESCE(v_activity_purged, 0),
      'api_purged', COALESCE(v_api_purged, 0)
    )
  WHERE id = v_run_id;

  RETURN jsonb_build_object(
    'run_id', v_run_id,
    'audit_archived', COALESCE(v_audit_archived, 0),
    'audit_purged', COALESCE(v_audit_purged, 0),
    'activity_archived', COALESCE(v_activity_archived, 0),
    'activity_purged', COALESCE(v_activity_purged, 0),
    'api_purged', COALESCE(v_api_purged, 0)
  );
EXCEPTION WHEN OTHERS THEN
  IF v_run_id IS NOT NULL THEN
    UPDATE public.retention_runs
    SET status = 'failed', error_message = SQLERRM, finished_at = now()
    WHERE id = v_run_id;
  END IF;
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.run_compliance_retention(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_compliance_retention(TEXT) TO service_role;

COMMENT ON FUNCTION public.run_compliance_retention(TEXT) IS
  'Runs global retention jobs and writes retention_runs evidence. Service-role only.';

-- Scheduling note:
-- The run-compliance-retention edge function should be called daily by
-- Supabase Scheduler with either a service-role bearer token or x-cron-secret.
-- We intentionally do not register a direct pg_cron SQL call here, because the
-- retention runner is service-role gated and must produce an auditable caller.
