-- IMPORT afdeling + traject-regel.
--
-- Nieuwe afdeling 'IMPORT' naast de bestaande OPS/EXPORT. Wordt gekozen
-- (of auto-inferred) wanneer de pickup op RCS Import Schiphol ligt.
-- Levert één single-leg order met department=IMPORT.
--
-- Prio 15 (zelfde laag als EXPORT-afdeling-regel): tussen de hub-tekst-
-- regels (10, 20) en de default (1000). afdeling_equals is eenduidig,
-- dus conflicten met EXPORT zijn uitgesloten.

-- ─── Departments ─────────────────────────────────────────────────────────
INSERT INTO public.departments (tenant_id, code, name, color)
SELECT t.id, 'IMPORT', 'Import', '#10b981'
FROM public.tenants t
ON CONFLICT (tenant_id, code) DO NOTHING;

-- ─── Traject rule ────────────────────────────────────────────────────────
INSERT INTO public.traject_rules
  (tenant_id, name, priority, is_active, match_conditions, legs_template)
SELECT
  t.id,
  'Afdeling=IMPORT → single IMPORT leg',
  15,
  true,
  '{"afdeling_equals": "IMPORT"}'::jsonb,
  '[
    {"sequence":1,"from":"pickup","to":"delivery","department_code":"IMPORT","leg_role":"SINGLE"}
  ]'::jsonb
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.traject_rules r
  WHERE r.tenant_id = t.id
    AND r.match_conditions ? 'afdeling_equals'
    AND r.match_conditions->>'afdeling_equals' = 'IMPORT'
);
