-- ══════════════════════════════════════════════════════════════════════════
-- Sprint 3, CP-03 / CP-04. Uitbreiding consolidation_groups voor auto-plan
-- voorstellen en auditbaarheid van laadvermogen-override.
--
-- - proposal_source: onderscheid tussen handmatig aangemaakt cluster en
--   auto-plan voorstel. Auto-plan reset alleen zijn eigen VOORSTEL-rijen
--   bij re-run, handmatige clusters blijven intact (idempotentie-regel).
-- - driver_id: een cluster krijgt direct een chauffeur toegewezen, zodat
--   de swim-lane per chauffeur (CP-07) kan renderen vóór trip-aanmaak.
-- - capacity_override_*: wanneer planner bewust op vol voertuig dropt,
--   verplicht reden-veld en audit-trail via pipeline_events.
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.consolidation_groups
  ADD COLUMN IF NOT EXISTS driver_id                UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS proposal_source          TEXT NOT NULL DEFAULT 'manual'
                                                      CHECK (proposal_source IN ('manual','auto')),
  ADD COLUMN IF NOT EXISTS capacity_override_reason TEXT,
  ADD COLUMN IF NOT EXISTS capacity_override_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS capacity_override_at     TIMESTAMPTZ;

COMMENT ON COLUMN public.consolidation_groups.driver_id IS
  'Chauffeur gekoppeld aan dit cluster. Gebruikt door swim-lane render (CP-07).';
COMMENT ON COLUMN public.consolidation_groups.proposal_source IS
  'manual = planner zelf aangemaakt, auto = door auto-plan-engine voorgesteld.';
COMMENT ON COLUMN public.consolidation_groups.capacity_override_reason IS
  'Verplicht gevuld wanneer planner een order toevoegt terwijl voertuig vol is (CP-04).';

CREATE INDEX IF NOT EXISTS idx_consolidation_groups_driver_date
  ON public.consolidation_groups (driver_id, planned_date)
  WHERE driver_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_consolidation_groups_auto_proposals
  ON public.consolidation_groups (tenant_id, planned_date, status)
  WHERE proposal_source = 'auto';

-- ─── ROLLBACK ─────────────────────────────────────────────────
-- DROP INDEX IF EXISTS idx_consolidation_groups_auto_proposals;
-- DROP INDEX IF EXISTS idx_consolidation_groups_driver_date;
-- ALTER TABLE public.consolidation_groups
--   DROP COLUMN IF EXISTS capacity_override_at,
--   DROP COLUMN IF EXISTS capacity_override_by,
--   DROP COLUMN IF EXISTS capacity_override_reason,
--   DROP COLUMN IF EXISTS proposal_source,
--   DROP COLUMN IF EXISTS driver_id;