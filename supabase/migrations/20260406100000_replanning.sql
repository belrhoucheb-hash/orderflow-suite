-- ─── Real-time Replanning Tables ────────────────────────────

CREATE TABLE IF NOT EXISTS disruptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  affected_trip_id UUID,
  affected_order_id UUID,
  affected_vehicle_id UUID,
  description TEXT,
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  auto_resolved BOOLEAN DEFAULT false,
  resolution_summary JSONB
);

CREATE TABLE IF NOT EXISTS replan_suggestions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  disruption_id UUID REFERENCES disruptions(id),
  description TEXT,
  confidence NUMERIC(5,2),
  impact JSONB,
  actions JSONB,
  status TEXT DEFAULT 'pending',
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE disruptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE replan_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON disruptions FOR ALL USING (tenant_id = (current_setting('app.tenant_id')::uuid));
CREATE POLICY "tenant_isolation" ON replan_suggestions FOR ALL USING (tenant_id = (current_setting('app.tenant_id')::uuid));
