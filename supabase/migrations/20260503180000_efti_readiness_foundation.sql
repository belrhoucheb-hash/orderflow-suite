-- Compliance Sprint: eFTI readiness foundation.
--
-- Builds an auditable eFTI data layer without claiming certified eFTI provider
-- status. Datasets are generated from an order snapshot, hashed, versioned and
-- shared through short-lived inspection tokens with access logging.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.efti_datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  dataset_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  format TEXT NOT NULL DEFAULT 'efti_json',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  data_hash TEXT NOT NULL,
  inspection_token_hash TEXT UNIQUE,
  inspection_token_expires_at TIMESTAMPTZ,
  generated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  revocation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, order_id, dataset_version),
  CONSTRAINT efti_datasets_status_chk CHECK (
    status IN ('draft', 'published', 'revoked', 'expired')
  ),
  CONSTRAINT efti_datasets_format_chk CHECK (
    format IN ('efti_json')
  )
);

CREATE INDEX IF NOT EXISTS idx_efti_datasets_tenant_order
  ON public.efti_datasets (tenant_id, order_id, dataset_version DESC);

CREATE INDEX IF NOT EXISTS idx_efti_datasets_token
  ON public.efti_datasets (inspection_token_hash)
  WHERE inspection_token_hash IS NOT NULL;

DROP TRIGGER IF EXISTS update_efti_datasets_updated_at ON public.efti_datasets;
CREATE TRIGGER update_efti_datasets_updated_at
  BEFORE UPDATE ON public.efti_datasets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.efti_datasets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "efti_datasets tenant admin read" ON public.efti_datasets;
CREATE POLICY "efti_datasets tenant admin read"
  ON public.efti_datasets
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = efti_datasets.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "efti_datasets tenant admin write" ON public.efti_datasets;
CREATE POLICY "efti_datasets tenant admin write"
  ON public.efti_datasets
  FOR ALL TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = efti_datasets.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  )
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = efti_datasets.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "efti_datasets service role" ON public.efti_datasets;
CREATE POLICY "efti_datasets service role"
  ON public.efti_datasets
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.efti_datasets TO authenticated;
GRANT ALL ON public.efti_datasets TO service_role;

COMMENT ON TABLE public.efti_datasets IS
  'Versioned eFTI-ready transport dataset snapshots with hash and temporary inspection token metadata.';

CREATE TABLE IF NOT EXISTS public.efti_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  dataset_id UUID NOT NULL REFERENCES public.efti_datasets(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  authority_name TEXT,
  purpose TEXT,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT efti_access_log_event_type_chk CHECK (
    event_type IN ('generated', 'token_issued', 'authority_viewed', 'exported', 'revoked')
  )
);

