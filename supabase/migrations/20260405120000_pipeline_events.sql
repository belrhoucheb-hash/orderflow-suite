-- Pipeline Events: event log for every autonomous evaluation
CREATE TABLE IF NOT EXISTS pipeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('order', 'trip', 'invoice')),
  entity_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'ORDER_CREATED',
    'ORDER_CONFIRMED',
    'TRIP_PLANNED',
    'TRIP_DISPATCHED',
    'DELIVERY_COMPLETE',
    'INVOICE_READY'
  )),
  previous_status TEXT,
  new_status TEXT,
  evaluation_result TEXT CHECK (evaluation_result IN ('AUTO_EXECUTE', 'NEEDS_VALIDATION', 'BLOCKED')),
  confidence_at_evaluation NUMERIC(5,2),
  action_taken JSONB,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pipeline_events_entity ON pipeline_events(tenant_id, entity_type, entity_id);
CREATE INDEX idx_pipeline_events_type_time ON pipeline_events(tenant_id, event_type, processed_at DESC);

ALTER TABLE pipeline_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for pipeline_events"
  ON pipeline_events
  FOR ALL
  USING (tenant_id IN (
    SELECT tm.tenant_id FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid()
  ))
  WITH CHECK (tenant_id IN (
    SELECT tm.tenant_id FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid()
  ));

CREATE POLICY "Service role bypass for pipeline_events"
  ON pipeline_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
