-- ══════════════════════════════════════════════════════════════════════════
-- Sprint 3, CP-03 / CP-04. RPC's voor cluster-lifecycle in planbord v2.
--
-- confirm_consolidation_group : VOORSTEL of GOEDGEKEURD wordt INGEPLAND,
--                                creëert trip + trip_stops, update orders.
-- reject_consolidation_group  : zet VERWORPEN, orders blijven ongepland.
-- record_capacity_override    : vult capacity_override_* velden op de cluster
--                                als auditbaar bewijs van CP-04 override.
--
-- Alle RPC's zijn SECURITY DEFINER met strikte tenant-check via
-- get_user_tenant_id(), zodat authenticated users geen clusters van andere
-- tenants kunnen bevestigen via gespoofde group-id.
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.confirm_consolidation_group(p_group_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID;
  v_group  public.consolidation_groups%ROWTYPE;
  v_trip_id UUID;
  v_order RECORD;
  v_seq INTEGER := 1;
BEGIN
  SELECT * INTO v_group FROM public.consolidation_groups WHERE id = p_group_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cluster % bestaat niet', p_group_id;
  END IF;

  v_tenant := public.get_user_tenant_id();
  IF v_tenant IS NOT NULL AND v_tenant <> v_group.tenant_id THEN
    RAISE EXCEPTION 'Geen toegang tot cluster van andere tenant';
  END IF;

  IF v_group.status = 'INGEPLAND' THEN
    RAISE EXCEPTION 'Cluster is al ingepland als trip';
  END IF;
  IF v_group.vehicle_id IS NULL OR v_group.driver_id IS NULL THEN
    RAISE EXCEPTION 'Cluster mist voertuig of chauffeur';
  END IF;

  INSERT INTO public.trips (
    tenant_id, vehicle_id, driver_id, planned_date,
    dispatch_status, total_distance_km, total_duration_min,
    dispatcher_id, notes
  ) VALUES (
    v_group.tenant_id, v_group.vehicle_id, v_group.driver_id, v_group.planned_date,
    'CONCEPT', v_group.total_distance_km, v_group.estimated_duration_min,
    auth.uid(), 'Aangemaakt uit cluster ' || v_group.name
  )
  RETURNING id INTO v_trip_id;

  -- Orders koppelen en trip_stops aanmaken in sequentie-volgorde.
  FOR v_order IN
    SELECT co.order_id, co.stop_sequence, o.pickup_address, o.delivery_address,
           o.pickup_time_window_start, o.pickup_time_window_end,
           o.delivery_time_window_start, o.delivery_time_window_end
    FROM public.consolidation_orders co
    JOIN public.orders o ON o.id = co.order_id
    WHERE co.group_id = p_group_id
    ORDER BY COALESCE(co.stop_sequence, 9999), o.id
  LOOP
    INSERT INTO public.trip_stops (
      trip_id, order_id, stop_type, stop_sequence,
      planned_address, planned_window_start, planned_window_end
    ) VALUES (
      v_trip_id, v_order.order_id, 'PICKUP', v_seq,
      v_order.pickup_address,
      NULLIF(v_order.pickup_time_window_start, '')::time,
      NULLIF(v_order.pickup_time_window_end, '')::time
    );
    v_seq := v_seq + 1;

    INSERT INTO public.trip_stops (
      trip_id, order_id, stop_type, stop_sequence,
      planned_address, planned_window_start, planned_window_end
    ) VALUES (
      v_trip_id, v_order.order_id, 'DELIVERY', v_seq,
      v_order.delivery_address,
      NULLIF(v_order.delivery_time_window_start, '')::time,
      NULLIF(v_order.delivery_time_window_end, '')::time
    );
    v_seq := v_seq + 1;

    UPDATE public.orders
    SET status = 'PLANNED',
        vehicle_id = v_group.vehicle_id,
        driver_id = v_group.driver_id,
        stop_sequence = v_order.stop_sequence
    WHERE id = v_order.order_id;
  END LOOP;

  UPDATE public.consolidation_groups
  SET status = 'INGEPLAND', updated_at = now()
  WHERE id = p_group_id;

  RETURN v_trip_id;
END;
$$;

COMMENT ON FUNCTION public.confirm_consolidation_group(UUID) IS
  'Zet cluster naar INGEPLAND, creëert trip + trip_stops (pickup dan delivery per order), update orders.';

-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reject_consolidation_group(
  p_group_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID;
  v_group_tenant UUID;
BEGIN
  SELECT tenant_id INTO v_group_tenant FROM public.consolidation_groups WHERE id = p_group_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cluster % bestaat niet', p_group_id;
  END IF;

  v_tenant := public.get_user_tenant_id();
  IF v_tenant IS NOT NULL AND v_tenant <> v_group_tenant THEN
    RAISE EXCEPTION 'Geen toegang tot cluster van andere tenant';
  END IF;

  UPDATE public.consolidation_groups
  SET status = 'VERWORPEN',
      updated_at = now()
  WHERE id = p_group_id;
END;
$$;

COMMENT ON FUNCTION public.reject_consolidation_group(UUID, TEXT) IS
  'Zet cluster naar VERWORPEN. Orders keren terug naar Open te plannen.';

-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_capacity_override(
  p_group_id UUID,
  p_reason   TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID;
  v_group_tenant UUID;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Reden is verplicht bij laadvermogen-override';
  END IF;

  SELECT tenant_id INTO v_group_tenant FROM public.consolidation_groups WHERE id = p_group_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cluster % bestaat niet', p_group_id;
  END IF;

  v_tenant := public.get_user_tenant_id();
  IF v_tenant IS NOT NULL AND v_tenant <> v_group_tenant THEN
    RAISE EXCEPTION 'Geen toegang tot cluster van andere tenant';
  END IF;

  UPDATE public.consolidation_groups
  SET capacity_override_reason = p_reason,
      capacity_override_by = auth.uid(),
      capacity_override_at = now(),
      updated_at = now()
  WHERE id = p_group_id;
END;
$$;

COMMENT ON FUNCTION public.record_capacity_override(UUID, TEXT) IS
  'Zet capacity_override_* velden op de cluster met verplicht reden-veld (CP-04 audit-trail).';

GRANT EXECUTE ON FUNCTION public.confirm_consolidation_group(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_consolidation_group(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_capacity_override(UUID, TEXT) TO authenticated, service_role;

-- ─── ROLLBACK ─────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.record_capacity_override(UUID, TEXT);
-- DROP FUNCTION IF EXISTS public.reject_consolidation_group(UUID, TEXT);
-- DROP FUNCTION IF EXISTS public.confirm_consolidation_group(UUID);