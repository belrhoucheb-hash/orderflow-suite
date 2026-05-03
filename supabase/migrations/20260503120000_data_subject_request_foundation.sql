-- Compliance Sprint: AVG data subject request foundation.
--
-- Adds auditable GDPR/AVG request handling for export and erasure/anonymisation.
-- The first product surface is driver/client/order-contact data, with legal-hold
-- blocking for destructive actions.

CREATE TABLE IF NOT EXISTS public.privacy_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id UUID,
  subject_label TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  requested_by UUID,
  assigned_to UUID,
  reason TEXT,
  export_payload JSONB,
  blocked_by_legal_hold BOOLEAN NOT NULL DEFAULT false,
  legal_hold_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT privacy_requests_type_chk CHECK (
    request_type IN ('access_export', 'rectification', 'erasure_anonymisation')
  ),
  CONSTRAINT privacy_requests_subject_chk CHECK (
    subject_type IN ('driver', 'client', 'order_contact')
  ),
  CONSTRAINT privacy_requests_status_chk CHECK (
    status IN ('open', 'in_review', 'completed', 'blocked', 'rejected')
  )
);

CREATE INDEX IF NOT EXISTS idx_privacy_requests_tenant_created
  ON public.privacy_requests (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_privacy_requests_subject
  ON public.privacy_requests (tenant_id, subject_type, subject_id, status);

DROP TRIGGER IF EXISTS update_privacy_requests_updated_at ON public.privacy_requests;
CREATE TRIGGER update_privacy_requests_updated_at
  BEFORE UPDATE ON public.privacy_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.privacy_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "privacy_requests tenant admin read" ON public.privacy_requests;
CREATE POLICY "privacy_requests tenant admin read"
  ON public.privacy_requests
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = privacy_requests.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "privacy_requests tenant admin write" ON public.privacy_requests;
CREATE POLICY "privacy_requests tenant admin write"
  ON public.privacy_requests
  FOR ALL TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = privacy_requests.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  )
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = privacy_requests.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "privacy_requests service role" ON public.privacy_requests;
CREATE POLICY "privacy_requests service role"
  ON public.privacy_requests
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.privacy_requests TO authenticated;
GRANT ALL ON public.privacy_requests TO service_role;

COMMENT ON TABLE public.privacy_requests IS
  'Auditable AVG/GDPR workflow for access, rectification and erasure/anonymisation requests.';

