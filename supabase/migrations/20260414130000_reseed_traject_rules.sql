-- ──────────────────────────────────────────────────────────────────────────
-- Re-seed: zorg dat ELKE tenant (ook nieuwe) de 3 default traject-rules heeft.
--
-- De initiële migratie deed dit al met WHERE NOT EXISTS, maar tenants die
-- na die migratie zijn aangemaakt hebben geen rules — NewOrder crasht dan
-- met "Geen passende traject-regel gevonden".
--
-- Idempotent: checkt per rule-naam of hij al bestaat, anders insert.
-- Ook: backfill departments voor tenants die die nog missen.
-- ──────────────────────────────────────────────────────────────────────────

-- ─── Departments ─────────────────────────────────────────────────────────
INSERT INTO public.departments (tenant_id, code, name, color)
SELECT t.id, 'OPS', 'Operations', '#3b82f6'
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.departments d WHERE d.tenant_id = t.id AND d.code = 'OPS'
);

INSERT INTO public.departments (tenant_id, code, name, color)
SELECT t.id, 'EXPORT', 'Export', '#f59e0b'
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.departments d WHERE d.tenant_id = t.id AND d.code = 'EXPORT'
);

-- ─── Traject rules ───────────────────────────────────────────────────────
-- Rule 1: delivery naar RCS export hub → split OPS + EXPORT
INSERT INTO public.traject_rules (tenant_id, name, priority, match_conditions, legs_template)
SELECT
  t.id,
  'Naar RCS Export hub → split Operations + Export',
  10,
  '{"delivery_address_contains": ["RCS Export", "RCS Hub", "RCS_EXPORT", "Royalty Cargo Export"]}'::jsonb,
  '[
    {"sequence": 1, "from": "pickup", "to": "hub", "department_code": "OPS", "leg_role": "OPS_PICKUP"},
    {"sequence": 2, "from": "hub", "to": "delivery", "department_code": "EXPORT", "leg_role": "EXPORT_LEG"}
  ]'::jsonb
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.traject_rules tr
  WHERE tr.tenant_id = t.id AND tr.name = 'Naar RCS Export hub → split Operations + Export'
);

-- Rule 2: pickup vanuit RCS hub → single EXPORT
INSERT INTO public.traject_rules (tenant_id, name, priority, match_conditions, legs_template)
SELECT
  t.id,
  'Vanuit RCS hub → single Export leg',
  20,
  '{"pickup_address_contains": ["RCS Export", "RCS Hub"]}'::jsonb,
  '[
    {"sequence": 1, "from": "pickup", "to": "delivery", "department_code": "EXPORT", "leg_role": "SINGLE"}
  ]'::jsonb
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.traject_rules tr
  WHERE tr.tenant_id = t.id AND tr.name = 'Vanuit RCS hub → single Export leg'
);

-- Rule 3 (fallback, hoge priority-nummer = laag): alles anders → single OPS
INSERT INTO public.traject_rules (tenant_id, name, priority, match_conditions, legs_template)
SELECT
  t.id,
  'Binnenlands → single Operations leg',
  1000,
  '{"default": true}'::jsonb,
  '[
    {"sequence": 1, "from": "pickup", "to": "delivery", "department_code": "OPS", "leg_role": "SINGLE"}
  ]'::jsonb
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.traject_rules tr
  WHERE tr.tenant_id = t.id AND tr.name = 'Binnenlands → single Operations leg'
);

-- ─── Trigger voor nieuwe tenants: auto-seed defaults ─────────────────────
-- Voorkomt dat dit probleem zich herhaalt bij de volgende nieuwe tenant.
CREATE OR REPLACE FUNCTION public.seed_tenant_defaults()
RETURNS TRIGGER AS $$
BEGIN
  -- Departments
  INSERT INTO public.departments (tenant_id, code, name, color)
  VALUES (NEW.id, 'OPS', 'Operations', '#3b82f6')
  ON CONFLICT (tenant_id, code) DO NOTHING;

  INSERT INTO public.departments (tenant_id, code, name, color)
  VALUES (NEW.id, 'EXPORT', 'Export', '#f59e0b')
  ON CONFLICT (tenant_id, code) DO NOTHING;

  -- Traject rules
  INSERT INTO public.traject_rules (tenant_id, name, priority, match_conditions, legs_template)
  VALUES
    (NEW.id,
     'Naar RCS Export hub → split Operations + Export',
     10,
     '{"delivery_address_contains": ["RCS Export", "RCS Hub", "RCS_EXPORT", "Royalty Cargo Export"]}'::jsonb,
     '[{"sequence":1,"from":"pickup","to":"hub","department_code":"OPS","leg_role":"OPS_PICKUP"},
       {"sequence":2,"from":"hub","to":"delivery","department_code":"EXPORT","leg_role":"EXPORT_LEG"}]'::jsonb),
    (NEW.id,
     'Vanuit RCS hub → single Export leg',
     20,
     '{"pickup_address_contains": ["RCS Export", "RCS Hub"]}'::jsonb,
     '[{"sequence":1,"from":"pickup","to":"delivery","department_code":"EXPORT","leg_role":"SINGLE"}]'::jsonb),
    (NEW.id,
     'Binnenlands → single Operations leg',
     1000,
     '{"default": true}'::jsonb,
     '[{"sequence":1,"from":"pickup","to":"delivery","department_code":"OPS","leg_role":"SINGLE"}]'::jsonb);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_seed_tenant_defaults ON public.tenants;
CREATE TRIGGER trg_seed_tenant_defaults
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.seed_tenant_defaults();
