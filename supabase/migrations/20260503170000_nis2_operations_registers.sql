-- Compliance Sprint: NIS2 operations registers.
--
-- Adds operational proof registers for incidents, backup/restore tests and
-- suppliers/subprocessors. These are process-control tables: they make the
-- security operating model auditable without changing product flows yet.

CREATE TABLE IF NOT EXISTS public.security_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'security',
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  contained_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  reported_at TIMESTAMPTZ,
  report_deadline_at TIMESTAMPTZ,
  affected_systems TEXT[] NOT NULL DEFAULT '{}'::text[],
  affected_data_categories TEXT[] NOT NULL DEFAULT '{}'::text[],
  customer_impact TEXT,
  regulator_report_required BOOLEAN NOT NULL DEFAULT false,
  summary TEXT,
  root_cause TEXT,
  corrective_actions TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT security_incidents_category_chk CHECK (
    category IN ('security', 'privacy', 'availability', 'integrity', 'supplier', 'other')
  ),
  CONSTRAINT security_incidents_severity_chk CHECK (
    severity IN ('low', 'medium', 'high', 'critical')
  ),
  CONSTRAINT security_incidents_status_chk CHECK (
    status IN ('open', 'triage', 'contained', 'resolved', 'closed')
  )
);

CREATE INDEX IF NOT EXISTS idx_security_incidents_tenant_status
  ON public.security_incidents (tenant_id, status, severity, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_incidents_owner
  ON public.security_incidents (tenant_id, owner_user_id, status);

DROP TRIGGER IF EXISTS update_security_incidents_updated_at ON public.security_incidents;
CREATE TRIGGER update_security_incidents_updated_at
  BEFORE UPDATE ON public.security_incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.security_incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "security_incidents tenant admin read" ON public.security_incidents;
CREATE POLICY "security_incidents tenant admin read"
  ON public.security_incidents
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = security_incidents.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "security_incidents tenant admin write" ON public.security_incidents;
CREATE POLICY "security_incidents tenant admin write"
  ON public.security_incidents
  FOR ALL TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = security_incidents.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  )
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = security_incidents.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "security_incidents service role" ON public.security_incidents;
CREATE POLICY "security_incidents service role"
  ON public.security_incidents
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.security_incidents TO authenticated;
GRANT ALL ON public.security_incidents TO service_role;

COMMENT ON TABLE public.security_incidents IS
  'NIS2/security incident register with owner, impact, status, deadlines and corrective actions.';

CREATE TABLE IF NOT EXISTS public.security_incident_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  incident_id UUID NOT NULL REFERENCES public.security_incidents(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT security_incident_events_type_chk CHECK (
    event_type IN ('created', 'status_changed', 'assigned', 'contained', 'reported', 'resolved', 'closed', 'note')
  )
);

CREATE INDEX IF NOT EXISTS idx_security_incident_events_incident_created
  ON public.security_incident_events (incident_id, created_at DESC);

ALTER TABLE public.security_incident_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "security_incident_events tenant admin read" ON public.security_incident_events;
CREATE POLICY "security_incident_events tenant admin read"
  ON public.security_incident_events
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = security_incident_events.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "security_incident_events tenant admin insert" ON public.security_incident_events;
CREATE POLICY "security_incident_events tenant admin insert"
  ON public.security_incident_events
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND actor_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = security_incident_events.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "security_incident_events service role" ON public.security_incident_events;
CREATE POLICY "security_incident_events service role"
  ON public.security_incident_events
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT ON public.security_incident_events TO authenticated;
GRANT ALL ON public.security_incident_events TO service_role;

COMMENT ON TABLE public.security_incident_events IS
  'Append-only timeline for incident response actions and evidence.';

CREATE TABLE IF NOT EXISTS public.backup_restore_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  test_name TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'database',
  status TEXT NOT NULL DEFAULT 'planned',
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  planned_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  rpo_minutes INTEGER,
  rto_minutes INTEGER,
  restore_point_at TIMESTAMPTZ,
  evidence_url TEXT,
  findings TEXT,
  corrective_actions TEXT,
  next_test_due_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT backup_restore_tests_scope_chk CHECK (
    scope IN ('database', 'storage', 'edge_functions', 'full_platform', 'other')
  ),
  CONSTRAINT backup_restore_tests_status_chk CHECK (
    status IN ('planned', 'running', 'passed', 'failed', 'partial')
  )
);

CREATE INDEX IF NOT EXISTS idx_backup_restore_tests_tenant_due
  ON public.backup_restore_tests (tenant_id, next_test_due_at, status);

DROP TRIGGER IF EXISTS update_backup_restore_tests_updated_at ON public.backup_restore_tests;
CREATE TRIGGER update_backup_restore_tests_updated_at
  BEFORE UPDATE ON public.backup_restore_tests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.backup_restore_tests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "backup_restore_tests tenant admin read" ON public.backup_restore_tests;
CREATE POLICY "backup_restore_tests tenant admin read"
  ON public.backup_restore_tests
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = backup_restore_tests.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "backup_restore_tests tenant admin write" ON public.backup_restore_tests;
CREATE POLICY "backup_restore_tests tenant admin write"
  ON public.backup_restore_tests
  FOR ALL TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = backup_restore_tests.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  )
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = backup_restore_tests.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "backup_restore_tests service role" ON public.backup_restore_tests;
CREATE POLICY "backup_restore_tests service role"
  ON public.backup_restore_tests
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.backup_restore_tests TO authenticated;
GRANT ALL ON public.backup_restore_tests TO service_role;

