-- Compliance Sprint: CMR/eCMR evidence foundation.
--
-- Adds immutable CMR versions, document hashes and append-only events. This
-- does not claim certified eCMR yet; it creates the evidence layer needed for
-- finalisation, versioning and later verification/signature flows.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.cmr_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  cmr_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'finalized',
  current_version INTEGER NOT NULL DEFAULT 1,
  document_hash TEXT NOT NULL,
  finalized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, order_id),
  UNIQUE (tenant_id, cmr_number),
  CONSTRAINT cmr_documents_status_chk CHECK (status IN ('draft', 'finalized', 'superseded')),
  CONSTRAINT cmr_documents_version_chk CHECK (current_version > 0),
  CONSTRAINT cmr_documents_hash_chk CHECK (document_hash ~ '^[a-f0-9]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_cmr_documents_tenant_created
  ON public.cmr_documents (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cmr_documents_order
  ON public.cmr_documents (order_id);

DROP TRIGGER IF EXISTS update_cmr_documents_updated_at ON public.cmr_documents;
CREATE TRIGGER update_cmr_documents_updated_at
  BEFORE UPDATE ON public.cmr_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.cmr_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cmr_documents tenant read" ON public.cmr_documents;
CREATE POLICY "cmr_documents tenant read"
  ON public.cmr_documents
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS "cmr_documents tenant write" ON public.cmr_documents;
CREATE POLICY "cmr_documents tenant write"
  ON public.cmr_documents
  FOR ALL TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = cmr_documents.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'planner'::text])
    )
  )
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = cmr_documents.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'planner'::text])
    )
  );

DROP POLICY IF EXISTS "cmr_documents service role" ON public.cmr_documents;
CREATE POLICY "cmr_documents service role"
  ON public.cmr_documents
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.cmr_documents TO authenticated;
GRANT ALL ON public.cmr_documents TO service_role;

COMMENT ON TABLE public.cmr_documents IS
  'Current CMR document state with hash pointer to the latest finalized evidence version.';

