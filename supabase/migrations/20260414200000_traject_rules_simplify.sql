-- Simpeler traject-model na feedback van Operations:
--   • delivery = RCS export  → EXPORT (2 legs: OPS pickup + EXPORT placeholder)
--   • alle andere routes    → OPS (1 leg)
--
-- Daarom:
--   1. Update legs_template van `afdeling_equals=EXPORT`: leg-2 gaat van
--      `delivery → delivery` (placeholder RCS export → RCS export; wordt
--      later door Export aangepast naar Dubai/eindbestemming).
--   2. Deactiveer pickup-hub regel (prio 5) — niet meer nodig in dit model.
--   3. Deactiveer stale transport_type_equals-regel van vorige iteratie.

UPDATE public.traject_rules
   SET legs_template = '[
         {"sequence":1,"from":"pickup","to":"delivery","department_code":"OPS","leg_role":"OPS_PICKUP"},
         {"sequence":2,"from":"delivery","to":"delivery","department_code":"EXPORT","leg_role":"EXPORT_LEG"}
       ]'::jsonb,
       updated_at = now()
 WHERE match_conditions ? 'afdeling_equals'
   AND match_conditions->>'afdeling_equals' = 'EXPORT';

UPDATE public.traject_rules
   SET is_active = false, updated_at = now()
 WHERE match_conditions ? 'pickup_address_contains'
   AND is_active = true;

UPDATE public.traject_rules
   SET is_active = false, updated_at = now()
 WHERE match_conditions ? 'transport_type_equals'
   AND is_active = true;
