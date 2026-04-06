-- Run anomaly detection every 10 minutes
-- Detect stale orders (DRAFT > 24h)
SELECT cron.schedule(
  'detect-stale-orders',
  '*/10 * * * *',
  $$
  INSERT INTO anomalies (tenant_id, category, type, severity, entity_type, entity_id, title, description, detected_at)
  SELECT
    o.tenant_id,
    'timing',
    'stale_order',
    CASE WHEN NOW() - o.created_at > INTERVAL '48 hours' THEN 'critical' ELSE 'warning' END,
    'order',
    o.id,
    'Order staat al ' || EXTRACT(HOURS FROM NOW() - o.created_at)::int || ' uur in concept',
    'Order ' || COALESCE(o.reference, o.id::text) || ' is aangemaakt op ' || o.created_at::date || ' en staat nog steeds op DRAFT',
    NOW()
  FROM orders o
  WHERE o.status = 'DRAFT'
    AND o.created_at < NOW() - INTERVAL '24 hours'
    AND NOT EXISTS (
      SELECT 1 FROM anomalies a
      WHERE a.entity_id = o.id
        AND a.type = 'stale_order'
        AND a.resolved_at IS NULL
    )
  $$
);

-- Clean up old resolved anomalies (> 30 days)
SELECT cron.schedule(
  'cleanup-old-anomalies',
  '0 3 * * *',
  $$
  DELETE FROM anomalies WHERE resolved_at IS NOT NULL AND resolved_at < NOW() - INTERVAL '30 days'
  $$
);

-- SLA monitoring every 5 minutes
SELECT cron.schedule(
  'sla-monitoring',
  '*/5 * * * *',
  $$
  INSERT INTO anomalies (tenant_id, category, type, severity, entity_type, entity_id, title, description, detected_at)
  SELECT
    o.tenant_id,
    'timing',
    'late_delivery',
    'critical',
    'order',
    o.id,
    'SLA risico: levering dreigt te laat',
    'Order ' || COALESCE(o.reference, o.id::text) || ' is IN_TRANSIT maar deadline nadert',
    NOW()
  FROM orders o
  WHERE o.status = 'IN_TRANSIT'
    AND o.created_at < NOW() - INTERVAL '12 hours'
    AND NOT EXISTS (
      SELECT 1 FROM anomalies a
      WHERE a.entity_id = o.id
        AND a.type = 'late_delivery'
        AND a.resolved_at IS NULL
    )
  $$
);
