-- Compliance Sprint: per-order compliance evidence.
--
-- Keeps compliance out of the primary app navigation while making order-level
-- checks enforceable and auditable for conditional transport modules.

CREATE TABLE IF NOT EXISTS public.order_compliance_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  module_code TEXT NOT NULL,
  document_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  file_url TEXT,
  document_hash TEXT,
  evidence_source TEXT NOT NULL DEFAULT 'manual',
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, order_id, module_code, document_code),
  CONSTRAINT order_compliance_evidence_module_chk CHECK (
    module_code IN ('ADR', 'CUSTOMS', 'COLD_CHAIN', 'WASTE', 'PHARMA_FOOD')
  ),
  CONSTRAINT order_compliance_evidence_status_chk CHECK (
    status IN ('received', 'accepted', 'verified', 'rejected', 'expired')
  ),
  CONSTRAINT order_compliance_evidence_source_chk CHECK (
    evidence_source IN ('manual', 'import', 'portal', 'system')
  ),
  CONSTRAINT order_compliance_evidence_hash_chk CHECK (
    document_hash IS NULL OR document_hash ~ '^[a-f0-9]{64}$'
  )
);

CREATE INDEX IF NOT EXISTS idx_order_compliance_evidence_order
  ON public.order_compliance_evidence (tenant_id, order_id, module_code, status);

CREATE INDEX IF NOT EXISTS idx_order_compliance_evidence_expiry
  ON public.order_compliance_evidence (tenant_id, expires_at)
  WHERE expires_at IS NOT NULL;

DROP TRIGGER IF EXISTS update_order_compliance_evidence_updated_at ON public.order_compliance_evidence;
CREATE TRIGGER update_order_compliance_evidence_updated_at
  BEFORE UPDATE ON public.order_compliance_evidence
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.order_compliance_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_compliance_evidence tenant admin read" ON public.order_compliance_evidence;
CREATE POLICY "order_compliance_evidence tenant admin read"
  ON public.order_compliance_evidence
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = order_compliance_evidence.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "order_compliance_evidence tenant admin write" ON public.order_compliance_evidence;
CREATE POLICY "order_compliance_evidence tenant admin write"
  ON public.order_compliance_evidence
  FOR ALL TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = order_compliance_evidence.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  )
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = order_compliance_evidence.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "order_compliance_evidence service role" ON public.order_compliance_evidence;
CREATE POLICY "order_compliance_evidence service role"
  ON public.order_compliance_evidence
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.order_compliance_evidence TO authenticated;
GRANT ALL ON public.order_compliance_evidence TO service_role;

COMMENT ON TABLE public.order_compliance_evidence IS
  'Per-order evidence records for enabled conditional transport compliance modules.';

CREATE TABLE IF NOT EXISTS public.order_compliance_evidence_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  evidence_id UUID REFERENCES public.order_compliance_evidence(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  module_code TEXT NOT NULL,
  document_code TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT order_compliance_evidence_events_module_chk CHECK (
    module_code IN ('ADR', 'CUSTOMS', 'COLD_CHAIN', 'WASTE', 'PHARMA_FOOD')
  ),
  CONSTRAINT order_compliance_evidence_events_type_chk CHECK (
    event_type IN ('received', 'accepted', 'verified', 'rejected', 'expired', 'updated')
  )
);

CREATE INDEX IF NOT EXISTS idx_order_compliance_evidence_events_order
  ON public.order_compliance_evidence_events (tenant_id, order_id, created_at DESC);

ALTER TABLE public.order_compliance_evidence_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_compliance_evidence_events tenant admin read" ON public.order_compliance_evidence_events;
CREATE POLICY "order_compliance_evidence_events tenant admin read"
  ON public.order_compliance_evidence_events
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = order_compliance_evidence_events.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "order_compliance_evidence_events service role" ON public.order_compliance_evidence_events;
CREATE POLICY "order_compliance_evidence_events service role"
  ON public.order_compliance_evidence_events
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON public.order_compliance_evidence_events TO authenticated;
GRANT ALL ON public.order_compliance_evidence_events TO service_role;

