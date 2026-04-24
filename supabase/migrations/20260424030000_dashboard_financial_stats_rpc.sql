-- Financiele KPI-widget: aggregaties in de DB i.p.v. op de 6-rij-steekproef.
-- Retourneert:
--   planned_trips          = count(status = 'IN_TRANSIT')
--   total_weight_kg        = sum(weight_kg) over alle orders
--   active_total_weight_kg = sum(weight_kg) over orders die niet DELIVERED/CANCELLED zijn
--
-- NB: geraamde omzet en kosten-per-km worden (nog) niet server-side berekend
-- omdat er geen price_total_*-kolom op orders bestaat en shipments.price_total_cents
-- niet 1:1 aan een order gekoppeld is. De widget gebruikt daarvoor nog steeds
-- forfait-waarden. Die beslissing ligt buiten scope van deze migratie.
--
-- Gebruikt idx_orders_tenant_status; SECURITY INVOKER + STABLE zodat RLS
-- tenant-scoped werkt.

CREATE OR REPLACE FUNCTION public.dashboard_financial_stats_v1()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'planned_trips', count(*) FILTER (WHERE status = 'IN_TRANSIT'),
    'total_weight_kg', coalesce(sum(weight_kg), 0),
    'active_total_weight_kg', coalesce(
      sum(weight_kg) FILTER (WHERE status NOT IN ('DELIVERED', 'CANCELLED')),
      0
    )
  )
  FROM public.orders;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_financial_stats_v1() TO authenticated;

COMMENT ON FUNCTION public.dashboard_financial_stats_v1() IS
  'Financial KPI-tellers voor het dashboard (actieve ritten, totaal gewicht, actief gewicht), tenant-gescoped via RLS.';
