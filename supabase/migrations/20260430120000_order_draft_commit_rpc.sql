CREATE OR REPLACE FUNCTION public.commit_order_draft_v1(
  p_draft_id UUID,
  p_tenant_id UUID,
  p_expected_updated_at TIMESTAMPTZ,
  p_booking JSONB,
  p_payload JSONB,
  p_validation_result JSONB,
  p_manual_overrides JSONB,
  p_commit_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_draft public.order_drafts%ROWTYPE;
  v_rule public.traject_rules%ROWTYPE;
  v_rule_found BOOLEAN := false;
  v_rule_match BOOLEAN;
  v_has_check BOOLEAN;
  v_array_check BOOLEAN;
  v_status TEXT;
  v_source TEXT;
  v_hub_address TEXT := '';
  v_shipment public.shipments%ROWTYPE;
  v_leg JSONB;
  v_from TEXT;
  v_to TEXT;
  v_department_id UUID;
  v_orders JSONB := '[]'::jsonb;
  v_order public.orders%ROWTYPE;
  v_commit_key TEXT := COALESCE(NULLIF(p_commit_key, ''), 'draft:' || p_draft_id::text);
BEGIN
  IF p_draft_id IS NULL OR p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Draft en tenant zijn verplicht.';
  END IF;

  IF NOT public.user_has_tenant_access(p_tenant_id) THEN
    RAISE EXCEPTION 'Geen toegang tot tenant %.', p_tenant_id;
  END IF;

  SELECT *
    INTO v_draft
    FROM public.order_drafts
   WHERE id = p_draft_id
     AND tenant_id = p_tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Draft % bestaat niet of hoort niet bij deze tenant.', p_draft_id;
  END IF;

  IF v_draft.committed_shipment_id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(o) ORDER BY o.leg_number), '[]'::jsonb)
      INTO v_orders
      FROM public.orders o
     WHERE o.shipment_id = v_draft.committed_shipment_id
       AND o.tenant_id = p_tenant_id;

    RETURN jsonb_build_object(
      'idempotent', true,
      'shipment', (SELECT to_jsonb(s) FROM public.shipments s WHERE s.id = v_draft.committed_shipment_id),
      'legs', v_orders
    );
  END IF;

  IF p_expected_updated_at IS NOT NULL AND v_draft.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'DRAFT_CONFLICT: Deze order is zojuist aangepast door een andere sessie.';
  END IF;

  IF jsonb_array_length(COALESCE(p_validation_result->'blockers', '[]'::jsonb)) > 0 THEN
    RAISE EXCEPTION 'ORDER_NOT_READY: Draft bevat nog blocker-validaties.';
  END IF;

  v_status := upper(COALESCE(p_booking->>'status', 'READY_FOR_PLANNING'));
  IF v_status IN ('READY', 'READY_FOR_PLANNING') THEN
    v_status := 'PENDING';
  ELSIF v_status NOT IN ('DRAFT', 'PENDING', 'NEEDS_REVIEW', 'PLANNED') THEN
    v_status := 'PENDING';
  END IF;

  v_source := upper(COALESCE(p_booking->>'source', 'INTERN'));
  IF v_source IN ('MANUAL', 'HANDMATIG') THEN
    v_source := 'INTERN';
  ELSIF v_source NOT IN ('INTERN', 'EMAIL', 'PORTAL', 'EDI') THEN
    v_source := 'INTERN';
  END IF;

  FOR v_rule IN
    SELECT *
      FROM public.traject_rules
     WHERE tenant_id = p_tenant_id
       AND is_active = true
     ORDER BY priority ASC
  LOOP
    v_rule_match := true;
    v_has_check := false;

    IF COALESCE((v_rule.match_conditions->>'default')::boolean, false) THEN
      v_rule_found := true;
      EXIT;
    END IF;

    IF v_rule.match_conditions ? 'pickup_address_contains' THEN
      v_has_check := true;
      SELECT bool_or(lower(COALESCE(p_booking->>'pickup_address', '')) LIKE '%' || lower(value) || '%')
        INTO v_array_check
        FROM jsonb_array_elements_text(v_rule.match_conditions->'pickup_address_contains') AS value;
      v_rule_match := v_rule_match AND COALESCE(v_array_check, false);
    END IF;

    IF v_rule.match_conditions ? 'delivery_address_contains' THEN
      v_has_check := true;
      SELECT bool_or(lower(COALESCE(p_booking->>'delivery_address', '')) LIKE '%' || lower(value) || '%')
        INTO v_array_check
        FROM jsonb_array_elements_text(v_rule.match_conditions->'delivery_address_contains') AS value;
      v_rule_match := v_rule_match AND COALESCE(v_array_check, false);
    END IF;

    IF v_rule.match_conditions ? 'afdeling_equals' THEN
      v_has_check := true;
      v_rule_match := v_rule_match
        AND lower(COALESCE(p_booking->>'afdeling', '')) = lower(v_rule.match_conditions->>'afdeling_equals');
    END IF;

    IF v_has_check AND v_rule_match THEN
      v_rule_found := true;
      EXIT;
    END IF;
  END LOOP;

  IF NOT v_rule_found THEN
    RAISE EXCEPTION 'Geen traject-rule gevonden voor deze boeking. Configureer een default rule in traject_rules.';
  END IF;

  IF jsonb_array_length(COALESCE(v_rule.legs_template, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Traject-rule "%" heeft een leeg legs_template.', v_rule.name;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(v_rule.legs_template) leg
     WHERE leg->>'from' = 'hub'
        OR leg->>'to' = 'hub'
  ) THEN
    SELECT COALESCE(NULLIF(settings->>'rcs_hub_address', ''), 'Royalty Cargo Solutions, Schiphol')
      INTO v_hub_address
      FROM public.tenants
     WHERE id = p_tenant_id;
  END IF;

  INSERT INTO public.shipments (
    tenant_id,
    client_id,
    client_name,
    origin_address,
    destination_address,
    status,
    traject_rule_id,
    price_total_cents,
    pricing,
    contact_person,
    vehicle_type,
    client_reference,
    mrn_document,
    requires_tail_lift,
    pmt,
    cargo
  )
  VALUES (
    p_tenant_id,
    NULLIF(p_booking->>'client_id', '')::uuid,
    NULLIF(p_booking->>'client_name', ''),
    NULLIF(p_booking->>'pickup_address', ''),
    NULLIF(p_booking->>'delivery_address', ''),
    v_status,
    v_rule.id,
    NULLIF(p_booking->>'price_total_cents', '')::integer,
    p_booking->'pricing',
    NULLIF(p_booking->>'contact_person', ''),
    NULLIF(p_booking->>'vehicle_type', ''),
    NULLIF(p_booking->>'client_reference', ''),
    NULLIF(p_booking->>'mrn_document', ''),
    COALESCE((p_booking->>'requires_tail_lift')::boolean, false),
    p_booking->'pmt',
    p_booking->'cargo'
  )
  RETURNING * INTO v_shipment;

  FOR v_leg IN
    SELECT value
      FROM jsonb_array_elements(v_rule.legs_template)
     ORDER BY (value->>'sequence')::integer
  LOOP
    v_from := CASE v_leg->>'from'
      WHEN 'pickup' THEN NULLIF(p_booking->>'pickup_address', '')
      WHEN 'delivery' THEN NULLIF(p_booking->>'delivery_address', '')
      WHEN 'hub' THEN v_hub_address
      ELSE NULL
    END;

    v_to := CASE v_leg->>'to'
      WHEN 'pickup' THEN NULLIF(p_booking->>'pickup_address', '')
      WHEN 'delivery' THEN NULLIF(p_booking->>'delivery_address', '')
      WHEN 'hub' THEN v_hub_address
      ELSE NULL
    END;

    IF v_leg->>'from' = 'delivery'
       AND v_leg->>'to' = 'delivery'
       AND NULLIF(p_booking->>'final_delivery_address', '') IS NOT NULL THEN
      v_to := NULLIF(p_booking->>'final_delivery_address', '');
    END IF;

    SELECT id
      INTO v_department_id
      FROM public.departments
     WHERE tenant_id = p_tenant_id
       AND code = v_leg->>'department_code';

    IF v_department_id IS NULL THEN
      RAISE EXCEPTION 'Department "%" bestaat niet voor tenant %.', v_leg->>'department_code', p_tenant_id;
    END IF;

    INSERT INTO public.orders (
      tenant_id,
      shipment_id,
      department_id,
      leg_number,
      leg_role,
      pickup_address,
      delivery_address,
      client_id,
      client_name,
      source,
      status,
      weight_kg,
      quantity,
      unit,
      transport_type,
      priority,
      requirements,
      time_window_start,
      time_window_end,
      notes,
      reference,
      pickup_date,
      delivery_date,
      dimensions,
      attachments,
      pickup_street,
      pickup_house_number,
      pickup_house_number_suffix,
      pickup_zipcode,
      pickup_city,
      pickup_country,
      geocoded_pickup_lat,
      geocoded_pickup_lng,
      pickup_coords_manual,
      delivery_street,
      delivery_house_number,
      delivery_house_number_suffix,
      delivery_zipcode,
      delivery_city,
      delivery_country,
      geocoded_delivery_lat,
      geocoded_delivery_lng,
      delivery_coords_manual
    )
    VALUES (
      p_tenant_id,
      v_shipment.id,
      v_department_id,
      NULLIF(v_leg->>'sequence', '')::integer,
      NULLIF(v_leg->>'leg_role', ''),
      v_from,
      v_to,
      NULLIF(p_booking->>'client_id', '')::uuid,
      NULLIF(p_booking->>'client_name', ''),
      v_source,
      v_status,
      NULLIF(p_booking->>'weight_kg', '')::integer,
      NULLIF(p_booking->>'quantity', '')::integer,
      NULLIF(p_booking->>'unit', ''),
      NULLIF(p_booking->>'transport_type', ''),
      COALESCE(NULLIF(p_booking->>'priority', ''), 'normaal'),
      CASE
        WHEN jsonb_typeof(p_booking->'requirements') = 'array'
        THEN ARRAY(SELECT jsonb_array_elements_text(p_booking->'requirements'))
        ELSE NULL
      END,
      NULLIF(p_booking->>'pickup_time_window_start', ''),
      CASE
        WHEN v_leg->>'to' = 'delivery'
        THEN COALESCE(NULLIF(p_booking->>'delivery_time_window_end', ''), NULLIF(p_booking->>'pickup_time_window_end', ''))
        WHEN v_leg->>'to' = 'hub'
        THEN NULL
        ELSE NULLIF(p_booking->>'pickup_time_window_end', '')
      END,
      CASE
        WHEN v_leg->>'from' = 'pickup'
        THEN COALESCE(NULLIF(p_booking->>'pickup_notes', ''), NULLIF(p_booking->>'notes', ''))
        ELSE COALESCE(NULLIF(p_booking->>'delivery_notes', ''), NULLIF(p_booking->>'notes', ''))
      END,
      CASE
        WHEN v_leg->>'from' = 'pickup'
        THEN NULLIF(p_booking->>'pickup_reference', '')
        ELSE NULLIF(p_booking->>'delivery_reference', '')
      END,
      CASE
        WHEN v_leg->>'from' = 'pickup'
        THEN NULLIF(p_booking->>'pickup_date_str', '')::date
        ELSE NULLIF(p_booking->>'delivery_date_str', '')::date
      END,
      CASE
        WHEN v_leg->>'to' = 'delivery'
        THEN NULLIF(p_booking->>'delivery_date_str', '')::date
        ELSE NULL
      END,
      NULLIF(p_booking->>'dimensions', ''),
      jsonb_build_object(
        'readiness_status', COALESCE(p_booking->>'status', 'READY_FOR_PLANNING'),
        'manual_overrides', COALESCE(p_booking->'manual_overrides', 'null'::jsonb)
      ),
      CASE WHEN v_leg->>'from' = 'pickup' THEN NULLIF(p_booking->>'pickup_street', '') ELSE NULL END,
      CASE WHEN v_leg->>'from' = 'pickup' THEN NULLIF(p_booking->>'pickup_house_number', '') ELSE NULL END,
      CASE WHEN v_leg->>'from' = 'pickup' THEN NULLIF(p_booking->>'pickup_house_number_suffix', '') ELSE NULL END,
      CASE WHEN v_leg->>'from' = 'pickup' THEN NULLIF(p_booking->>'pickup_zipcode', '') ELSE NULL END,
      CASE WHEN v_leg->>'from' = 'pickup' THEN NULLIF(p_booking->>'pickup_city', '') ELSE NULL END,
      CASE WHEN v_leg->>'from' = 'pickup' THEN NULLIF(p_booking->>'pickup_country', '') ELSE NULL END,
      CASE WHEN v_leg->>'from' = 'pickup' THEN NULLIF(p_booking->>'pickup_lat', '')::numeric ELSE NULL END,
      CASE WHEN v_leg->>'from' = 'pickup' THEN NULLIF(p_booking->>'pickup_lng', '')::numeric ELSE NULL END,
      CASE WHEN v_leg->>'from' = 'pickup' THEN COALESCE((p_booking->>'pickup_coords_manual')::boolean, false) ELSE false END,
      CASE WHEN v_leg->>'to' = 'delivery' THEN NULLIF(p_booking->>'delivery_street', '') ELSE NULL END,
      CASE WHEN v_leg->>'to' = 'delivery' THEN NULLIF(p_booking->>'delivery_house_number', '') ELSE NULL END,
      CASE WHEN v_leg->>'to' = 'delivery' THEN NULLIF(p_booking->>'delivery_house_number_suffix', '') ELSE NULL END,
      CASE WHEN v_leg->>'to' = 'delivery' THEN NULLIF(p_booking->>'delivery_zipcode', '') ELSE NULL END,
      CASE WHEN v_leg->>'to' = 'delivery' THEN NULLIF(p_booking->>'delivery_city', '') ELSE NULL END,
      CASE WHEN v_leg->>'to' = 'delivery' THEN NULLIF(p_booking->>'delivery_country', '') ELSE NULL END,
      CASE WHEN v_leg->>'to' = 'delivery' THEN NULLIF(p_booking->>'delivery_lat', '')::numeric ELSE NULL END,
      CASE WHEN v_leg->>'to' = 'delivery' THEN NULLIF(p_booking->>'delivery_lng', '')::numeric ELSE NULL END,
      CASE WHEN v_leg->>'to' = 'delivery' THEN COALESCE((p_booking->>'delivery_coords_manual')::boolean, false) ELSE false END
    )
    RETURNING * INTO v_order;

    v_orders := v_orders || jsonb_build_array(to_jsonb(v_order));
  END LOOP;

  UPDATE public.order_drafts
     SET status = 'PENDING',
         payload = p_payload,
         validation_result = p_validation_result,
         manual_overrides = p_manual_overrides,
         committed_shipment_id = v_shipment.id,
         committed_at = now(),
         commit_idempotency_key = v_commit_key,
         validation_engine_version = COALESCE(validation_engine_version, 'order-readiness-v1'),
         pricing_engine_version = COALESCE(pricing_engine_version, 'pricing-v2-2026-04'),
         analytics = COALESCE(p_payload->'observability', '{}'::jsonb),
         updated_by = auth.uid()
   WHERE id = p_draft_id;

  RETURN jsonb_build_object(
    'idempotent', false,
    'shipment', to_jsonb(v_shipment),
    'legs', v_orders
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.commit_order_draft_v1(UUID, UUID, TIMESTAMPTZ, JSONB, JSONB, JSONB, JSONB, TEXT) TO authenticated;

COMMENT ON FUNCTION public.commit_order_draft_v1(UUID, UUID, TIMESTAMPTZ, JSONB, JSONB, JSONB, JSONB, TEXT) IS
  'Transactionele commit van order_draft naar shipment + order-legs. Lockt de draft, checkt updated_at/readiness, maakt shipment/orders en zet de immutable commit snapshot.';
