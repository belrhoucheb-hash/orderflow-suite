-- Nieuwe traject-regel: zodra een boeking `transport_type = 'EXPORT'` heeft,
-- splitsen we automatisch in 2 legs via de hub (OPS pickup + EXPORT). Zo kan
-- een planner `hoofdweg 1 → dubai` invoeren als één shipment en krijgt 'ie
-- netjes 2 legs binnen dezelfde shipment.
--
-- Prio 15 zit tussen de hub-tekst-regels (10, 20) en de default (1000) —
-- specifieke hub-adres-match wint nog steeds, maar voor alle andere
-- export-boekingen pakt deze regel het.

INSERT INTO public.traject_rules
  (tenant_id, name, priority, is_active, match_conditions, legs_template)
SELECT
  t.id,
  'Export transport-type → split OPS + EXPORT via hub',
  15,
  true,
  '{"transport_type_equals": "EXPORT"}'::jsonb,
  '[
    {"sequence":1,"from":"pickup","to":"hub","department_code":"OPS","leg_role":"OPS_PICKUP"},
    {"sequence":2,"from":"hub","to":"delivery","department_code":"EXPORT","leg_role":"EXPORT_LEG"}
  ]'::jsonb
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.traject_rules r
  WHERE r.tenant_id = t.id
    AND r.match_conditions ? 'transport_type_equals'
    AND r.match_conditions->>'transport_type_equals' = 'EXPORT'
);