COMMENT ON TABLE public.order_compliance_evidence_events IS
  'Append-only timeline for order compliance evidence changes.';

CREATE OR REPLACE FUNCTION public.prevent_order_compliance_evidence_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Order compliance evidence events are append-only';
END;
$$;

DROP TRIGGER IF EXISTS prevent_order_compliance_evidence_event_mutation ON public.order_compliance_evidence_events;
CREATE TRIGGER prevent_order_compliance_evidence_event_mutation
  BEFORE UPDATE OR DELETE ON public.order_compliance_evidence_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_order_compliance_evidence_event_mutation();

CREATE OR REPLACE FUNCTION public.upsert_order_compliance_evidence(
  p_order_id UUID,
  p_module_code TEXT,
  p_document_code TEXT,
  p_status TEXT DEFAULT 'received',
  p_file_url TEXT DEFAULT NULL,
  p_document_hash TEXT DEFAULT NULL,
  p_evidence_source TEXT DEFAULT 'manual',
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID := public.current_tenant_id();
  v_evidence_id UUID;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Missing tenant context';
  END IF;

  IF p_module_code NOT IN ('ADR', 'CUSTOMS', 'COLD_CHAIN', 'WASTE', 'PHARMA_FOOD') THEN
    RAISE EXCEPTION 'Unsupported compliance module: %', p_module_code;
  END IF;

  IF p_status NOT IN ('received', 'accepted', 'verified', 'rejected', 'expired') THEN
    RAISE EXCEPTION 'Unsupported evidence status: %', p_status;
  END IF;

  IF COALESCE(p_evidence_source, 'manual') NOT IN ('manual', 'import', 'portal', 'system') THEN
    RAISE EXCEPTION 'Unsupported evidence source: %', p_evidence_source;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = v_tenant_id
      AND tm.user_id = auth.uid()
      AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
  ) THEN
    RAISE EXCEPTION 'Insufficient privileges for order compliance evidence';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = p_order_id
      AND o.tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'Order not found in tenant';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.compliance_modules cm
    WHERE cm.tenant_id = v_tenant_id
      AND cm.module_code = p_module_code
      AND cm.status = 'enabled'
  ) THEN
    RAISE EXCEPTION 'Compliance module % is not enabled for this tenant', p_module_code;
  END IF;

  INSERT INTO public.order_compliance_evidence (
    tenant_id,
    order_id,
    module_code,
    document_code,
    status,
    file_url,
    document_hash,
    evidence_source,
    reviewed_by,
    reviewed_at,
    expires_at,
    notes,
    metadata,
    created_by
  ) VALUES (
    v_tenant_id,
    p_order_id,
    p_module_code,
    p_document_code,
    p_status,
    p_file_url,
    p_document_hash,
    COALESCE(p_evidence_source, 'manual'),
    CASE WHEN p_status IN ('accepted', 'verified', 'rejected') THEN auth.uid() ELSE NULL END,
    CASE WHEN p_status IN ('accepted', 'verified', 'rejected') THEN now() ELSE NULL END,
    p_expires_at,
    p_notes,
    COALESCE(p_metadata, '{}'::jsonb),
    auth.uid()
  )
  ON CONFLICT (tenant_id, order_id, module_code, document_code)
  DO UPDATE SET
    status = excluded.status,
    file_url = excluded.file_url,
    document_hash = excluded.document_hash,
    evidence_source = excluded.evidence_source,
    reviewed_by = excluded.reviewed_by,
    reviewed_at = excluded.reviewed_at,
    expires_at = excluded.expires_at,
    notes = excluded.notes,
    metadata = excluded.metadata
  RETURNING id INTO v_evidence_id;

  INSERT INTO public.order_compliance_evidence_events (
    tenant_id,
    evidence_id,
    order_id,
    module_code,
    document_code,
    event_type,
    actor_id,
    note,
    metadata
  ) VALUES (
    v_tenant_id,
    v_evidence_id,
    p_order_id,
    p_module_code,
    p_document_code,
    CASE WHEN p_status IN ('accepted', 'verified', 'rejected', 'expired') THEN p_status ELSE 'received' END,
    auth.uid(),
    p_notes,
    COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN v_evidence_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_order_compliance_evidence(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_order_compliance_evidence(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, JSONB) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.evaluate_order_compliance(p_order_id UUID)
RETURNS SETOF public.order_compliance_checks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID := public.current_tenant_id();
  v_order public.orders%ROWTYPE;
  v_module RECORD;
  v_required TEXT[];
  v_missing TEXT[];
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
    RAISE EXCEPTION 'Insufficient privileges for order compliance evaluation';
  END IF;

  SELECT * INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
    AND o.tenant_id = v_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found in tenant';
  END IF;

  UPDATE public.order_compliance_checks occ
  SET status = 'not_applicable',
      required_documents = '{}'::text[],
      missing_documents = '{}'::text[],
      issues = '[]'::jsonb,
      checked_by = auth.uid(),
      checked_at = now()
  WHERE occ.tenant_id = v_tenant_id
    AND occ.order_id = p_order_id
    AND NOT EXISTS (
      SELECT 1 FROM public.compliance_modules cm
      WHERE cm.tenant_id = v_tenant_id
        AND cm.module_code = occ.module_code
        AND cm.status = 'enabled'
    );

  FOR v_module IN
    SELECT cm.module_code
    FROM public.compliance_modules cm
    WHERE cm.tenant_id = v_tenant_id
      AND cm.status = 'enabled'
  LOOP
    SELECT COALESCE(array_agg(cdr.document_code ORDER BY cdr.document_code), '{}'::text[]) INTO v_required
    FROM public.compliance_document_requirements cdr
    WHERE cdr.tenant_id = v_tenant_id
      AND cdr.module_code = v_module.module_code
      AND cdr.is_required = true
      AND (
        cdr.applies_to = '{}'::jsonb
        OR (
          (NOT (cdr.applies_to ? 'order_type') OR cdr.applies_to->'order_type' ? v_order.order_type)
          AND (
            NOT (cdr.applies_to ? 'countries')
            OR cdr.applies_to->'countries' ? upper(coalesce(v_order.pickup_country, ''))
            OR cdr.applies_to->'countries' ? upper(coalesce(v_order.delivery_country, ''))
          )
        )
      );

    SELECT COALESCE(array_agg(req.document_code ORDER BY req.document_code), '{}'::text[]) INTO v_missing
    FROM unnest(v_required) AS req(document_code)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.order_compliance_evidence oce
      WHERE oce.tenant_id = v_tenant_id
        AND oce.order_id = p_order_id
        AND oce.module_code = v_module.module_code
        AND oce.document_code = req.document_code
        AND oce.status IN ('accepted', 'verified')
        AND (oce.expires_at IS NULL OR oce.expires_at > now())
    );

    INSERT INTO public.order_compliance_checks (
      tenant_id,
      order_id,
      module_code,
      status,
      required_documents,
      missing_documents,
      issues,
      checked_by,
      checked_at
    ) VALUES (
      v_tenant_id,
      p_order_id,
      v_module.module_code,
      CASE WHEN cardinality(v_missing) = 0 THEN 'complete' ELSE 'blocked' END,
      v_required,
      v_missing,
      CASE
        WHEN cardinality(v_missing) = 0 THEN '[]'::jsonb
        ELSE jsonb_build_array(jsonb_build_object('type', 'missing_documents', 'documents', v_missing))
      END,
      auth.uid(),
      now()
    )
    ON CONFLICT (tenant_id, order_id, module_code)
    DO UPDATE SET
      status = excluded.status,
      required_documents = excluded.required_documents,
      missing_documents = excluded.missing_documents,
      issues = excluded.issues,
      checked_by = excluded.checked_by,
      checked_at = excluded.checked_at;
  END LOOP;

  RETURN QUERY
    SELECT occ.*
    FROM public.order_compliance_checks occ
    WHERE occ.tenant_id = v_tenant_id
      AND occ.order_id = p_order_id
    ORDER BY occ.module_code;
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_order_compliance(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_order_compliance(UUID) TO authenticated, service_role;
