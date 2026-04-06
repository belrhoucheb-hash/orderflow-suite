CREATE TABLE IF NOT EXISTS order_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  order_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}',
  actor_type TEXT NOT NULL,
  actor_id UUID,
  confidence_score NUMERIC(5,2),
  duration_since_previous_ms BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_order_events_order ON order_events(order_id);
CREATE INDEX idx_order_events_tenant ON order_events(tenant_id);
CREATE INDEX idx_order_events_type ON order_events(event_type);
CREATE INDEX idx_order_events_created ON order_events(created_at);

ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON order_events FOR ALL USING (tenant_id = (current_setting('app.tenant_id')::uuid));
