-- ============================================================
-- Feature 5: Retourzendingen & Emballage
-- Adds order_type/return_reason to orders, packaging_movements
-- table, and packaging_balances view with full RLS.
-- ============================================================

-- ─── 1. ALTER orders: add order_type & return_reason ────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_type TEXT NOT NULL DEFAULT 'ZENDING'
    CHECK (order_type IN ('ZENDING', 'RETOUR', 'EMBALLAGE_RUIL'));

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS return_reason TEXT
    CHECK (return_reason IS NULL OR return_reason IN (
      'BESCHADIGD', 'VERKEERD', 'WEIGERING', 'OVERSCHOT', 'OVERIG'
    ));

-- Index for filtering by order_type
CREATE INDEX IF NOT EXISTS idx_orders_order_type ON public.orders(order_type);
CREATE INDEX IF NOT EXISTS idx_orders_parent_order_id ON public.orders(parent_order_id);

-- ─── 2. packaging_movements table ──────────────────────────
CREATE TABLE IF NOT EXISTS public.packaging_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  trip_stop_id UUID REFERENCES public.trip_stops(id) ON DELETE SET NULL,
  loading_unit_id UUID NOT NULL REFERENCES public.loading_units(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('UIT', 'IN')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  recorded_by UUID REFERENCES auth.users(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_packaging_movements_tenant ON public.packaging_movements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_packaging_movements_client ON public.packaging_movements(client_id);
CREATE INDEX IF NOT EXISTS idx_packaging_movements_order ON public.packaging_movements(order_id);
CREATE INDEX IF NOT EXISTS idx_packaging_movements_stop ON public.packaging_movements(trip_stop_id);
CREATE INDEX IF NOT EXISTS idx_packaging_movements_unit ON public.packaging_movements(loading_unit_id);
CREATE INDEX IF NOT EXISTS idx_packaging_movements_recorded_at ON public.packaging_movements(recorded_at);

-- ─── 3. RLS for packaging_movements ────────────────────────
ALTER TABLE public.packaging_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "packaging_movements_tenant_select" ON public.packaging_movements
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "packaging_movements_tenant_insert" ON public.packaging_movements
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "packaging_movements_tenant_update" ON public.packaging_movements
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "packaging_movements_tenant_delete" ON public.packaging_movements
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "packaging_movements_service_role" ON public.packaging_movements
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─── 4. packaging_balances view ────────────────────────────
CREATE OR REPLACE VIEW public.packaging_balances AS
SELECT
  pm.tenant_id,
  pm.client_id,
  pm.loading_unit_id,
  lu.name AS loading_unit_name,
  lu.code AS loading_unit_code,
  c.name AS client_name,
  SUM(CASE WHEN pm.direction = 'UIT' THEN pm.quantity ELSE -pm.quantity END) AS balance,
  COUNT(*) AS total_movements,
  MAX(pm.recorded_at) AS last_movement_at
FROM public.packaging_movements pm
JOIN public.loading_units lu ON lu.id = pm.loading_unit_id
JOIN public.clients c ON c.id = pm.client_id
GROUP BY pm.tenant_id, pm.client_id, pm.loading_unit_id, lu.name, lu.code, c.name;

-- Grant access to view
GRANT SELECT ON public.packaging_balances TO authenticated;
GRANT SELECT ON public.packaging_balances TO service_role;
