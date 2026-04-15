-- Nieuwe traject-regel: splitsen op basis van het veld `afdeling` van de
-- boeking. De planner kiest bij NewOrder expliciet welke afdeling de order
-- aanstuurt. Waarde 'EXPORT' → 2-legs via hub (OPS pickup + EXPORT leg).
-- 'OPS' valt nog steeds in de default-regel (1 OPS-leg).
--
-- Prio 15 zit tussen de hub-tekst-regels (10, 20) en de default (1000).

INSERT INTO public.traject_rules
  (tenant_id, name, priority, is_active, match_conditions, legs_template)
SELECT
  t.id,
  'Afdeling=EXPORT → split OPS + EXPORT via hub',
  15,
  true,
  '{"afdeling_equals": "EXPORT"}'::jsonb,
  '[
    {"sequence":1,"from":"pickup","to":"hub","department_code":"OPS","leg_role":"OPS_PICKUP"},
    {"sequence":2,"from":"hub","to":"delivery","department_code":"EXPORT","leg_role":"EXPORT_LEG"}
  ]'::jsonb
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.traject_rules r
  WHERE r.tenant_id = t.id
    AND r.match_conditions ? 'afdeling_equals'
    AND r.match_conditions->>'afdeling_equals' = 'EXPORT'
);
