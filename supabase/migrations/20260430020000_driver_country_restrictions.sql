-- Chauffeur landrestricties: landen waar een chauffeur niet of alleen met waarschuwing mag rijden.

CREATE TABLE IF NOT EXISTS public.driver_country_restrictions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  country_code text NOT NULL,
  restriction_type text NOT NULL DEFAULT 'block',
  reason text,
  active_from date,
  active_until date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driver_country_restrictions_country_code_chk
    CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT driver_country_restrictions_type_chk
    CHECK (restriction_type = ANY (ARRAY['block'::text, 'warning'::text])),
  CONSTRAINT driver_country_restrictions_date_range_chk
    CHECK (active_until IS NULL OR active_from IS NULL OR active_until >= active_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS driver_country_restrictions_driver_country_uniq
  ON public.driver_country_restrictions (tenant_id, driver_id, country_code);

CREATE INDEX IF NOT EXISTS idx_driver_country_restrictions_tenant_driver
  ON public.driver_country_restrictions (tenant_id, driver_id)
  WHERE is_active = true;

DROP TRIGGER IF EXISTS update_driver_country_restrictions_updated_at ON public.driver_country_restrictions;
CREATE TRIGGER update_driver_country_restrictions_updated_at
  BEFORE UPDATE ON public.driver_country_restrictions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.driver_country_restrictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation: driver_country_restrictions SELECT" ON public.driver_country_restrictions;
CREATE POLICY "Tenant isolation: driver_country_restrictions SELECT"
  ON public.driver_country_restrictions
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "Tenant isolation: driver_country_restrictions INSERT" ON public.driver_country_restrictions;
CREATE POLICY "Tenant isolation: driver_country_restrictions INSERT"
  ON public.driver_country_restrictions
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "Tenant isolation: driver_country_restrictions UPDATE" ON public.driver_country_restrictions;
CREATE POLICY "Tenant isolation: driver_country_restrictions UPDATE"
  ON public.driver_country_restrictions
  FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "Tenant isolation: driver_country_restrictions DELETE" ON public.driver_country_restrictions;
CREATE POLICY "Tenant isolation: driver_country_restrictions DELETE"
  ON public.driver_country_restrictions
  FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id());

GRANT ALL ON TABLE public.driver_country_restrictions TO authenticated;
GRANT ALL ON TABLE public.driver_country_restrictions TO service_role;

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
  v_block RECORD;
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

  SELECT
    r.country_code,
    r.reason,
    o.order_number
  INTO v_block
  FROM public.driver_country_restrictions r
  JOIN public.consolidation_orders co ON co.group_id = p_group_id
  JOIN public.orders o ON o.id = co.order_id
  WHERE r.tenant_id = v_group.tenant_id
    AND r.driver_id = v_group.driver_id
    AND r.is_active = true
    AND r.restriction_type = 'block'
    AND (r.active_from IS NULL OR r.active_from <= v_group.planned_date)
    AND (r.active_until IS NULL OR r.active_until >= v_group.planned_date)
    AND (
      r.country_code IN (upper(coalesce(o.pickup_country, '')), upper(coalesce(o.delivery_country, '')))
      OR (
        r.country_code = 'NL'
        AND (' ' || regexp_replace(upper(coalesce(o.pickup_address, '') || ' ' || coalesce(o.delivery_address, '')), '[^A-Z]+', ' ', 'g') || ' ')
          ~ ' (NL|NEDERLAND|NETHERLANDS) '
      )
      OR (
        r.country_code = 'BE'
        AND (' ' || regexp_replace(upper(coalesce(o.pickup_address, '') || ' ' || coalesce(o.delivery_address, '')), '[^A-Z]+', ' ', 'g') || ' ')
          ~ ' (BE|BELGIE|BELGIUM) '
      )
      OR (
        r.country_code = 'DE'
        AND (' ' || regexp_replace(upper(coalesce(o.pickup_address, '') || ' ' || coalesce(o.delivery_address, '')), '[^A-Z]+', ' ', 'g') || ' ')
          ~ ' (DE|DUITSLAND|DEUTSCHLAND|GERMANY) '
      )
      OR (
        r.country_code = 'FR'
        AND (' ' || regexp_replace(upper(coalesce(o.pickup_address, '') || ' ' || coalesce(o.delivery_address, '')), '[^A-Z]+', ' ', 'g') || ' ')
          ~ ' (FR|FRANKRIJK|FRANCE) '
      )
      OR (
        r.country_code = 'LU'
        AND (' ' || regexp_replace(upper(coalesce(o.pickup_address, '') || ' ' || coalesce(o.delivery_address, '')), '[^A-Z]+', ' ', 'g') || ' ')
          ~ ' (LU|LUXEMBURG|LUXEMBOURG) '
      )
    )
  ORDER BY o.order_number
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Landblokkade: chauffeur mag niet naar % rijden voor order %',
      v_block.country_code,
      v_block.order_number
      USING DETAIL = coalesce(v_block.reason, 'Geen reden vastgelegd');
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

GRANT EXECUTE ON FUNCTION public.confirm_consolidation_group(UUID) TO authenticated, service_role;
