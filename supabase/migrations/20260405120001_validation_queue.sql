-- Validation Queue: items awaiting human approval
CREATE TABLE IF NOT EXISTS validation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  decision_log_id UUID NOT NULL REFERENCES decision_log(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('order', 'trip', 'invoice')),
  entity_id UUID NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'CONFIRM_ORDER',
    'ASSIGN_VEHICLE',
    'DISPATCH_TRIP',
    'SEND_INVOICE'
  )),
  proposed_action JSONB NOT NULL,
  confidence NUMERIC(5,2),
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_validation_queue_pending ON validation_queue(tenant_id, status, priority DESC)
  WHERE status = 'PENDING';
CREATE INDEX idx_validation_queue_entity ON validation_queue(tenant_id, entity_type, entity_id);

ALTER TABLE validation_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for validation_queue"
  ON validation_queue
  FOR ALL
  USING (tenant_id IN (
    SELECT tm.tenant_id FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid()
  ))
  WITH CHECK (tenant_id IN (
    SELECT tm.tenant_id FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid()
  ));

CREATE POLICY "Service role bypass for validation_queue"
  ON validation_queue
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
