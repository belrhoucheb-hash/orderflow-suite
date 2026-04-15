-- ──────────────────────────────────────────────────────────────────────────
-- Prio 1: Departments + Shipment legs + Traject rules
--
-- Pijnpunt uit de meeting (42 vs 64 telling):
--   * Orders worden aangemaakt zonder afdeling gekoppeld
--   * Het planbord toont alleen orders met een afdeling → orders zonder
--     afdeling vallen tussen wal en schip, worden niet opgehaald.
--
-- Oplossing:
--   1. `departments` master-tabel (OPS / EXPORT).
--   2. `shipments` moederzending per klantboeking.
--   3. `orders.shipment_id` + `orders.department_id` + `orders.leg_number`.
--   4. `traject_rules` config-tabel die bepaalt wanneer een boeking in
--      meerdere legs gesplitst moet worden (bv. *→RCS_HUB via hub).
--   5. Workflow-guard: non-DRAFT orders MOETEN department hebben.
-- ──────────────────────────────────────────────────────────────────────────

-- ─── 1. departments ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_departments_tenant ON public.departments(tenant_id);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for departments"
  ON public.departments FOR ALL
  USING (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()));

CREATE POLICY "Service role full access on departments"
  ON public.departments FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ─── 2. shipments ────────────────────────────────────────────────────────
-- Eén klantboeking = één shipment. Een shipment kan 1 of meerdere legs
-- (= orders) hebben.
CREATE TABLE IF NOT EXISTS public.shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  shipment_number INTEGER,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name TEXT,
  origin_address TEXT,
  destination_address TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  traject_rule_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shipments_tenant ON public.shipments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shipments_client ON public.shipments(client_id);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON public.shipments(status);

-- Per-tenant oplopende shipment_number
CREATE OR REPLACE FUNCTION public.assign_shipment_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.shipment_number IS NULL THEN
    SELECT COALESCE(MAX(shipment_number), 0) + 1
      INTO NEW.shipment_number
      FROM public.shipments
      WHERE tenant_id = NEW.tenant_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_shipment_number ON public.shipments;
CREATE TRIGGER trg_assign_shipment_number
  BEFORE INSERT ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.assign_shipment_number();

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for shipments"
  ON public.shipments FOR ALL
  USING (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()));

CREATE POLICY "Service role full access on shipments"
  ON public.shipments FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ─── 3. traject_rules ────────────────────────────────────────────────────
-- Config-driven matching rules. Voorbeelden:
--   * pickup ≠ RCS Hub & delivery = RCS_EXPORT_HUB →
--     2 legs: [pickup→hub: OPS] + [hub→delivery: EXPORT]
--   * pickup binnen NL & delivery binnen NL → 1 leg: OPS
--   * pickup = RCS Hub & delivery = internationaal → 1 leg: EXPORT
CREATE TABLE IF NOT EXISTS public.traject_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- Matcher: JSONB zodat we flexibel kunnen matchen op
  -- pickup_country/pickup_postcode_pattern/delivery_*/hub_detection
  match_conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Legs: array van {sequence, from, to, department_code}
  -- `from`/`to` = "pickup" | "delivery" | "hub"
  legs_template JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_traject_rules_tenant_active
  ON public.traject_rules(tenant_id, is_active, priority);

ALTER TABLE public.traject_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for traject_rules"
  ON public.traject_rules FOR ALL
  USING (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()));

CREATE POLICY "Service role full access on traject_rules"
  ON public.traject_rules FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ─── 4. orders: nieuwe kolommen ──────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipment_id UUID REFERENCES public.shipments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS leg_number INTEGER,
  ADD COLUMN IF NOT EXISTS leg_role TEXT; -- 'OPS_PICKUP' | 'EXPORT_LEG' | 'SINGLE' etc.

CREATE INDEX IF NOT EXISTS idx_orders_shipment_id ON public.orders(shipment_id);
CREATE INDEX IF NOT EXISTS idx_orders_department_id ON public.orders(department_id);

-- ─── 5. Workflow-guard: non-DRAFT MOET department hebben ─────────────────
-- Constraint op transitie: een order mag pas uit DRAFT als
-- department_id gezet is. Afgedwongen via trigger zodat we
-- duidelijke error-message kunnen geven.
CREATE OR REPLACE FUNCTION public.enforce_department_on_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Alleen controleren op status-wijziging weg van DRAFT, of op insert non-DRAFT.
  IF (TG_OP = 'INSERT' AND NEW.status <> 'DRAFT' AND NEW.department_id IS NULL)
     OR (TG_OP = 'UPDATE' AND OLD.status = 'DRAFT' AND NEW.status <> 'DRAFT' AND NEW.department_id IS NULL) THEN
    RAISE EXCEPTION 'Order kan niet uit DRAFT zonder afdeling gekoppeld (department_id). Order_id=%', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_department_on_transition ON public.orders;
CREATE TRIGGER trg_enforce_department_on_transition
  BEFORE INSERT OR UPDATE OF status, department_id ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_department_on_transition();

-- ─── 6. Seed: default departments per bestaande tenant ───────────────────
INSERT INTO public.departments (tenant_id, code, name, color)
SELECT t.id, 'OPS', 'Operations', '#3b82f6' FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.departments d WHERE d.tenant_id = t.id AND d.code = 'OPS'
);

INSERT INTO public.departments (tenant_id, code, name, color)
SELECT t.id, 'EXPORT', 'Export', '#f59e0b' FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.departments d WHERE d.tenant_id = t.id AND d.code = 'EXPORT'
);

-- ─── 7. Seed: default traject rules per tenant ───────────────────────────
-- Rule 1 (hoogste prio): delivery bevat "RCS Export" of "RCS Hub" → split in 2 legs
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

-- Rule 2: pickup bij RCS hub & internationaal → single leg EXPORT
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

-- Rule 3 (fallback): alles binnen NL → single leg OPS
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

-- ─── 8. Backfill: bestaande orders krijgen default department OPS ────────
-- Alle bestaande orders zonder department → Operations (veilige default).
UPDATE public.orders o
SET department_id = (
  SELECT d.id FROM public.departments d
  WHERE d.tenant_id = o.tenant_id AND d.code = 'OPS' LIMIT 1
)
WHERE o.department_id IS NULL AND o.tenant_id IS NOT NULL;

-- ─── 9. Comments ─────────────────────────────────────────────────────────
COMMENT ON TABLE public.departments IS 'Afdelingen binnen een tenant (bv. Operations, Export).';
COMMENT ON TABLE public.shipments IS 'Moederzending per klantboeking; kan uit 1 of meerdere order-legs bestaan.';
COMMENT ON TABLE public.traject_rules IS 'Regels die bepalen hoe een boeking wordt gesplitst in legs per afdeling.';
COMMENT ON COLUMN public.orders.shipment_id IS 'Moederzending waar deze leg onder valt.';
COMMENT ON COLUMN public.orders.department_id IS 'Afdeling die deze leg uitvoert (verplicht zodra status ≠ DRAFT).';
COMMENT ON COLUMN public.orders.leg_number IS 'Volgorde binnen de shipment (1 = eerste leg).';
COMMENT ON COLUMN public.orders.leg_role IS 'Rol van deze leg in de keten: OPS_PICKUP, EXPORT_LEG, SINGLE, etc.';