CREATE TABLE IF NOT EXISTS public.privacy_request_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES public.privacy_requests(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_id UUID,
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_privacy_request_events_request_created
  ON public.privacy_request_events (request_id, created_at DESC);

ALTER TABLE public.privacy_request_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "privacy_request_events tenant admin read" ON public.privacy_request_events;
CREATE POLICY "privacy_request_events tenant admin read"
  ON public.privacy_request_events
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = privacy_request_events.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "privacy_request_events tenant insert" ON public.privacy_request_events;
CREATE POLICY "privacy_request_events tenant insert"
  ON public.privacy_request_events
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND actor_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "privacy_request_events service role" ON public.privacy_request_events;
CREATE POLICY "privacy_request_events service role"
  ON public.privacy_request_events
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT ON public.privacy_request_events TO authenticated;
GRANT ALL ON public.privacy_request_events TO service_role;

COMMENT ON TABLE public.privacy_request_events IS
  'Append-only event trail for AVG/GDPR data subject requests.';

CREATE OR REPLACE FUNCTION public.active_legal_hold_ids(
  p_tenant_id UUID,
  p_entity_type TEXT,
  p_entity_id UUID
)
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(array_agg(lh.id ORDER BY lh.created_at), '{}'::uuid[])
  FROM public.legal_holds lh
  WHERE lh.tenant_id = p_tenant_id
    AND lh.status = 'active'
    AND (lh.expires_at IS NULL OR lh.expires_at > now())
    AND (
      (lh.entity_type = p_entity_type AND (lh.entity_id = p_entity_id OR lh.entity_id IS NULL))
      OR (lh.entity_type = 'tenant' AND lh.entity_id IS NULL)
    );
$$;

REVOKE ALL ON FUNCTION public.active_legal_hold_ids(UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.active_legal_hold_ids(UUID, TEXT, UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_data_subject_export(
  p_subject_type TEXT,
  p_subject_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID := public.current_tenant_id();
  v_request_id UUID;
  v_label TEXT;
  v_payload JSONB;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Missing tenant context';
  END IF;

  IF p_subject_type NOT IN ('driver', 'client', 'order_contact') THEN
    RAISE EXCEPTION 'Unsupported subject type: %', p_subject_type;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = v_tenant_id
      AND tm.user_id = auth.uid()
      AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
  ) THEN
    RAISE EXCEPTION 'Insufficient privileges for data subject export';
  END IF;

  IF p_subject_type = 'driver' THEN
    SELECT name INTO v_label
    FROM public.drivers
    WHERE tenant_id = v_tenant_id AND id = p_subject_id;

    SELECT jsonb_build_object(
      'subject_type', 'driver',
      'generated_at', now(),
      'profile', to_jsonb(d) - 'pin_hash',
      'trips', COALESCE((
        SELECT jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC)
        FROM public.trips t
        WHERE t.tenant_id = v_tenant_id AND t.driver_id = p_subject_id
      ), '[]'::jsonb),
      'orders', COALESCE((
        SELECT jsonb_agg(to_jsonb(o) ORDER BY o.created_at DESC)
        FROM public.orders o
        WHERE o.tenant_id = v_tenant_id AND o.driver_id = p_subject_id
      ), '[]'::jsonb),
      'tracking_access_log', COALESCE((
        SELECT jsonb_agg(to_jsonb(tal) ORDER BY tal.created_at DESC)
        FROM public.tracking_access_log tal
        WHERE tal.tenant_id = v_tenant_id AND tal.driver_id = p_subject_id
      ), '[]'::jsonb),
      'driver_positions_sample', COALESCE((
        SELECT jsonb_agg(to_jsonb(dp) ORDER BY dp.recorded_at DESC)
        FROM (
          SELECT *
          FROM public.driver_positions
          WHERE tenant_id = v_tenant_id AND driver_id = p_subject_id
          ORDER BY recorded_at DESC
          LIMIT 1000
        ) dp
      ), '[]'::jsonb)
    )
    INTO v_payload
    FROM public.drivers d
    WHERE d.tenant_id = v_tenant_id AND d.id = p_subject_id;
  ELSIF p_subject_type = 'client' THEN
    SELECT name INTO v_label
    FROM public.clients
    WHERE tenant_id = v_tenant_id AND id = p_subject_id;

    SELECT jsonb_build_object(
      'subject_type', 'client',
      'generated_at', now(),
      'profile', to_jsonb(c),
      'orders', COALESCE((
        SELECT jsonb_agg(to_jsonb(o) ORDER BY o.created_at DESC)
        FROM public.orders o
        WHERE o.tenant_id = v_tenant_id AND o.client_id = p_subject_id
      ), '[]'::jsonb),
      'invoices', COALESCE((
        SELECT jsonb_agg(to_jsonb(i) ORDER BY i.created_at DESC)
        FROM public.invoices i
        WHERE i.tenant_id = v_tenant_id AND i.client_id = p_subject_id
      ), '[]'::jsonb)
    )
    INTO v_payload
    FROM public.clients c
    WHERE c.tenant_id = v_tenant_id AND c.id = p_subject_id;
  ELSE
    SELECT COALESCE(recipient_name, pod_signed_by, client_name, order_number::text) INTO v_label
    FROM public.orders
    WHERE tenant_id = v_tenant_id AND id = p_subject_id;

    SELECT jsonb_build_object(
      'subject_type', 'order_contact',
      'generated_at', now(),
      'order_contact', jsonb_build_object(
        'order_id', o.id,
        'order_number', o.order_number,
        'client_name', o.client_name,
        'source_email_from', o.source_email_from,
        'recipient_name', o.recipient_name,
        'recipient_email', o.recipient_email,
        'recipient_phone', o.recipient_phone,
        'pod_signed_by', o.pod_signed_by,
        'pod_signed_at', o.pod_signed_at,
        'pickup_address', o.pickup_address,
        'delivery_address', o.delivery_address
      )
    )
    INTO v_payload
    FROM public.orders o
    WHERE o.tenant_id = v_tenant_id AND o.id = p_subject_id;
  END IF;

  IF v_payload IS NULL THEN
    RAISE EXCEPTION 'Subject not found in tenant';
  END IF;

  INSERT INTO public.privacy_requests (
    tenant_id,
    request_type,
    subject_type,
    subject_id,
    subject_label,
    status,
    requested_by,
    reason,
    export_payload,
    completed_at
  ) VALUES (
    v_tenant_id,
    'access_export',
    p_subject_type,
    p_subject_id,
    v_label,
    'completed',
    auth.uid(),
    p_reason,
    v_payload,
    now()
  )
  RETURNING id INTO v_request_id;

  INSERT INTO public.privacy_request_events (
    tenant_id,
    request_id,
    event_type,
    actor_id,
    note,
    metadata
  ) VALUES (
    v_tenant_id,
    v_request_id,
    'export_generated',
    auth.uid(),
    'Data subject export generated',
    jsonb_build_object('subject_type', p_subject_type, 'subject_id', p_subject_id)
  );

  RETURN jsonb_build_object(
    'request_id', v_request_id,
    'payload', v_payload
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_data_subject_export(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_data_subject_export(TEXT, UUID, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.create_data_subject_export(TEXT, UUID, TEXT) IS
  'Creates an auditable AVG/GDPR access export for driver, client or order-contact data.';

CREATE OR REPLACE FUNCTION public.anonymize_driver_personal_data(
  p_driver_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID := public.current_tenant_id();
  v_request_id UUID;
  v_hold_ids UUID[];
  v_driver_label TEXT;
  v_positions_deleted INTEGER := 0;
  v_vehicle_positions_unlinked INTEGER := 0;
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
    RAISE EXCEPTION 'Insufficient privileges for driver anonymisation';
  END IF;

  SELECT name INTO v_driver_label
  FROM public.drivers
  WHERE tenant_id = v_tenant_id AND id = p_driver_id;

  IF v_driver_label IS NULL THEN
    RAISE EXCEPTION 'Driver not found in tenant';
  END IF;

  v_hold_ids := public.active_legal_hold_ids(v_tenant_id, 'driver', p_driver_id);

  INSERT INTO public.privacy_requests (
    tenant_id,
    request_type,
    subject_type,
    subject_id,
    subject_label,
    status,
    requested_by,
    reason,
    blocked_by_legal_hold,
    legal_hold_ids
  ) VALUES (
    v_tenant_id,
    'erasure_anonymisation',
    'driver',
    p_driver_id,
    v_driver_label,
    CASE WHEN array_length(v_hold_ids, 1) IS NULL THEN 'in_review' ELSE 'blocked' END,
    auth.uid(),
    p_reason,
    array_length(v_hold_ids, 1) IS NOT NULL,
    v_hold_ids
  )
  RETURNING id INTO v_request_id;

  IF array_length(v_hold_ids, 1) IS NOT NULL THEN
    INSERT INTO public.privacy_request_events (
      tenant_id,
      request_id,
      event_type,
      actor_id,
      note,
      metadata
    ) VALUES (
      v_tenant_id,
      v_request_id,
      'blocked_by_legal_hold',
      auth.uid(),
      'Driver anonymisation blocked by active legal hold',
      jsonb_build_object('legal_hold_ids', v_hold_ids)
    );

    RETURN jsonb_build_object(
      'request_id', v_request_id,
      'status', 'blocked',
      'legal_hold_ids', v_hold_ids
    );
  END IF;

  DELETE FROM public.driver_positions
  WHERE tenant_id = v_tenant_id AND driver_id = p_driver_id;
  GET DIAGNOSTICS v_positions_deleted = ROW_COUNT;

  UPDATE public.vehicle_positions
  SET driver_id = NULL
  WHERE tenant_id = v_tenant_id AND driver_id = p_driver_id;
  GET DIAGNOSTICS v_vehicle_positions_unlinked = ROW_COUNT;

  UPDATE public.drivers
  SET
    name = 'Geanonimiseerde chauffeur',
    email = NULL,
    phone = NULL,
    license_number = NULL,
    certifications = '{}'::text[],
    current_vehicle_id = NULL,
    is_active = false,
    pin_hash = NULL,
    failed_pin_attempts = 0,
    pin_locked_until = NULL,
    must_change_pin = true,
    updated_at = now()
  WHERE tenant_id = v_tenant_id AND id = p_driver_id;

  UPDATE public.privacy_requests
  SET
    status = 'completed',
    completed_at = now(),
    export_payload = jsonb_build_object(
      'driver_id', p_driver_id,
      'driver_positions_deleted', v_positions_deleted,
      'vehicle_positions_unlinked', v_vehicle_positions_unlinked,
      'orders_preserved', true,
      'reason', p_reason
    )
  WHERE id = v_request_id;

  INSERT INTO public.privacy_request_events (
    tenant_id,
    request_id,
    event_type,
    actor_id,
    note,
    metadata
  ) VALUES (
    v_tenant_id,
    v_request_id,
    'driver_anonymised',
    auth.uid(),
    'Driver personal data anonymised; transport records preserved',
    jsonb_build_object(
      'driver_positions_deleted', v_positions_deleted,
      'vehicle_positions_unlinked', v_vehicle_positions_unlinked
    )
  );

  RETURN jsonb_build_object(
    'request_id', v_request_id,
    'status', 'completed',
    'driver_positions_deleted', v_positions_deleted,
    'vehicle_positions_unlinked', v_vehicle_positions_unlinked
  );
END;
$$;

REVOKE ALL ON FUNCTION public.anonymize_driver_personal_data(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anonymize_driver_personal_data(UUID, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.anonymize_driver_personal_data(UUID, TEXT) IS
  'Anonymises driver personal data after legal-hold checks while preserving transport and fiscal records.';
