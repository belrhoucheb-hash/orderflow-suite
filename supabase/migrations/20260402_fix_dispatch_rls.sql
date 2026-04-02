-- ============================================================
-- Security Fix: Proper RLS for dispatch tables
-- Replaces "allow all" policies with tenant-based isolation
-- ============================================================

-- ─── 1. Add tenant_id to trip_stops (via trips join) ────────
-- trip_stops inherits tenant from trips via FK, so we use a
-- subquery for RLS. No column addition needed.

-- ─── 2. Add tenant_id to proof_of_delivery (via trip_stops→trips)
-- Same approach: inherit tenant via join chain.

-- ─── 3. Drop insecure "allow all" policies ──────────────────
DROP POLICY IF EXISTS "trips_all" ON public.trips;
DROP POLICY IF EXISTS "trip_stops_all" ON public.trip_stops;
DROP POLICY IF EXISTS "pod_all" ON public.proof_of_delivery;
DROP POLICY IF EXISTS "dex_all" ON public.delivery_exceptions;

-- ─── 4. Create tenant-isolated policies ─────────────────────

-- Helper function to get tenant_id from JWT
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS UUID AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid,
    (current_setting('request.jwt.claims', true)::json->'app_metadata'->>'tenant_id')::uuid
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Trips: direct tenant_id column
CREATE POLICY "trips_tenant_select" ON public.trips
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "trips_tenant_insert" ON public.trips
  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id());
CREATE POLICY "trips_tenant_update" ON public.trips
  FOR UPDATE USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "trips_tenant_delete" ON public.trips
  FOR DELETE USING (tenant_id = public.get_user_tenant_id());

-- Trip Stops: via trips.tenant_id
CREATE POLICY "trip_stops_tenant_select" ON public.trip_stops
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.trips
      WHERE trips.id = trip_stops.trip_id
      AND trips.tenant_id = public.get_user_tenant_id()
    )
  );
CREATE POLICY "trip_stops_tenant_insert" ON public.trip_stops
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trips
      WHERE trips.id = trip_stops.trip_id
      AND trips.tenant_id = public.get_user_tenant_id()
    )
  );
CREATE POLICY "trip_stops_tenant_update" ON public.trip_stops
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.trips
      WHERE trips.id = trip_stops.trip_id
      AND trips.tenant_id = public.get_user_tenant_id()
    )
  );
CREATE POLICY "trip_stops_tenant_delete" ON public.trip_stops
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.trips
      WHERE trips.id = trip_stops.trip_id
      AND trips.tenant_id = public.get_user_tenant_id()
    )
  );

-- Proof of Delivery: via trip_stops → trips.tenant_id
CREATE POLICY "pod_tenant_select" ON public.proof_of_delivery
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.trip_stops
      JOIN public.trips ON trips.id = trip_stops.trip_id
      WHERE trip_stops.id = proof_of_delivery.trip_stop_id
      AND trips.tenant_id = public.get_user_tenant_id()
    )
  );
CREATE POLICY "pod_tenant_insert" ON public.proof_of_delivery
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trip_stops
      JOIN public.trips ON trips.id = trip_stops.trip_id
      WHERE trip_stops.id = proof_of_delivery.trip_stop_id
      AND trips.tenant_id = public.get_user_tenant_id()
    )
  );
CREATE POLICY "pod_tenant_update" ON public.proof_of_delivery
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.trip_stops
      JOIN public.trips ON trips.id = trip_stops.trip_id
      WHERE trip_stops.id = proof_of_delivery.trip_stop_id
      AND trips.tenant_id = public.get_user_tenant_id()
    )
  );
CREATE POLICY "pod_tenant_delete" ON public.proof_of_delivery
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.trip_stops
      JOIN public.trips ON trips.id = trip_stops.trip_id
      WHERE trip_stops.id = proof_of_delivery.trip_stop_id
      AND trips.tenant_id = public.get_user_tenant_id()
    )
  );

-- Delivery Exceptions: direct tenant_id column
CREATE POLICY "dex_tenant_select" ON public.delivery_exceptions
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "dex_tenant_insert" ON public.delivery_exceptions
  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id());
CREATE POLICY "dex_tenant_update" ON public.delivery_exceptions
  FOR UPDATE USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "dex_tenant_delete" ON public.delivery_exceptions
  FOR DELETE USING (tenant_id = public.get_user_tenant_id());

-- ─── 5. Service role bypass (for edge functions) ────────────
-- Service role key bypasses RLS by default in Supabase,
-- so edge functions using SUPABASE_SERVICE_ROLE_KEY will still work.
