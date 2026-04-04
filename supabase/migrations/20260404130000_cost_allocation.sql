-- ============================================================
-- Feature 3: Kostentoerekening per rit
-- ============================================================

-- ============================================================
-- COST_TYPES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cost_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('BRANDSTOF', 'TOL', 'CHAUFFEUR', 'VOERTUIG', 'OVERIG')),
  calculation_method TEXT NOT NULL CHECK (calculation_method IN ('PER_KM', 'PER_UUR', 'PER_RIT', 'PER_STOP', 'HANDMATIG')),
  default_rate NUMERIC(12,4),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cost_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation: cost_types SELECT" ON public.cost_types
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Tenant isolation: cost_types INSERT" ON public.cost_types
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Tenant isolation: cost_types UPDATE" ON public.cost_types
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Tenant isolation: cost_types DELETE" ON public.cost_types
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Service role: cost_types" ON public.cost_types
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER update_cost_types_updated_at
  BEFORE UPDATE ON public.cost_types
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- TRIP_COSTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.trip_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  cost_type_id UUID NOT NULL REFERENCES public.cost_types(id) ON DELETE RESTRICT,
  amount NUMERIC(12,4) NOT NULL,
  quantity NUMERIC(12,4),
  rate NUMERIC(12,4),
  source TEXT NOT NULL DEFAULT 'AUTO' CHECK (source IN ('AUTO', 'HANDMATIG', 'IMPORT')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.trip_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation: trip_costs SELECT" ON public.trip_costs
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Tenant isolation: trip_costs INSERT" ON public.trip_costs
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Tenant isolation: trip_costs UPDATE" ON public.trip_costs
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Tenant isolation: trip_costs DELETE" ON public.trip_costs
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Service role: trip_costs" ON public.trip_costs
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================
-- VEHICLE_FIXED_COSTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.vehicle_fixed_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  cost_type_id UUID NOT NULL REFERENCES public.cost_types(id) ON DELETE RESTRICT,
  monthly_amount NUMERIC(12,4) NOT NULL,
  valid_from DATE,
  valid_until DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_fixed_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation: vehicle_fixed_costs SELECT" ON public.vehicle_fixed_costs
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Tenant isolation: vehicle_fixed_costs INSERT" ON public.vehicle_fixed_costs
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Tenant isolation: vehicle_fixed_costs UPDATE" ON public.vehicle_fixed_costs
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Tenant isolation: vehicle_fixed_costs DELETE" ON public.vehicle_fixed_costs
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Service role: vehicle_fixed_costs" ON public.vehicle_fixed_costs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER update_vehicle_fixed_costs_updated_at
  BEFORE UPDATE ON public.vehicle_fixed_costs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- DRIVERS TABLE EXTENSIONS
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drivers' AND column_name='hourly_cost') THEN
    ALTER TABLE public.drivers ADD COLUMN hourly_cost NUMERIC(10,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drivers' AND column_name='km_allowance') THEN
    ALTER TABLE public.drivers ADD COLUMN km_allowance NUMERIC(10,4);
  END IF;
END $$;


-- ============================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_cost_types_tenant ON public.cost_types(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_trip_costs_trip ON public.trip_costs(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_costs_tenant ON public.trip_costs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_trip_costs_type ON public.trip_costs(cost_type_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_fixed_costs_vehicle ON public.vehicle_fixed_costs(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_fixed_costs_tenant ON public.vehicle_fixed_costs(tenant_id);


-- ============================================================
-- SEED FUNCTION: Default Cost Types
-- ============================================================

CREATE OR REPLACE FUNCTION public.seed_default_cost_types(p_tenant_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO public.cost_types (tenant_id, name, category, calculation_method, default_rate)
  VALUES
    (p_tenant_id, 'Brandstof', 'BRANDSTOF', 'PER_KM', NULL),
    (p_tenant_id, 'Tolkosten', 'TOL', 'HANDMATIG', NULL),
    (p_tenant_id, 'Chauffeurkosten', 'CHAUFFEUR', 'PER_UUR', NULL),
    (p_tenant_id, 'Voertuigkosten (vast)', 'VOERTUIG', 'PER_RIT', NULL),
    (p_tenant_id, 'Wachtgeld', 'CHAUFFEUR', 'PER_UUR', NULL),
    (p_tenant_id, 'Overige kosten', 'OVERIG', 'HANDMATIG', NULL)
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
