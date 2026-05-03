-- Compliance Sprint: conditional transport modules.
--
-- Adds tenant-level switches and evidence tables for sector-specific transport
-- compliance. Modules stay dormant until explicitly enabled for a tenant.

CREATE TABLE IF NOT EXISTS public.compliance_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  module_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disabled',
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  activated_at TIMESTAMPTZ,
  deactivated_at TIMESTAMPTZ,
  next_review_due_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, module_code),
  CONSTRAINT compliance_modules_code_chk CHECK (
    module_code IN ('ADR', 'CUSTOMS', 'COLD_CHAIN', 'WASTE', 'PHARMA_FOOD')
  ),
  CONSTRAINT compliance_modules_status_chk CHECK (
    status IN ('disabled', 'enabled', 'review_required')
  )
);

CREATE INDEX IF NOT EXISTS idx_compliance_modules_tenant_status
  ON public.compliance_modules (tenant_id, status, module_code);

DROP TRIGGER IF EXISTS update_compliance_modules_updated_at ON public.compliance_modules;
CREATE TRIGGER update_compliance_modules_updated_at
  BEFORE UPDATE ON public.compliance_modules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.compliance_modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "compliance_modules tenant admin read" ON public.compliance_modules;
CREATE POLICY "compliance_modules tenant admin read"
  ON public.compliance_modules
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = compliance_modules.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "compliance_modules tenant admin write" ON public.compliance_modules;
CREATE POLICY "compliance_modules tenant admin write"
  ON public.compliance_modules
  FOR ALL TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = compliance_modules.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  )
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = compliance_modules.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "compliance_modules service role" ON public.compliance_modules;
CREATE POLICY "compliance_modules service role"
  ON public.compliance_modules
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.compliance_modules TO authenticated;
GRANT ALL ON public.compliance_modules TO service_role;

COMMENT ON TABLE public.compliance_modules IS
  'Tenant-level feature switches for ADR, customs, cold chain, waste and pharma/food compliance modules.';

CREATE TABLE IF NOT EXISTS public.compliance_module_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  module_code TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT compliance_module_events_code_chk CHECK (
    module_code IN ('ADR', 'CUSTOMS', 'COLD_CHAIN', 'WASTE', 'PHARMA_FOOD')
  ),
  CONSTRAINT compliance_module_events_type_chk CHECK (
    event_type IN ('enabled', 'disabled', 'settings_updated', 'review_required', 'document_requirement_updated')
  )
);

CREATE INDEX IF NOT EXISTS idx_compliance_module_events_tenant_created
  ON public.compliance_module_events (tenant_id, module_code, created_at DESC);

ALTER TABLE public.compliance_module_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "compliance_module_events tenant admin read" ON public.compliance_module_events;
CREATE POLICY "compliance_module_events tenant admin read"
  ON public.compliance_module_events
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = compliance_module_events.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "compliance_module_events service role" ON public.compliance_module_events;
CREATE POLICY "compliance_module_events service role"
  ON public.compliance_module_events
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON public.compliance_module_events TO authenticated;
GRANT ALL ON public.compliance_module_events TO service_role;

COMMENT ON TABLE public.compliance_module_events IS
  'Append-only audit log for sector-specific compliance module activation and configuration changes.';

CREATE TABLE IF NOT EXISTS public.compliance_document_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  module_code TEXT NOT NULL,
  document_code TEXT NOT NULL,
  label TEXT NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT true,
  applies_to JSONB NOT NULL DEFAULT '{}'::jsonb,
  retention_policy_code TEXT,
  validation_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, module_code, document_code),
  CONSTRAINT compliance_document_requirements_module_chk CHECK (
    module_code IN ('ADR', 'CUSTOMS', 'COLD_CHAIN', 'WASTE', 'PHARMA_FOOD')
  )
);

CREATE INDEX IF NOT EXISTS idx_compliance_document_requirements_tenant_module
  ON public.compliance_document_requirements (tenant_id, module_code, is_required);

DROP TRIGGER IF EXISTS update_compliance_document_requirements_updated_at ON public.compliance_document_requirements;
CREATE TRIGGER update_compliance_document_requirements_updated_at
  BEFORE UPDATE ON public.compliance_document_requirements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.compliance_document_requirements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "compliance_document_requirements tenant admin read" ON public.compliance_document_requirements;
CREATE POLICY "compliance_document_requirements tenant admin read"
  ON public.compliance_document_requirements
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = compliance_document_requirements.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "compliance_document_requirements tenant admin write" ON public.compliance_document_requirements;
CREATE POLICY "compliance_document_requirements tenant admin write"
  ON public.compliance_document_requirements
  FOR ALL TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = compliance_document_requirements.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  )
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = compliance_document_requirements.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "compliance_document_requirements service role" ON public.compliance_document_requirements;
CREATE POLICY "compliance_document_requirements service role"
  ON public.compliance_document_requirements
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.compliance_document_requirements TO authenticated;
GRANT ALL ON public.compliance_document_requirements TO service_role;

