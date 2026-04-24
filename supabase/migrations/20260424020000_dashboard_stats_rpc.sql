-- Dashboard-tellers in één DB-call in plaats van de eerste 25 orders
-- client-side te aggregeren. Gebruikt de bestaande samengestelde indexen
-- (idx_orders_tenant_status, idx_orders_tenant_created) zodat het bij
-- miljoenen rijen index-scans blijven.
--
-- Retourneert één JSON-object met alle tellers die de KPI-strip en de
-- aiInsights-paneel op het dashboard nodig hebben. SECURITY INVOKER +
-- STABLE: RLS wordt toegepast, dus zonder current_tenant_id() = 0 rijen.

CREATE OR REPLACE FUNCTION public.dashboard_stats_v1()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      o.status,
      o.priority,
      o.weight_kg,
      o.created_at,
      o.time_window_end,
      CASE
        WHEN o.status IN ('DELIVERED', 'CANCELLED') THEN FALSE
        -- time_window_end kan "14:00" (tijd-van-de-dag) of een ISO-string zijn.
        -- Alleen het ISO-geval vergelijken met now(); "HH:MM" behandelen we net
        -- als de frontend: niet-parseable = niet overdue.
        WHEN o.time_window_end ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' THEN
          (o.time_window_end::timestamptz) < now()
        WHEN o.time_window_end IS NOT NULL THEN FALSE
        ELSE (o.created_at + CASE
          WHEN lower(coalesce(o.priority, 'normaal')) IN ('spoed', 'hoog') THEN interval '4 hours'
          ELSE interval '24 hours'
        END) < now()
      END AS is_overdue
    FROM public.orders o
  )
  SELECT jsonb_build_object(
    'total', count(*),
    'by_status', (
      SELECT coalesce(jsonb_object_agg(status, c), '{}'::jsonb)
      FROM (SELECT status, count(*) AS c FROM base GROUP BY status) s
    ),
    'overdue', count(*) FILTER (WHERE is_overdue),
    'total_weight_kg', coalesce(sum(weight_kg), 0),
    'spoed', count(*) FILTER (WHERE lower(coalesce(priority, '')) IN ('spoed', 'hoog')),
    'in_transit', count(*) FILTER (WHERE status = 'IN_TRANSIT'),
    'planned_or_in_transit', count(*) FILTER (WHERE status IN ('PLANNED', 'IN_TRANSIT')),
    'delivered', count(*) FILTER (WHERE status = 'DELIVERED'),
    'nieuw', count(*) FILTER (WHERE status IN ('DRAFT', 'PENDING', 'OPEN', 'WAITING', 'CONFIRMED'))
  )
  FROM base;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_stats_v1() TO authenticated;

COMMENT ON FUNCTION public.dashboard_stats_v1() IS
  'Aggregated dashboard counts (status breakdown, overdue, totals) scoped via RLS. O(indexscan) i.p.v. client-side tellen op eerste 25 rijen.';
