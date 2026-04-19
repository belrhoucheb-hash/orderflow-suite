-- ──────────────────────────────────────────────────────────────────────────
-- Audit-view voor handmatig vrijgegeven voertuigchecks (RELEASED)
--
-- Geeft compliance/planner inzicht in wie wanneer welke check heeft
-- vrijgegeven ondanks gevonden schade, inclusief aantal damage-events dat
-- in die check is ontdekt.
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.vehicle_check_release_audit
WITH (security_invoker = true)
AS
SELECT
  vc.id,
  vc.tenant_id,
  vc.vehicle_id,
  v.code  AS vehicle_code,
  vc.driver_id,
  d.name  AS driver_name,
  vc.completed_at,
  vc.released_at,
  vc.released_by,
  vc.release_reason,
  (
    SELECT count(*)::INT
    FROM public.vehicle_damage_events de
    WHERE de.discovered_in_check_id = vc.id
  ) AS damage_count
FROM public.vehicle_checks vc
LEFT JOIN public.vehicles v ON v.id = vc.vehicle_id
LEFT JOIN public.drivers  d ON d.id = vc.driver_id
WHERE vc.released_at IS NOT NULL
ORDER BY vc.released_at DESC;

COMMENT ON VIEW public.vehicle_check_release_audit IS
  'Audit-trail van RELEASED voertuigchecks. security_invoker laat onderliggende RLS gelden, dus alleen checks uit de eigen tenant zijn zichtbaar.';

GRANT SELECT ON public.vehicle_check_release_audit TO authenticated, service_role;
