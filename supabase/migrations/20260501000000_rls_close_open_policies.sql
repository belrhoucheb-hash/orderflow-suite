-- ============================================================
-- Sluit RLS-policies die nog `USING (true) WITH CHECK (true)`
-- of unconditional INSERT toelaten op rol `public`.
--
-- Vervangt ze door tenant-gescoped policies voor authenticated.
-- Service-role policies blijven onaangeraakt (gedefinieerd in
-- 20260423220000_rls_service_role_explicit.sql).
--
-- Pre-state geverifieerd via pg_policies op 2026-05-01.
-- ============================================================

-- trips
DROP POLICY IF EXISTS "trips_all" ON public.trips;
DROP POLICY IF EXISTS "trips_tenant_select" ON public.trips;
DROP POLICY IF EXISTS "trips_tenant_insert" ON public.trips;
DROP POLICY IF EXISTS "trips_tenant_update" ON public.trips;
DROP POLICY IF EXISTS "trips_tenant_delete" ON public.trips;

CREATE POLICY "trips_tenant_select" ON public.trips
  FOR SELECT TO authenticated
  USING (tenant_id = current_tenant_id());

CREATE POLICY "trips_tenant_insert" ON public.trips
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "trips_tenant_update" ON public.trips
  FOR UPDATE TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "trips_tenant_delete" ON public.trips
  FOR DELETE TO authenticated
  USING (tenant_id = current_tenant_id());

-- trip_stops (geen tenant_id, scope via trips)
DROP POLICY IF EXISTS "trip_stops_all" ON public.trip_stops;
DROP POLICY IF EXISTS "trip_stops_tenant_select" ON public.trip_stops;
DROP POLICY IF EXISTS "trip_stops_tenant_insert" ON public.trip_stops;
DROP POLICY IF EXISTS "trip_stops_tenant_update" ON public.trip_stops;
DROP POLICY IF EXISTS "trip_stops_tenant_delete" ON public.trip_stops;

CREATE POLICY "trip_stops_tenant_select" ON public.trip_stops
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_stops.trip_id
        AND t.tenant_id = current_tenant_id()
    )
  );

CREATE POLICY "trip_stops_tenant_insert" ON public.trip_stops
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_stops.trip_id
        AND t.tenant_id = current_tenant_id()
    )
  );

CREATE POLICY "trip_stops_tenant_update" ON public.trip_stops
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_stops.trip_id
        AND t.tenant_id = current_tenant_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_stops.trip_id
        AND t.tenant_id = current_tenant_id()
    )
  );

CREATE POLICY "trip_stops_tenant_delete" ON public.trip_stops
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_stops.trip_id
        AND t.tenant_id = current_tenant_id()
    )
  );

-- delivery_exceptions
DROP POLICY IF EXISTS "dex_all" ON public.delivery_exceptions;
DROP POLICY IF EXISTS "delivery_exceptions_tenant_select" ON public.delivery_exceptions;
DROP POLICY IF EXISTS "delivery_exceptions_tenant_insert" ON public.delivery_exceptions;
DROP POLICY IF EXISTS "delivery_exceptions_tenant_update" ON public.delivery_exceptions;
DROP POLICY IF EXISTS "delivery_exceptions_tenant_delete" ON public.delivery_exceptions;

CREATE POLICY "delivery_exceptions_tenant_select" ON public.delivery_exceptions
  FOR SELECT TO authenticated
  USING (tenant_id = current_tenant_id());

CREATE POLICY "delivery_exceptions_tenant_insert" ON public.delivery_exceptions
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "delivery_exceptions_tenant_update" ON public.delivery_exceptions
  FOR UPDATE TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "delivery_exceptions_tenant_delete" ON public.delivery_exceptions
  FOR DELETE TO authenticated
  USING (tenant_id = current_tenant_id());

-- INSERT-policies aanscherpen
-- Was: WITH CHECK (true) voor rol public; iedereen kan in elke tenant inserten.
-- Wordt: tenant-gescoped voor authenticated.

DROP POLICY IF EXISTS "Anyone can insert ai_decisions"       ON public.ai_decisions;
DROP POLICY IF EXISTS "Anyone can insert anomalies"          ON public.anomalies;
DROP POLICY IF EXISTS "Anyone can insert confidence_metrics" ON public.confidence_metrics;
DROP POLICY IF EXISTS "Anyone can insert disruptions"        ON public.disruptions;
DROP POLICY IF EXISTS "Anyone can insert order_events"       ON public.order_events;
DROP POLICY IF EXISTS "Anyone can insert replan_suggestions" ON public.replan_suggestions;
DROP POLICY IF EXISTS "ai_decisions_tenant_insert"           ON public.ai_decisions;
DROP POLICY IF EXISTS "anomalies_tenant_insert"              ON public.anomalies;
DROP POLICY IF EXISTS "confidence_metrics_tenant_insert"     ON public.confidence_metrics;
DROP POLICY IF EXISTS "disruptions_tenant_insert"            ON public.disruptions;
DROP POLICY IF EXISTS "order_events_tenant_insert"           ON public.order_events;
DROP POLICY IF EXISTS "replan_suggestions_tenant_insert"     ON public.replan_suggestions;

CREATE POLICY "ai_decisions_tenant_insert" ON public.ai_decisions
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "anomalies_tenant_insert" ON public.anomalies
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "confidence_metrics_tenant_insert" ON public.confidence_metrics
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "disruptions_tenant_insert" ON public.disruptions
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "order_events_tenant_insert" ON public.order_events
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "replan_suggestions_tenant_insert" ON public.replan_suggestions
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = current_tenant_id());
