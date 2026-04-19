-- ============================================================
-- Plan E: Autonomous Dispatch & Execution
-- Tables: dispatch_rules (per-tenant config), execution_anomalies
-- ============================================================

-- 1. Dispatch Rules (per-tenant config)
CREATE TABLE IF NOT EXISTS public.dispatch_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  auto_dispatch_enabled BOOLEAN NOT NULL DEFAULT false,
  dispatch_lead_time_min INTEGER NOT NULL DEFAULT 60,
  anomaly_stationary_min INTEGER NOT NULL DEFAULT 20,
  anomaly_late_threshold_min INTEGER NOT NULL DEFAULT 15,
  auto_replan_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dispatch_rules_tenant_unique UNIQUE (tenant_id)
);

-- RLS
ALTER TABLE public.dispatch_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dispatch_rules_tenant_isolation"
  ON public.dispatch_rules
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members
      WHERE user_id = auth.uid()
    )
  );

-- Updated_at trigger
CREATE TRIGGER update_dispatch_rules_updated_at
  BEFORE UPDATE ON public.dispatch_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Execution Anomalies
CREATE TABLE IF NOT EXISTS public.execution_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  driver_id UUID,
  anomaly_type TEXT NOT NULL
    CHECK (anomaly_type IN ('STATIONARY', 'LATE', 'OFF_ROUTE', 'MISSED_WINDOW')),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  details JSONB DEFAULT '{}'::jsonb,
  resolution TEXT
    CHECK (resolution IS NULL OR resolution IN ('AUTO_REPLANNED', 'PLANNER_RESOLVED', 'IGNORED')),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.execution_anomalies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "execution_anomalies_tenant_isolation"
  ON public.execution_anomalies
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members
      WHERE user_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX idx_execution_anomalies_trip
  ON public.execution_anomalies(trip_id);

CREATE INDEX idx_execution_anomalies_unresolved
  ON public.execution_anomalies(tenant_id, resolved_at)
  WHERE resolved_at IS NULL;

-- Service role bypass for edge functions
CREATE POLICY "dispatch_rules_service_role"
  ON public.dispatch_rules
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "execution_anomalies_service_role"
  ON public.execution_anomalies
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
