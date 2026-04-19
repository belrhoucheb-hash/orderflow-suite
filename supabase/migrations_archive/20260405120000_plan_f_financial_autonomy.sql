-- Plan F: Autonomous Financial Processing
-- Tables: auto_invoice_log, margin_alerts, cashflow_predictions

-- ─── auto_invoice_log ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auto_invoice_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  trigger_trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE SET NULL,
  auto_calculated_total NUMERIC NOT NULL,
  final_total NUMERIC NOT NULL,
  price_accuracy_pct NUMERIC NOT NULL DEFAULT 100,
  was_auto_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_auto_invoice_log_tenant ON auto_invoice_log(tenant_id);
CREATE INDEX idx_auto_invoice_log_invoice ON auto_invoice_log(invoice_id);
CREATE INDEX idx_auto_invoice_log_trip ON auto_invoice_log(trigger_trip_id);

ALTER TABLE auto_invoice_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auto_invoice_log_tenant_isolation" ON auto_invoice_log
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() LIMIT 1))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() LIMIT 1));

-- ─── margin_alerts ──────────────────────────────────���──────────
CREATE TABLE IF NOT EXISTS margin_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('trip', 'client', 'route')),
  entity_id UUID NOT NULL,
  margin_pct NUMERIC NOT NULL,
  threshold_pct NUMERIC NOT NULL,
  alert_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (alert_status IN ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_margin_alerts_tenant ON margin_alerts(tenant_id);
CREATE INDEX idx_margin_alerts_status ON margin_alerts(tenant_id, alert_status);

ALTER TABLE margin_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "margin_alerts_tenant_isolation" ON margin_alerts
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() LIMIT 1))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() LIMIT 1));

-- ──�� cashflow_predictions ──────────────���───────────────────────
CREATE TABLE IF NOT EXISTS cashflow_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  predicted_payment_date DATE NOT NULL,
  actual_payment_date DATE,
  amount NUMERIC NOT NULL,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cashflow_predictions_tenant ON cashflow_predictions(tenant_id);
CREATE INDEX idx_cashflow_predictions_client ON cashflow_predictions(client_id);
CREATE INDEX idx_cashflow_predictions_date ON cashflow_predictions(predicted_payment_date);

ALTER TABLE cashflow_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cashflow_predictions_tenant_isolation" ON cashflow_predictions
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() LIMIT 1))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() LIMIT 1));
