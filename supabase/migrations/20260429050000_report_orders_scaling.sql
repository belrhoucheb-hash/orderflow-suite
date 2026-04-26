-- Rapportage op schaal: stuur geen volledige ordersets meer naar de browser
-- voor KPI's/charts, maar laat Postgres de aggregaties doen binnen de
-- geselecteerde periode. Daarnaast extra samengestelde indexen voor de
-- orderlijst-sorts/filters onder grotere tenants.

CREATE INDEX IF NOT EXISTS idx_orders_tenant_created_at_id_desc
  ON public.orders (tenant_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_status_created_at_id_desc
  ON public.orders (tenant_id, status, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_order_type_created_at_id_desc
  ON public.orders (tenant_id, order_type, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_department_created_at_id_desc
  ON public.orders (tenant_id, department_id, created_at DESC, id DESC)
  WHERE department_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_tenant_client_name_created_at_id_desc
  ON public.orders (tenant_id, client_name, created_at DESC, id DESC)
  WHERE client_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_tenant_weight_created_at_id_desc
  ON public.orders (tenant_id, weight_kg DESC, created_at DESC, id DESC)
  WHERE weight_kg IS NOT NULL;

CREATE OR REPLACE FUNCTION public.report_orders_overview_v1(
  p_start_date date,
  p_end_date date,
  p_compare_enabled boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT
      p_start_date::date AS start_date,
      p_end_date::date AS end_date,
      p_start_date::timestamptz AS start_ts,
      (p_end_date::date + 1)::timestamptz AS end_exclusive,
      GREATEST((p_end_date::date - p_start_date::date + 1), 1) AS span_days,
      date_trunc('week', p_end_date::timestamptz) AS anchor_week,
      date_trunc('month', p_end_date::timestamptz) AS anchor_month
  ),
  current_orders AS (
    SELECT
      o.id,
      o.created_at,
      o.updated_at,
      o.status,
      o.client_name,
      o.vehicle_id
    FROM public.orders o
    JOIN bounds b
      ON o.created_at >= b.start_ts
     AND o.created_at < b.end_exclusive
  ),
  previous_orders AS (
    SELECT
      o.id,
      o.created_at,
      o.updated_at,
      o.status,
      o.client_name,
      o.vehicle_id
    FROM public.orders o
    JOIN bounds b
      ON p_compare_enabled
     AND o.created_at >= (b.start_ts - make_interval(days => b.span_days::int))
     AND o.created_at < b.start_ts
  ),
  kpis AS (
    SELECT
      count(*)::int AS total_orders,
      round(
        avg(extract(epoch FROM (updated_at - created_at)) / 86400.0)
          FILTER (WHERE status = 'DELIVERED' AND updated_at IS NOT NULL),
        1
      ) AS avg_delivery_days
    FROM current_orders
  ),
  week_slots AS (
    SELECT
      (b.anchor_week - ((11 - slot) * interval '1 week')) AS week_start,
      b.span_days
    FROM bounds b
    CROSS JOIN generate_series(0, 11) AS slot
  ),
  week_metrics AS (
    SELECT
      ws.week_start::date AS week_start,
      (
        SELECT count(*)::int
        FROM current_orders co
        WHERE co.created_at >= ws.week_start
          AND co.created_at < ws.week_start + interval '1 week'
      ) AS orders,
      CASE
        WHEN p_compare_enabled THEN (
          SELECT count(*)::int
          FROM previous_orders po
          WHERE po.created_at >= ws.week_start - make_interval(days => ws.span_days::int)
            AND po.created_at < ws.week_start + interval '1 week' - make_interval(days => ws.span_days::int)
        )
        ELSE NULL
      END AS previous_orders
    FROM week_slots ws
    ORDER BY ws.week_start
  ),
  month_slots AS (
    SELECT
      (b.anchor_month - ((5 - slot) * interval '1 month')) AS month_start,
      b.span_days
    FROM bounds b
    CROSS JOIN generate_series(0, 5) AS slot
  ),
  month_metrics AS (
    SELECT
      ms.month_start::date AS month_start,
      (
        SELECT count(*)::int
        FROM current_orders co
        WHERE co.created_at >= ms.month_start
          AND co.created_at < ms.month_start + interval '1 month'
      ) AS orders,
      CASE
        WHEN p_compare_enabled THEN (
          SELECT count(*)::int
          FROM previous_orders po
          WHERE po.created_at >= ms.month_start - make_interval(days => ms.span_days::int)
            AND po.created_at < ms.month_start + interval '1 month' - make_interval(days => ms.span_days::int)
        )
        ELSE NULL
      END AS previous_orders
    FROM month_slots ms
    ORDER BY ms.month_start
  ),
  top_clients AS (
    SELECT
      coalesce(client_name, 'Onbekend') AS name,
      count(*)::int AS count
    FROM current_orders
    GROUP BY coalesce(client_name, 'Onbekend')
    ORDER BY count DESC, name ASC
    LIMIT 10
  ),
  status_distribution AS (
    SELECT
      coalesce(status, 'UNKNOWN') AS status,
      count(*)::int AS value
    FROM current_orders
    GROUP BY coalesce(status, 'UNKNOWN')
    ORDER BY value DESC, status ASC
  ),
  vehicle_orders AS (
    SELECT
      vehicle_id,
      count(*)::int AS count
    FROM current_orders
    WHERE vehicle_id IS NOT NULL
    GROUP BY vehicle_id
    ORDER BY count DESC, vehicle_id
  )
  SELECT jsonb_build_object(
    'kpis', (
      SELECT jsonb_build_object(
        'totalOrders', coalesce(total_orders, 0),
        'avgDeliveryDays', avg_delivery_days
      )
      FROM kpis
    ),
    'ordersPerWeek', (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'week_start', week_start,
            'orders', orders,
            'previous_orders', previous_orders
          )
          ORDER BY week_start
        ),
        '[]'::jsonb
      )
      FROM week_metrics
    ),
    'ordersPerMonth', (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'month_start', month_start,
            'orders', orders,
            'previous_orders', previous_orders
          )
          ORDER BY month_start
        ),
        '[]'::jsonb
      )
      FROM month_metrics
    ),
    'topClients', (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'name', name,
            'count', count
          )
          ORDER BY count DESC, name ASC
        ),
        '[]'::jsonb
      )
      FROM top_clients
    ),
    'statusDistribution', (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'status', status,
            'value', value
          )
          ORDER BY value DESC, status ASC
        ),
        '[]'::jsonb
      )
      FROM status_distribution
    ),
    'vehicleOrders', (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'vehicle_id', vehicle_id,
            'count', count
          )
          ORDER BY count DESC, vehicle_id
        ),
        '[]'::jsonb
      )
      FROM vehicle_orders
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.report_orders_overview_v1(date, date, boolean) TO authenticated;

COMMENT ON FUNCTION public.report_orders_overview_v1(date, date, boolean) IS
  'Aggregated report payload for KPI/charts/top-clients, scoped via RLS and bounded by date range so the browser does not fetch the full orders table.';
