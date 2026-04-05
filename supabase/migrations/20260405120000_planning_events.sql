-- Planning events: tracks every planning re-evaluation
CREATE TABLE IF NOT EXISTS planning_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'NEW_ORDER', 'CANCELLATION', 'VEHICLE_CHANGE', 'MANUAL', 'SCHEDULE'
  )),
  trigger_entity_id UUID,
  orders_evaluated INTEGER NOT NULL DEFAULT 0,
  orders_assigned INTEGER NOT NULL DEFAULT 0,
  orders_changed INTEGER NOT NULL DEFAULT 0,
  confidence NUMERIC(5,2) NOT NULL DEFAULT 0,
  planning_duration_ms INTEGER NOT NULL DEFAULT 0,
  auto_executed BOOLEAN NOT NULL DEFAULT false,
  assignments_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for tenant queries
CREATE INDEX idx_planning_events_tenant ON planning_events(tenant_id, created_at DESC);

-- RLS
ALTER TABLE planning_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "planning_events_tenant_read" ON planning_events
  FOR SELECT USING (
    tenant_id = (
      SELECT tm.tenant_id FROM tenant_members tm
      WHERE tm.user_id = auth.uid()
      LIMIT 1
    )
  );

CREATE POLICY "planning_events_tenant_insert" ON planning_events
  FOR INSERT WITH CHECK (
    tenant_id = (
      SELECT tm.tenant_id FROM tenant_members tm
      WHERE tm.user_id = auth.uid()
      LIMIT 1
    )
  );

-- Service role can always insert (for Edge Functions)
CREATE POLICY "planning_events_service_insert" ON planning_events
  FOR INSERT WITH CHECK (auth.role() = 'service_role');