COMMENT ON TABLE public.compliance_document_requirements IS
  'Tenant-specific required document definitions for enabled sector compliance modules.';

CREATE TABLE IF NOT EXISTS public.order_compliance_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  module_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  required_documents TEXT[] NOT NULL DEFAULT '{}'::text[],
  missing_documents TEXT[] NOT NULL DEFAULT '{}'::text[],
  issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  checked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, order_id, module_code),
  CONSTRAINT order_compliance_checks_module_chk CHECK (
    module_code IN ('ADR', 'CUSTOMS', 'COLD_CHAIN', 'WASTE', 'PHARMA_FOOD')
  ),
  CONSTRAINT order_compliance_checks_status_chk CHECK (
    status IN ('pending', 'complete', 'blocked', 'not_applicable')
  )
);

CREATE INDEX IF NOT EXISTS idx_order_compliance_checks_order
  ON public.order_compliance_checks (tenant_id, order_id, status);

DROP TRIGGER IF EXISTS update_order_compliance_checks_updated_at ON public.order_compliance_checks;
CREATE TRIGGER update_order_compliance_checks_updated_at
  BEFORE UPDATE ON public.order_compliance_checks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.order_compliance_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_compliance_checks tenant admin read" ON public.order_compliance_checks;
CREATE POLICY "order_compliance_checks tenant admin read"
  ON public.order_compliance_checks
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = order_compliance_checks.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "order_compliance_checks tenant admin write" ON public.order_compliance_checks;
CREATE POLICY "order_compliance_checks tenant admin write"
  ON public.order_compliance_checks
  FOR ALL TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = order_compliance_checks.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  )
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = order_compliance_checks.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "order_compliance_checks service role" ON public.order_compliance_checks;
CREATE POLICY "order_compliance_checks service role"
  ON public.order_compliance_checks
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.order_compliance_checks TO authenticated;
GRANT ALL ON public.order_compliance_checks TO service_role;

COMMENT ON TABLE public.order_compliance_checks IS
  'Per-order compliance status for enabled conditional transport modules.';

CREATE OR REPLACE FUNCTION public.prevent_compliance_module_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Compliance module event rows are append-only';
END;
$$;

DROP TRIGGER IF EXISTS prevent_compliance_module_event_mutation ON public.compliance_module_events;
CREATE TRIGGER prevent_compliance_module_event_mutation
  BEFORE UPDATE OR DELETE ON public.compliance_module_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_compliance_module_event_mutation();

CREATE OR REPLACE FUNCTION public.set_compliance_module_status(
  p_module_code TEXT,
  p_enabled BOOLEAN,
  p_settings JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID := public.current_tenant_id();
  v_module_id UUID;
  v_status TEXT := CASE WHEN p_enabled THEN 'enabled' ELSE 'disabled' END;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Missing tenant context';
  END IF;

  IF p_module_code NOT IN ('ADR', 'CUSTOMS', 'COLD_CHAIN', 'WASTE', 'PHARMA_FOOD') THEN
    RAISE EXCEPTION 'Unsupported compliance module: %', p_module_code;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = v_tenant_id
      AND tm.user_id = auth.uid()
      AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
  ) THEN
    RAISE EXCEPTION 'Insufficient privileges for compliance module configuration';
  END IF;

  INSERT INTO public.compliance_modules (
    tenant_id,
    module_code,
    status,
    owner_user_id,
    settings,
    activated_at,
    deactivated_at,
    next_review_due_at,
    created_by
  ) VALUES (
    v_tenant_id,
    p_module_code,
    v_status,
    auth.uid(),
    COALESCE(p_settings, '{}'::jsonb),
    CASE WHEN p_enabled THEN now() ELSE NULL END,
    CASE WHEN p_enabled THEN NULL ELSE now() END,
    CASE WHEN p_enabled THEN now() + interval '12 months' ELSE NULL END,
    auth.uid()
  )
  ON CONFLICT (tenant_id, module_code)
  DO UPDATE SET
    status = excluded.status,
    settings = excluded.settings,
    owner_user_id = excluded.owner_user_id,
    activated_at = CASE WHEN excluded.status = 'enabled' THEN COALESCE(compliance_modules.activated_at, now()) ELSE compliance_modules.activated_at END,
    deactivated_at = CASE WHEN excluded.status = 'disabled' THEN now() ELSE NULL END,
    next_review_due_at = CASE WHEN excluded.status = 'enabled' THEN now() + interval '12 months' ELSE NULL END
  RETURNING id INTO v_module_id;

  INSERT INTO public.compliance_module_events (
    tenant_id,
    module_code,
    event_type,
    actor_id,
    metadata
  ) VALUES (
    v_tenant_id,
    p_module_code,
    CASE WHEN p_enabled THEN 'enabled' ELSE 'disabled' END,
    auth.uid(),
    jsonb_build_object('settings', COALESCE(p_settings, '{}'::jsonb))
  );

  RETURN v_module_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_compliance_module_status(TEXT, BOOLEAN, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_compliance_module_status(TEXT, BOOLEAN, JSONB) TO authenticated, service_role;