CREATE INDEX IF NOT EXISTS idx_efti_access_log_dataset_created
  ON public.efti_access_log (dataset_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_efti_access_log_tenant_created
  ON public.efti_access_log (tenant_id, created_at DESC);

ALTER TABLE public.efti_access_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "efti_access_log tenant admin read" ON public.efti_access_log;
CREATE POLICY "efti_access_log tenant admin read"
  ON public.efti_access_log
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = efti_access_log.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "efti_access_log service role" ON public.efti_access_log;
CREATE POLICY "efti_access_log service role"
  ON public.efti_access_log
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON public.efti_access_log TO authenticated;
GRANT ALL ON public.efti_access_log TO service_role;

COMMENT ON TABLE public.efti_access_log IS
  'Append-only access and export log for eFTI inspection and machine-readable dataset evidence.';

CREATE OR REPLACE FUNCTION public.prevent_efti_access_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'eFTI access log rows are append-only';
END;
$$;

DROP TRIGGER IF EXISTS prevent_efti_access_log_mutation ON public.efti_access_log;
CREATE TRIGGER prevent_efti_access_log_mutation
  BEFORE UPDATE OR DELETE ON public.efti_access_log
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_efti_access_log_mutation();

CREATE OR REPLACE FUNCTION public.build_efti_order_payload(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID := public.current_tenant_id();
  v_order public.orders%ROWTYPE;
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
    RAISE EXCEPTION 'Insufficient privileges for eFTI payload generation';
  END IF;

  SELECT * INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
    AND o.tenant_id = v_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found in tenant';
  END IF;

  RETURN jsonb_build_object(
    'profile', 'orderflow-efti-ready-v1',
    'claim', 'eFTI-ready export snapshot; certification/provider validation still required',
    'generated_at', now(),
    'transport_document', jsonb_build_object(
      'order_id', v_order.id,
      'order_number', v_order.order_number,
      'reference', v_order.reference,
      'cmr_number', v_order.cmr_number,
      'status', v_order.status,
      'source', v_order.source
    ),
    'parties', jsonb_build_object(
      'client_name', v_order.client_name,
      'client_id', v_order.client_id,
      'recipient_name', v_order.recipient_name
    ),
    'route', jsonb_build_object(
      'pickup', jsonb_build_object(
        'address', v_order.pickup_address,
        'country', v_order.pickup_country,
        'date', v_order.pickup_date,
        'time_window_start', v_order.pickup_time_window_start,
        'time_window_end', v_order.pickup_time_window_end,
        'coordinates', jsonb_build_object(
          'lat', v_order.geocoded_pickup_lat,
          'lng', v_order.geocoded_pickup_lng
        )
      ),
      'delivery', jsonb_build_object(
        'address', v_order.delivery_address,
        'country', v_order.delivery_country,
        'date', v_order.delivery_date,
        'time_window_start', v_order.delivery_time_window_start,
        'time_window_end', v_order.delivery_time_window_end,
        'coordinates', jsonb_build_object(
          'lat', v_order.geocoded_delivery_lat,
          'lng', v_order.geocoded_delivery_lng
        )
      )
    ),
    'goods', jsonb_build_object(
      'quantity', v_order.quantity,
      'unit', v_order.unit,
      'weight_kg', v_order.weight_kg,
      'is_weight_per_unit', v_order.is_weight_per_unit,
      'dimensions', v_order.dimensions,
      'requirements', v_order.requirements
    ),
    'execution', jsonb_build_object(
      'transport_type', v_order.transport_type,
      'driver_id', v_order.driver_id,
      'vehicle_id', v_order.vehicle_id,
      'shipment_id', v_order.shipment_id,
      'department_id', v_order.department_id,
      'leg_number', v_order.leg_number,
      'leg_role', v_order.leg_role
    ),
    'evidence', jsonb_build_object(
      'pod_signed_by', v_order.pod_signed_by,
      'pod_signed_at', v_order.pod_signed_at,
      'pod_notes', v_order.pod_notes,
      'billing_status', v_order.billing_status
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.build_efti_order_payload(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.build_efti_order_payload(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.generate_efti_dataset(p_order_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID := public.current_tenant_id();
  v_dataset_id UUID;
  v_payload JSONB;
  v_version INTEGER;
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
    RAISE EXCEPTION 'Insufficient privileges for eFTI dataset generation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = p_order_id
      AND o.tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'Order not found in tenant';
  END IF;

  v_payload := public.build_efti_order_payload(p_order_id);

  SELECT COALESCE(MAX(dataset_version), 0) + 1 INTO v_version
  FROM public.efti_datasets
  WHERE tenant_id = v_tenant_id
    AND order_id = p_order_id;

  INSERT INTO public.efti_datasets (
    tenant_id,
    order_id,
    dataset_version,
    status,
    data,
    data_hash,
    generated_by
  ) VALUES (
    v_tenant_id,
    p_order_id,
    v_version,
    'published',
    v_payload,
    encode(digest(v_payload::text, 'sha256'), 'hex'),
    auth.uid()
  )
  RETURNING id INTO v_dataset_id;

  INSERT INTO public.efti_access_log (
    tenant_id,
    dataset_id,
    order_id,
    event_type,
    actor_id,
    metadata
  ) VALUES (
    v_tenant_id,
    v_dataset_id,
    p_order_id,
    'generated',
    auth.uid(),
    jsonb_build_object('dataset_version', v_version)
  );

  RETURN v_dataset_id;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_efti_dataset(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_efti_dataset(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.issue_efti_inspection_token(
  p_dataset_id UUID,
  p_expires_in INTERVAL DEFAULT interval '24 hours'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID := public.current_tenant_id();
  v_dataset public.efti_datasets%ROWTYPE;
  v_token TEXT := encode(gen_random_bytes(32), 'hex');
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Missing tenant context';
  END IF;

  SELECT * INTO v_dataset
  FROM public.efti_datasets ed
  WHERE ed.id = p_dataset_id
    AND ed.tenant_id = v_tenant_id
    AND ed.status = 'published';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Published eFTI dataset not found in tenant';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = v_tenant_id
      AND tm.user_id = auth.uid()
      AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
  ) THEN
    RAISE EXCEPTION 'Insufficient privileges for eFTI inspection token';
  END IF;

  UPDATE public.efti_datasets
  SET inspection_token_hash = encode(digest(v_token, 'sha256'), 'hex'),
      inspection_token_expires_at = now() + LEAST(GREATEST(p_expires_in, interval '15 minutes'), interval '7 days')
  WHERE id = p_dataset_id;

  INSERT INTO public.efti_access_log (
    tenant_id,
    dataset_id,
    order_id,
    event_type,
    actor_id,
    metadata
  ) VALUES (
    v_tenant_id,
    p_dataset_id,
    v_dataset.order_id,
    'token_issued',
    auth.uid(),
    jsonb_build_object('expires_at', now() + LEAST(GREATEST(p_expires_in, interval '15 minutes'), interval '7 days'))
  );

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_efti_inspection_token(UUID, INTERVAL) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_efti_inspection_token(UUID, INTERVAL) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_efti_dataset_by_token(
  p_token TEXT,
  p_authority_name TEXT DEFAULT NULL,
  p_purpose TEXT DEFAULT 'roadside inspection',
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dataset public.efti_datasets%ROWTYPE;
BEGIN
  SELECT * INTO v_dataset
  FROM public.efti_datasets ed
  WHERE ed.inspection_token_hash = encode(digest(p_token, 'sha256'), 'hex')
    AND ed.status = 'published'
    AND ed.inspection_token_expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'eFTI inspection token invalid or expired';
  END IF;

  INSERT INTO public.efti_access_log (
    tenant_id,
    dataset_id,
    order_id,
    event_type,
    authority_name,
    purpose,
    ip_address,
    user_agent
  ) VALUES (
    v_dataset.tenant_id,
    v_dataset.id,
    v_dataset.order_id,
    'authority_viewed',
    p_authority_name,
    p_purpose,
    p_ip_address,
    p_user_agent
  );

  RETURN jsonb_build_object(
    'dataset_id', v_dataset.id,
    'dataset_version', v_dataset.dataset_version,
    'format', v_dataset.format,
    'data_hash', v_dataset.data_hash,
    'generated_at', v_dataset.generated_at,
    'expires_at', v_dataset.inspection_token_expires_at,
    'data', v_dataset.data
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_efti_dataset_by_token(TEXT, TEXT, TEXT, INET, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_efti_dataset_by_token(TEXT, TEXT, TEXT, INET, TEXT) TO anon, authenticated, service_role;
