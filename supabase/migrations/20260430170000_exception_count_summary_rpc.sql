-- Sidebar exception badge summary. This replaces the previous client-side
-- fan-out of settings + delivery/order/anomaly/trip queries with one RPC.

CREATE OR REPLACE FUNCTION public.exception_count_summary_v1(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH settings AS (
    SELECT
      coalesce((sla.settings ->> 'enabled')::boolean, true) AS sla_enabled,
      greatest(coalesce((sla.settings ->> 'deadlineHours')::integer, 4), 1) AS sla_deadline_hours,
      coalesce((ex.settings ->> 'deliveryExceptionsEnabled')::boolean, true) AS delivery_enabled,
      coalesce((ex.settings ->> 'anomaliesEnabled')::boolean, true) AS anomalies_enabled,
      coalesce((ex.settings ->> 'missingDataEnabled')::boolean, true) AS missing_data_enabled,
      coalesce((ex.settings ->> 'slaEnabled')::boolean, true) AS exception_sla_enabled,
      coalesce((ex.settings ->> 'delayEnabled')::boolean, true) AS delay_enabled,
      coalesce((ex.settings ->> 'capacityEnabled')::boolean, true) AS capacity_enabled,
      least(greatest(coalesce((ex.settings ->> 'delayThresholdHours')::integer, 24), 1), 168) AS delay_threshold_hours,
      least(greatest(coalesce((ex.settings ->> 'capacityUtilizationThreshold')::integer, 95), 1), 100) AS capacity_threshold,
      coalesce(ex.settings ->> 'anomalyMinSeverity', 'warning') AS anomaly_min_severity,
      coalesce((ex.settings #>> '{deliveryTypes,delay}')::boolean, true) AS type_delay,
      coalesce((ex.settings #>> '{deliveryTypes,missingData}')::boolean, true) AS type_missing_data,
      coalesce((ex.settings #>> '{deliveryTypes,capacity}')::boolean, true) AS type_capacity,
      coalesce((ex.settings #>> '{deliveryTypes,slaBreach}')::boolean, true) AS type_sla_breach,
      coalesce((ex.settings #>> '{deliveryTypes,predictedDelay}')::boolean, true) AS type_predicted_delay,
      coalesce((ex.settings #>> '{deliverySeverities,low}')::boolean, false) AS sev_low,
      coalesce((ex.settings #>> '{deliverySeverities,medium}')::boolean, true) AS sev_medium,
      coalesce((ex.settings #>> '{deliverySeverities,high}')::boolean, true) AS sev_high,
      coalesce((ex.settings #>> '{deliverySeverities,critical}')::boolean, true) AS sev_critical
    FROM
      (SELECT settings FROM public.tenant_settings WHERE tenant_id = p_tenant_id AND category = 'sla' LIMIT 1) sla
      FULL JOIN
      (SELECT settings FROM public.tenant_settings WHERE tenant_id = p_tenant_id AND category = 'exceptions' LIMIT 1) ex
      ON true
  ),
  normalized_settings AS (
    SELECT * FROM settings
    UNION ALL
    SELECT
      true, 4, true, true, true, true, true, true, 24, 95, 'warning',
      true, true, true, true, true, false, true, true, true
    WHERE NOT EXISTS (SELECT 1 FROM settings)
  ),
  draft_orders AS (
    SELECT missing_fields, coalesce(received_at, created_at) AS received_at
    FROM public.orders
    WHERE tenant_id = p_tenant_id AND status = 'DRAFT'
  ),
  delivery AS (
    SELECT count(*) AS count
    FROM public.delivery_exceptions de, normalized_settings s
    WHERE s.delivery_enabled
      AND de.tenant_id = p_tenant_id
      AND de.status IN ('OPEN', 'IN_PROGRESS')
      AND CASE de.exception_type
        WHEN 'DELAY' THEN s.type_delay
        WHEN 'MISSING_DATA' THEN s.type_missing_data
        WHEN 'CAPACITY' THEN s.type_capacity
        WHEN 'SLA_BREACH' THEN s.type_sla_breach
        WHEN 'PREDICTED_DELAY' THEN s.type_predicted_delay
        ELSE true
      END
      AND CASE de.severity
        WHEN 'LOW' THEN s.sev_low
        WHEN 'MEDIUM' THEN s.sev_medium
        WHEN 'HIGH' THEN s.sev_high
        WHEN 'CRITICAL' THEN s.sev_critical
        ELSE true
      END
  ),
  missing_data AS (
    SELECT count(*) AS count
    FROM draft_orders d, normalized_settings s
    WHERE s.missing_data_enabled
      AND jsonb_array_length(coalesce(to_jsonb(d.missing_fields), '[]'::jsonb)) > 0
  ),
  sla AS (
    SELECT count(*) AS count
    FROM draft_orders d, normalized_settings s
    WHERE s.exception_sla_enabled
      AND s.sla_enabled
      AND d.received_at IS NOT NULL
      AND d.received_at < now() - make_interval(hours => s.sla_deadline_hours)
  ),
  delays AS (
    SELECT count(*) AS count
    FROM public.orders o, normalized_settings s
    WHERE s.delay_enabled
      AND o.tenant_id = p_tenant_id
      AND o.status = 'IN_TRANSIT'
      AND o.created_at < now() - make_interval(hours => s.delay_threshold_hours)
  ),
  anomalies AS (
    SELECT count(*) AS count
    FROM public.anomalies a, normalized_settings s
    WHERE s.anomalies_enabled
      AND a.tenant_id = p_tenant_id
      AND a.resolved_at IS NULL
      AND CASE s.anomaly_min_severity
        WHEN 'critical' THEN a.severity = 'critical'
        WHEN 'warning' THEN a.severity IN ('warning', 'critical')
        ELSE a.severity IN ('info', 'warning', 'critical')
      END
  ),
  active_trip_orders AS (
    SELECT t.vehicle_id, ts.order_id
    FROM public.trips t
    JOIN public.trip_stops ts ON ts.trip_id = t.id
    WHERE t.tenant_id = p_tenant_id
      AND t.vehicle_id IS NOT NULL
      AND ts.order_id IS NOT NULL
      AND t.dispatch_status IN ('ACTIEF', 'VERZONDEN', 'ONTVANGEN', 'GEACCEPTEERD')
    GROUP BY t.vehicle_id, ts.order_id
  ),
  vehicle_loads AS (
    SELECT ato.vehicle_id, coalesce(sum(coalesce(o.weight_kg, 0)), 0) AS total_weight_kg
    FROM active_trip_orders ato
    JOIN public.orders o ON o.id = ato.order_id
    GROUP BY ato.vehicle_id
  ),
  capacity AS (
    SELECT count(*) AS count
    FROM vehicle_loads vl
    JOIN public.vehicles v ON v.id = vl.vehicle_id
    CROSS JOIN normalized_settings s
    WHERE s.capacity_enabled
      AND v.deleted_at IS NULL
      AND coalesce(v.capacity_kg, 0) > 0
      AND round((vl.total_weight_kg / v.capacity_kg) * 100) >= s.capacity_threshold
  )
  SELECT jsonb_build_object(
    'total', (
      (SELECT count FROM delivery) +
      (SELECT count FROM missing_data) +
      (SELECT count FROM sla) +
      (SELECT count FROM delays) +
      (SELECT count FROM capacity) +
      (SELECT count FROM anomalies)
    ),
    'breakdown', jsonb_build_object(
      'delivery', (SELECT count FROM delivery),
      'missingData', (SELECT count FROM missing_data),
      'sla', (SELECT count FROM sla),
      'delays', (SELECT count FROM delays),
      'capacity', (SELECT count FROM capacity),
      'anomalies', (SELECT count FROM anomalies)
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.exception_count_summary_v1(uuid) TO authenticated;

COMMENT ON FUNCTION public.exception_count_summary_v1(uuid) IS
  'Returns the tenant-scoped sidebar exception count in one RLS-aware query.';
