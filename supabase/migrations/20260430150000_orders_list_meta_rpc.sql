-- Bundled metadata for the Orders list. This replaces multiple client-side
-- count/head requests on refresh with one tenant-scoped RPC.

CREATE OR REPLACE FUNCTION public.orders_list_meta_v1(
  p_status_filter text DEFAULT NULL,
  p_order_type_filter text DEFAULT NULL,
  p_department_filter uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_search_order_number bigint DEFAULT NULL,
  p_created_before timestamptz DEFAULT NULL,
  p_stale_threshold_hours integer DEFAULT 2
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH params AS (
    SELECT now() - make_interval(hours => greatest(coalesce(p_stale_threshold_hours, 2), 0)) AS stale_cutoff
  ),
  filtered AS (
    SELECT
      CASE
        WHEN o.status IN ('PENDING', 'OPEN', 'WAITING', 'CONFIRMED') THEN 'PENDING'
        ELSE coalesce(o.status, 'UNKNOWN')
      END AS normalized_status,
      coalesce(o.weight_kg, 0) AS weight_kg,
      coalesce(o.priority, '') AS priority,
      coalesce(o.info_status, '') AS info_status
    FROM public.orders o
    WHERE (p_status_filter IS NULL OR (
      p_status_filter = 'PENDING' AND o.status IN ('PENDING', 'OPEN', 'WAITING', 'CONFIRMED')
    ) OR (
      p_status_filter <> 'PENDING' AND o.status = p_status_filter
    ))
      AND (p_order_type_filter IS NULL OR o.order_type = p_order_type_filter)
      AND (p_department_filter IS NULL OR o.department_id = p_department_filter)
      AND (p_created_before IS NULL OR o.created_at < p_created_before)
      AND (
        p_search IS NULL
        OR o.client_name ILIKE '%' || p_search || '%'
        OR o.pickup_address ILIKE '%' || p_search || '%'
        OR o.delivery_address ILIKE '%' || p_search || '%'
        OR (p_search_order_number IS NOT NULL AND o.order_number = p_search_order_number)
      )
  ),
  status_counts AS (
    SELECT coalesce(jsonb_object_agg(normalized_status, status_count), '{}'::jsonb) AS by_status
    FROM (
      SELECT normalized_status, count(*) AS status_count
      FROM filtered
      GROUP BY normalized_status
    ) s
  ),
  stale AS (
    SELECT count(*) AS stale_draft_count, (SELECT stale_cutoff FROM params) AS stale_cutoff
    FROM public.orders o, params
    WHERE o.status = 'DRAFT'
      AND o.created_at < params.stale_cutoff
  )
  SELECT jsonb_build_object(
    'total_count', (SELECT count(*) FROM filtered),
    'by_status', (SELECT by_status FROM status_counts),
    'awaiting_info_count', (
      SELECT count(*) FROM filtered WHERE info_status IN ('AWAITING_INFO', 'OVERDUE')
    ),
    'overdue_info_count', (
      SELECT count(*) FROM filtered WHERE info_status = 'OVERDUE'
    ),
    'priority_count', (
      SELECT count(*) FROM filtered WHERE lower(priority) IN ('spoed', 'hoog')
    ),
    'total_weight_kg', (
      SELECT coalesce(sum(weight_kg), 0) FROM filtered
    ),
    'stale_draft_count', (SELECT stale_draft_count FROM stale),
    'stale_draft_cutoff_iso', (SELECT stale_cutoff FROM stale)
  );
$$;

GRANT EXECUTE ON FUNCTION public.orders_list_meta_v1(text, text, uuid, text, bigint, timestamptz, integer) TO authenticated;

COMMENT ON FUNCTION public.orders_list_meta_v1(text, text, uuid, text, bigint, timestamptz, integer) IS
  'Returns bundled Orders-list counters and KPI metadata, scoped via orders RLS.';
