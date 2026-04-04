-- supabase/migrations/20260404110000_consolidation_groups.sql

CREATE TABLE IF NOT EXISTS public.consolidation_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  planned_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'VOORSTEL'
    CHECK (status IN ('VOORSTEL','GOEDGEKEURD','INGEPLAND','VERWORPEN')),
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  total_weight_kg NUMERIC(10,2),
  total_pallets INTEGER,
  total_distance_km NUMERIC(10,2),
  estimated_duration_min INTEGER,
  utilization_pct NUMERIC(5,2),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.consolidation_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consolidation_groups_select" ON public.consolidation_groups FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "consolidation_groups_insert" ON public.consolidation_groups FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());
CREATE POLICY "consolidation_groups_update" ON public.consolidation_groups FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "consolidation_groups_delete" ON public.consolidation_groups FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "consolidation_groups_service" ON public.consolidation_groups FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_consolidation_groups_updated_at
  BEFORE UPDATE ON public.consolidation_groups FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_consolidation_groups_tenant_date ON public.consolidation_groups (tenant_id, planned_date, status);

CREATE TABLE IF NOT EXISTS public.consolidation_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.consolidation_groups(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  stop_sequence INTEGER,
  pickup_sequence INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, order_id)
);

ALTER TABLE public.consolidation_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consolidation_orders_select" ON public.consolidation_orders FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.consolidation_groups g WHERE g.id = group_id AND g.tenant_id = public.get_user_tenant_id()));
CREATE POLICY "consolidation_orders_insert" ON public.consolidation_orders FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.consolidation_groups g WHERE g.id = group_id AND g.tenant_id = public.get_user_tenant_id()));
CREATE POLICY "consolidation_orders_update" ON public.consolidation_orders FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.consolidation_groups g WHERE g.id = group_id AND g.tenant_id = public.get_user_tenant_id()));
CREATE POLICY "consolidation_orders_delete" ON public.consolidation_orders FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.consolidation_groups g WHERE g.id = group_id AND g.tenant_id = public.get_user_tenant_id()));
CREATE POLICY "consolidation_orders_service" ON public.consolidation_orders FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_consolidation_orders_group ON public.consolidation_orders (group_id);
CREATE INDEX idx_consolidation_orders_order ON public.consolidation_orders (order_id);