CREATE TABLE IF NOT EXISTS public.cmr_document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.cmr_documents(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  document_hash TEXT NOT NULL,
  data_snapshot JSONB NOT NULL,
  change_reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_number),
  CONSTRAINT cmr_document_versions_version_chk CHECK (version_number > 0),
  CONSTRAINT cmr_document_versions_hash_chk CHECK (document_hash ~ '^[a-f0-9]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_cmr_document_versions_document
  ON public.cmr_document_versions (document_id, version_number DESC);

CREATE INDEX IF NOT EXISTS idx_cmr_document_versions_order
  ON public.cmr_document_versions (order_id, created_at DESC);

ALTER TABLE public.cmr_document_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cmr_document_versions tenant read" ON public.cmr_document_versions;
CREATE POLICY "cmr_document_versions tenant read"
  ON public.cmr_document_versions
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS "cmr_document_versions service role" ON public.cmr_document_versions;
CREATE POLICY "cmr_document_versions service role"
  ON public.cmr_document_versions
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON public.cmr_document_versions TO authenticated;
GRANT ALL ON public.cmr_document_versions TO service_role;

COMMENT ON TABLE public.cmr_document_versions IS
  'Append-only immutable CMR evidence versions. Any post-finalisation change creates a new version.';

CREATE TABLE IF NOT EXISTS public.cmr_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.cmr_documents(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cmr_events_type_chk CHECK (
    event_type IN ('finalized', 'version_created', 'viewed', 'printed', 'verified', 'signed')
  )
);

CREATE INDEX IF NOT EXISTS idx_cmr_events_document_created
  ON public.cmr_events (document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cmr_events_order_created
  ON public.cmr_events (order_id, created_at DESC);

ALTER TABLE public.cmr_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cmr_events tenant read" ON public.cmr_events;
CREATE POLICY "cmr_events tenant read"
  ON public.cmr_events
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS "cmr_events tenant insert" ON public.cmr_events;
CREATE POLICY "cmr_events tenant insert"
  ON public.cmr_events
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND actor_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "cmr_events service role" ON public.cmr_events;
CREATE POLICY "cmr_events service role"
  ON public.cmr_events
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT ON public.cmr_events TO authenticated;
GRANT ALL ON public.cmr_events TO service_role;

COMMENT ON TABLE public.cmr_events IS
  'Append-only event log for CMR finalisation, versioning, viewing, printing, verification and signing.';

CREATE OR REPLACE FUNCTION public.prevent_cmr_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'CMR evidence rows are append-only';
END;
$$;

DROP TRIGGER IF EXISTS prevent_cmr_version_update ON public.cmr_document_versions;
CREATE TRIGGER prevent_cmr_version_update
  BEFORE UPDATE OR DELETE ON public.cmr_document_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_cmr_evidence_mutation();

DROP TRIGGER IF EXISTS prevent_cmr_event_update ON public.cmr_events;
CREATE TRIGGER prevent_cmr_event_update
  BEFORE UPDATE OR DELETE ON public.cmr_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_cmr_evidence_mutation();

CREATE OR REPLACE FUNCTION public.finalize_cmr_document(
  p_order_id UUID,
  p_data_snapshot JSONB DEFAULT '{}'::jsonb,
  p_change_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID := public.current_tenant_id();
  v_order public.orders%ROWTYPE;
  v_document public.cmr_documents%ROWTYPE;
  v_document_id UUID;
  v_version_id UUID;
  v_version_number INTEGER;
  v_cmr_number TEXT;
  v_snapshot JSONB;
  v_hash TEXT;
  v_event_type TEXT;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Missing tenant context';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = v_tenant_id
      AND tm.user_id = auth.uid()
      AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'planner'::text])
  ) THEN
    RAISE EXCEPTION 'Insufficient privileges for CMR finalisation';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE tenant_id = v_tenant_id AND id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found in tenant';
  END IF;

  v_cmr_number := COALESCE(
    v_order.cmr_number,
    'RC-CMR-' || EXTRACT(YEAR FROM now())::int || '-' || lpad(v_order.order_number::text, 4, '0')
  );

  SELECT *
  INTO v_document
  FROM public.cmr_documents
  WHERE tenant_id = v_tenant_id AND order_id = p_order_id;

  IF FOUND AND p_change_reason IS NULL THEN
    RETURN jsonb_build_object(
      'document_id', v_document.id,
      'cmr_number', v_document.cmr_number,
      'version_id', (
        SELECT cdv.id
        FROM public.cmr_document_versions cdv
        WHERE cdv.document_id = v_document.id
          AND cdv.version_number = v_document.current_version
        LIMIT 1
      ),
      'version_number', v_document.current_version,
      'document_hash', v_document.document_hash,
      'status', 'already_finalized'
    );
  END IF;

  v_version_number := CASE WHEN FOUND THEN v_document.current_version + 1 ELSE 1 END;
  v_event_type := CASE WHEN FOUND THEN 'version_created' ELSE 'finalized' END;

  v_snapshot := jsonb_build_object(
    'order', jsonb_build_object(
      'id', v_order.id,
      'order_number', v_order.order_number,
      'client_name', v_order.client_name,
      'pickup_address', v_order.pickup_address,
      'delivery_address', v_order.delivery_address,
      'quantity', v_order.quantity,
      'unit', v_order.unit,
      'weight_kg', v_order.weight_kg,
      'is_weight_per_unit', v_order.is_weight_per_unit,
      'dimensions', v_order.dimensions,
      'requirements', v_order.requirements,
      'time_window_start', v_order.time_window_start,
      'time_window_end', v_order.time_window_end,
      'recipient_name', v_order.recipient_name,
      'pod_signed_by', v_order.pod_signed_by,
      'pod_signed_at', v_order.pod_signed_at
    ),
    'cmr_number', v_cmr_number,
    'version_number', v_version_number,
    'generated_at', now(),
    'input_snapshot', COALESCE(p_data_snapshot, '{}'::jsonb)
  );

  v_hash := encode(digest(v_snapshot::text, 'sha256'), 'hex');

  IF v_document.id IS NULL THEN
    INSERT INTO public.cmr_documents (
      tenant_id,
      order_id,
      cmr_number,
      status,
      current_version,
      document_hash,
      finalized_by
    ) VALUES (
      v_tenant_id,
      p_order_id,
      v_cmr_number,
      'finalized',
      v_version_number,
      v_hash,
      auth.uid()
    )
    RETURNING id INTO v_document_id;
  ELSE
    UPDATE public.cmr_documents
    SET
      status = 'finalized',
      current_version = v_version_number,
      document_hash = v_hash,
      finalized_at = now(),
      finalized_by = auth.uid(),
      updated_at = now()
    WHERE id = v_document.id
    RETURNING id INTO v_document_id;
  END IF;

  INSERT INTO public.cmr_document_versions (
    tenant_id,
    document_id,
    order_id,
    version_number,
    document_hash,
    data_snapshot,
    change_reason,
    created_by
  ) VALUES (
    v_tenant_id,
    v_document_id,
    p_order_id,
    v_version_number,
    v_hash,
    v_snapshot,
    p_change_reason,
    auth.uid()
  )
  RETURNING id INTO v_version_id;

  INSERT INTO public.cmr_events (
    tenant_id,
    document_id,
    order_id,
    event_type,
    actor_id,
    metadata
  ) VALUES (
    v_tenant_id,
    v_document_id,
    p_order_id,
    v_event_type,
    auth.uid(),
    jsonb_build_object(
      'version_id', v_version_id,
      'version_number', v_version_number,
      'document_hash', v_hash,
      'change_reason', p_change_reason
    )
  );

  UPDATE public.orders
  SET
    cmr_number = v_cmr_number,
    cmr_generated_at = COALESCE(cmr_generated_at, now()),
    updated_at = now()
  WHERE tenant_id = v_tenant_id AND id = p_order_id;

  RETURN jsonb_build_object(
    'document_id', v_document_id,
    'cmr_number', v_cmr_number,
    'version_id', v_version_id,
    'version_number', v_version_number,
    'document_hash', v_hash,
    'status', 'finalized'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_cmr_document(UUID, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_cmr_document(UUID, JSONB, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.finalize_cmr_document(UUID, JSONB, TEXT) IS
  'Finalizes or versions a CMR document with SHA-256 hash, immutable version row and append-only event.';

CREATE OR REPLACE FUNCTION public.log_cmr_event(
  p_document_id UUID,
  p_event_type TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID := public.current_tenant_id();
  v_order_id UUID;
  v_event_id UUID;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Missing tenant context';
  END IF;

  SELECT order_id
  INTO v_order_id
  FROM public.cmr_documents
  WHERE tenant_id = v_tenant_id AND id = p_document_id;

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'CMR document not found in tenant';
  END IF;

  INSERT INTO public.cmr_events (
    tenant_id,
    document_id,
    order_id,
    event_type,
    actor_id,
    metadata
  ) VALUES (
    v_tenant_id,
    p_document_id,
    v_order_id,
    p_event_type,
    auth.uid(),
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_cmr_event(UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_cmr_event(UUID, TEXT, JSONB) TO authenticated, service_role;

COMMENT ON FUNCTION public.log_cmr_event(UUID, TEXT, JSONB) IS
  'Writes an append-only CMR event such as viewed, printed, verified or signed.';
