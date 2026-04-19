-- Anomaly Detection table
CREATE TABLE IF NOT EXISTS anomalies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  category TEXT NOT NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  entity_type TEXT NOT NULL,
  entity_id UUID,
  title TEXT NOT NULL,
  description TEXT,
  suggested_action TEXT,
  auto_resolvable BOOLEAN DEFAULT false,
  auto_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  data JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_anomalies_tenant ON anomalies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_severity ON anomalies(severity);
CREATE INDEX IF NOT EXISTS idx_anomalies_entity ON anomalies(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_unresolved ON anomalies(tenant_id) WHERE resolved_at IS NULL;

ALTER TABLE anomalies ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation' AND tablename = 'anomalies'
  ) THEN
    CREATE POLICY "tenant_isolation" ON anomalies FOR ALL USING (tenant_id = (current_setting('app.tenant_id')::uuid));
  END IF;
END
$$;
