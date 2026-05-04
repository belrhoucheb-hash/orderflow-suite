-- Reduce planbord I/O by bundling the high-fanout day load into one
-- tenant-scoped RPC and adding the indexes that match the day filters.

CREATE INDEX IF NOT EXISTS idx_consolidation_groups_tenant_planned_status
  ON public.consolidation_groups (tenant_id, planned_date, status, created_at);

CREATE INDEX IF NOT EXISTS idx_consolidation_orders_group_order
  ON public.consolidation_orders (group_id, order_id, stop_sequence);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_delivery_pending_unassigned
  ON public.orders (tenant_id, delivery_date, status, vehicle_id, id)
  WHERE status = 'PENDING' AND vehicle_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_trips_dispatch_status_start
  ON public.trips (dispatch_status, planned_start_time, id)
  WHERE dispatch_status IN ('VERZONDEN', 'GEACCEPTEERD', 'ACTIEF');

CREATE INDEX IF NOT EXISTS idx_vehicle_positions_trip_recorded
  ON public.vehicle_positions (trip_id, recorded_at DESC)
  WHERE trip_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vehicle_positions_vehicle_recorded
  ON public.vehicle_positions (vehicle_id, recorded_at DESC)
  WHERE vehicle_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.planning_board_v1(
  p_tenant_id uuid,
  p_date date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH active_groups AS (
    SELECT
      g.id,
      g.tenant_id,
      g.name,
      g.planned_date,
      g.status,
      g.vehicle_id,
      g.driver_id,
      g.total_weight_kg,
      g.total_pallets,
      g.total_distance_km,
      g.estimated_duration_min,
      g.utilization_pct,
      g.proposal_source,
      g.capacity_override_reason,
      g.capacity_override_by,
      g.capacity_override_at,
      g.created_by,
      g.created_at,
      g.updated_at,
      CASE
        WHEN v.id IS NULL THEN NULL
        ELSE jsonb_build_object(
          'name', v.name,
          'plate', v.plate,
          'capacity_kg', v.capacity_kg,
          'capacity_pallets', v.capacity_pallets
        )
      END AS vehicle,
      coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', co.id,
            'group_id', co.group_id,
            'order_id', co.order_id,
            'stop_sequence', co.stop_sequence,
            'pickup_sequence', co.pickup_sequence,
            'created_at', co.created_at,
            'order', jsonb_build_object(
              'id', o.id,
              'order_number', o.order_number,
              'client_name', o.client_name,
              'pickup_address', o.pickup_address,
              'delivery_address', o.delivery_address,
              'pickup_country', o.pickup_country,
              'delivery_country', o.delivery_country,
              'weight_kg', o.weight_kg,
              'quantity', o.quantity,
              'requirements', o.requirements,
              'time_window_start', o.time_window_start,
              'time_window_end', o.time_window_end
            )
          )
          ORDER BY co.stop_sequence NULLS LAST, co.created_at
        )
        FROM public.consolidation_orders co
        JOIN public.orders o ON o.id = co.order_id
        WHERE co.group_id = g.id
      ), '[]'::jsonb) AS consolidation_orders
    FROM public.consolidation_groups g
    LEFT JOIN public.vehicles v ON v.id = g.vehicle_id
    WHERE g.tenant_id = p_tenant_id
      AND g.planned_date = p_date
      AND g.status <> 'VERWORPEN'
    ORDER BY g.created_at
  ),
  locked_orders AS (
    SELECT DISTINCT co.order_id
    FROM public.consolidation_orders co
    JOIN active_groups g ON g.id = co.group_id
  ),
  open_orders AS (
    SELECT
      o.id,
      o.order_number,
      o.client_name,
      o.pickup_address,
      o.delivery_address,
      o.pickup_country,
      o.delivery_country,
      o.weight_kg,
      o.quantity,
      o.requirements
    FROM public.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.delivery_date = p_date
      AND o.status = 'PENDING'
      AND o.vehicle_id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM locked_orders lo
        WHERE lo.order_id = o.id
      )
    ORDER BY o.created_at DESC, o.id DESC
  )
  SELECT jsonb_build_object(
    'groups', coalesce((SELECT jsonb_agg(to_jsonb(g) ORDER BY g.created_at) FROM active_groups g), '[]'::jsonb),
    'open_orders', coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.order_number) FROM open_orders o), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.planning_board_v1(uuid, date) TO authenticated;

COMMENT ON FUNCTION public.planning_board_v1(uuid, date) IS
  'Returns all planbord clusters and open orders for one day in one compact tenant-scoped payload.';
