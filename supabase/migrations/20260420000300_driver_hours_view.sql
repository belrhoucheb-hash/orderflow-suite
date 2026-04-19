-- ══════════════════════════════════════════════════════════════════════════
-- Sprint 3, CP-06. View driver_hours_per_week.
--
-- Aggregeert geplande rijd-duur per chauffeur per ISO-week. Gebruikt door
-- auto-plan om niet structureel over contracturen heen te plannen, en door
-- CP-07 swim-lane om "X / Y uur gepland" te tonen.
--
-- Bron is trips.total_duration_min, gevuld bij trip-aanmaak en bij
-- route-herberekening. AFGEBROKEN en GEWEIGERD trips tellen niet mee.
-- SECURITY INVOKER (default voor views) zodat onderliggende trips-RLS geldt.
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.driver_hours_per_week AS
SELECT
  t.tenant_id,
  t.driver_id,
  to_char(t.planned_date, 'IYYY-"W"IW')                 AS iso_week,
  date_trunc('week', t.planned_date)::date              AS week_start,
  SUM(COALESCE(t.total_duration_min, 0)) / 60.0         AS planned_hours,
  d.contract_hours_per_week                             AS contract_hours
FROM public.trips t
LEFT JOIN public.drivers d ON d.id = t.driver_id
WHERE t.driver_id IS NOT NULL
  AND t.dispatch_status NOT IN ('AFGEBROKEN','GEWEIGERD')
GROUP BY t.tenant_id, t.driver_id, t.planned_date, d.contract_hours_per_week;

COMMENT ON VIEW public.driver_hours_per_week IS
  'Geplande uren per chauffeur per ISO-week. Bron: trips.total_duration_min. Contract_hours komt uit drivers (Sprint 5 vervangt door Nmbrs).';

-- ─── ROLLBACK ─────────────────────────────────────────────────
-- DROP VIEW IF EXISTS public.driver_hours_per_week;