COMMENT ON TABLE public.backup_restore_tests IS
  'Evidence log for backup/restore tests, including RPO/RTO and follow-up actions.';

CREATE TABLE IF NOT EXISTS public.supplier_security_register (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  supplier_type TEXT NOT NULL DEFAULT 'processor',
  service_description TEXT NOT NULL,
  data_categories TEXT[] NOT NULL DEFAULT '{}'::text[],
  countries TEXT[] NOT NULL DEFAULT '{}'::text[],
  contract_status TEXT NOT NULL DEFAULT 'draft',
  dpa_signed_at TIMESTAMPTZ,
  security_review_status TEXT NOT NULL DEFAULT 'pending',
  security_reviewed_at TIMESTAMPTZ,
  next_review_due_at TIMESTAMPTZ,
  risk_level TEXT NOT NULL DEFAULT 'standard',
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name),
  CONSTRAINT supplier_security_register_type_chk CHECK (
    supplier_type IN ('processor', 'subprocessor', 'vendor', 'authority', 'other')
  ),
  CONSTRAINT supplier_security_register_contract_chk CHECK (
    contract_status IN ('draft', 'active', 'expired', 'terminated')
  ),
  CONSTRAINT supplier_security_register_review_chk CHECK (
    security_review_status IN ('pending', 'approved', 'conditional', 'rejected')
  ),
  CONSTRAINT supplier_security_register_risk_chk CHECK (
    risk_level IN ('low', 'standard', 'high', 'critical')
  )
);

CREATE INDEX IF NOT EXISTS idx_supplier_security_register_tenant_due
  ON public.supplier_security_register (tenant_id, next_review_due_at, security_review_status);

DROP TRIGGER IF EXISTS update_supplier_security_register_updated_at ON public.supplier_security_register;
CREATE TRIGGER update_supplier_security_register_updated_at
  BEFORE UPDATE ON public.supplier_security_register
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.supplier_security_register ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "supplier_security_register tenant admin read" ON public.supplier_security_register;
CREATE POLICY "supplier_security_register tenant admin read"
  ON public.supplier_security_register
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = supplier_security_register.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "supplier_security_register tenant admin write" ON public.supplier_security_register;
CREATE POLICY "supplier_security_register tenant admin write"
  ON public.supplier_security_register
  FOR ALL TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = supplier_security_register.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  )
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = supplier_security_register.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "supplier_security_register service role" ON public.supplier_security_register;
CREATE POLICY "supplier_security_register service role"
  ON public.supplier_security_register
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.supplier_security_register TO authenticated;
GRANT ALL ON public.supplier_security_register TO service_role;

COMMENT ON TABLE public.supplier_security_register IS
  'Supplier and subprocessor security register for NIS2/GDPR vendor governance.';

CREATE OR REPLACE FUNCTION public.prevent_security_incident_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Security incident events are append-only';
END;
$$;

DROP TRIGGER IF EXISTS prevent_security_incident_event_mutation ON public.security_incident_events;
CREATE TRIGGER prevent_security_incident_event_mutation
  BEFORE UPDATE OR DELETE ON public.security_incident_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_security_incident_event_mutation();

CREATE OR REPLACE FUNCTION public.open_security_incident(
  p_title TEXT,
  p_category TEXT DEFAULT 'security',
  p_severity TEXT DEFAULT 'medium',
  p_summary TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID := public.current_tenant_id();
  v_incident_id UUID;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Missing tenant context';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = v_tenant_id
      AND tm.user_id = auth.uid()
      AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
  ) THEN
    RAISE EXCEPTION 'Insufficient privileges for incident creation';
  END IF;

  INSERT INTO public.security_incidents (
    tenant_id,
    title,
    category,
    severity,
    status,
    owner_user_id,
    report_deadline_at,
    summary,
    created_by
  ) VALUES (
    v_tenant_id,
    p_title,
    COALESCE(p_category, 'security'),
    COALESCE(p_severity, 'medium'),
    'open',
    auth.uid(),
    CASE WHEN COALESCE(p_severity, 'medium') IN ('high', 'critical') THEN now() + interval '24 hours' ELSE NULL END,
    p_summary,
    auth.uid()
  )
  RETURNING id INTO v_incident_id;

  INSERT INTO public.security_incident_events (
    tenant_id,
    incident_id,
    event_type,
    actor_id,
    note,
    metadata
  ) VALUES (
    v_tenant_id,
    v_incident_id,
    'created',
    auth.uid(),
    p_summary,
    jsonb_build_object('severity', COALESCE(p_severity, 'medium'), 'category', COALESCE(p_category, 'security'))
  );

  RETURN v_incident_id;
END;
$$;

REVOKE ALL ON FUNCTION public.open_security_incident(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_security_incident(TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.log_security_incident_event(
  p_incident_id UUID,
  p_event_type TEXT,
  p_note TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID := public.current_tenant_id();
  v_event_id UUID;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Missing tenant context';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.security_incidents si
    WHERE si.tenant_id = v_tenant_id
      AND si.id = p_incident_id
  ) THEN
    RAISE EXCEPTION 'Incident not found in tenant';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = v_tenant_id
      AND tm.user_id = auth.uid()
      AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
  ) THEN
    RAISE EXCEPTION 'Insufficient privileges for incident event';
  END IF;

  INSERT INTO public.security_incident_events (
    tenant_id,
    incident_id,
    event_type,
    actor_id,
    note,
    metadata
  ) VALUES (
    v_tenant_id,
    p_incident_id,
    p_event_type,
    auth.uid(),
    p_note,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_security_incident_event(UUID, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_security_incident_event(UUID, TEXT, TEXT, JSONB) TO authenticated, service_role;
