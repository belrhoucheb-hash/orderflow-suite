-- Operationele forecast-widget: aggregaties in de DB i.p.v. op de 6-rij-steekproef.
-- Retourneert:
--   planned_or_in_transit  = count(status IN ('PLANNED','IN_TRANSIT'))
--   active_order_count     = count(status NOT IN ('DELIVERED','CANCELLED'))
--   active_total_weight_kg = sum(weight_kg) over die actieve orders
--
-- NB: "totaal pallets" wordt niet meer berekend: de order_items-relatie bestaat
-- niet in de DB en de Order.items-array is in de frontend altijd leeg. Dat
-- veld zou dus sowieso nul zijn. De widget toont i.p.v. pallets voortaan
-- active_order_count en active_total_weight_kg.
--
-- Gebruikt idx_orders_tenant_status; SECURITY INVOKER + STABLE.

CREATE OR REPLACE FUNCTION public.dashboard_forecast_stats_v1()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'planned_or_in_transit', count(*) FILTER (WHERE status IN ('PLANNED', 'IN_TRANSIT')),
    'active_order_count', count(*) FILTER (WHERE status NOT IN ('DELIVERED', 'CANCELLED')),
    'active_total_weight_kg', coalesce(
      sum(weight_kg) FILTER (WHERE status NOT IN ('DELIVERED', 'CANCELLED')),
      0
    )
  )
  FROM public.orders;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_forecast_stats_v1() TO authenticated;

COMMENT ON FUNCTION public.dashboard_forecast_stats_v1() IS
  'Forecast-tellers voor het dashboard (geplande/actieve ritten en gewichten), tenant-gescoped via RLS.';
