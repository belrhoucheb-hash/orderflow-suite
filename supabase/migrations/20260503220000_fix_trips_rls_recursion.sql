-- Fix recursive RLS on trips/trip_stops.
--
-- Symptom in the app:
--   infinite recursion detected in policy for relation "trips"
--
-- Cause:
--   trip_stops policies scope access through public.trips. When Postgres
--   evaluates this under RLS, it can re-enter trips policies. Keep trips
--   policies direct, and move trip access checks for child tables into a
--   SECURITY DEFINER helper so the internal lookup does not recurse.

CREATE OR REPLACE FUNCTION public.current_user_can_access_trip(p_trip_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.trips t
     WHERE t.id = p_trip_id
       AND t.tenant_id = public.current_tenant_id()
  );
$$;

ALTER FUNCTION public.current_user_can_access_trip(uuid) OWNER TO postgres;

-- Remove known authenticated/public trip policies that can conflict or recurse.
DROP POLICY IF EXISTS "trips_all" ON public.trips;
DROP POLICY IF EXISTS "trips_tenant_select" ON public.trips;
DROP POLICY IF EXISTS "trips_tenant_insert" ON public.trips;
DROP POLICY IF EXISTS "trips_tenant_update" ON public.trips;
DROP POLICY IF EXISTS "trips_tenant_delete" ON public.trips;
DROP POLICY IF EXISTS "Authenticated users can read trips" ON public.trips;
DROP POLICY IF EXISTS "Authenticated users can insert trips" ON public.trips;
DROP POLICY IF EXISTS "Authenticated users can update trips" ON public.trips;
DROP POLICY IF EXISTS "Authenticated users can delete trips" ON public.trips;
DROP POLICY IF EXISTS "Users can read trips in their tenant" ON public.trips;
DROP POLICY IF EXISTS "Users can insert trips in their tenant" ON public.trips;
DROP POLICY IF EXISTS "Users can update trips in their tenant" ON public.trips;
DROP POLICY IF EXISTS "Users can delete trips in their tenant" ON public.trips;

CREATE POLICY "trips_tenant_select" ON public.trips
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

CREATE POLICY "trips_tenant_insert" ON public.trips
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id());

CREATE POLICY "trips_tenant_update" ON public.trips
  FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

CREATE POLICY "trips_tenant_delete" ON public.trips
  FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id());

-- trip_stops has no tenant_id; scope through the definer helper above.
DROP POLICY IF EXISTS "trip_stops_all" ON public.trip_stops;
DROP POLICY IF EXISTS "trip_stops_tenant_select" ON public.trip_stops;
DROP POLICY IF EXISTS "trip_stops_tenant_insert" ON public.trip_stops;
DROP POLICY IF EXISTS "trip_stops_tenant_update" ON public.trip_stops;
DROP POLICY IF EXISTS "trip_stops_tenant_delete" ON public.trip_stops;
DROP POLICY IF EXISTS "Authenticated users can read trip_stops" ON public.trip_stops;
DROP POLICY IF EXISTS "Authenticated users can insert trip_stops" ON public.trip_stops;
DROP POLICY IF EXISTS "Authenticated users can update trip_stops" ON public.trip_stops;
DROP POLICY IF EXISTS "Authenticated users can delete trip_stops" ON public.trip_stops;
DROP POLICY IF EXISTS "Users can read trip stops in their tenant" ON public.trip_stops;
DROP POLICY IF EXISTS "Users can insert trip stops in their tenant" ON public.trip_stops;
DROP POLICY IF EXISTS "Users can update trip stops in their tenant" ON public.trip_stops;
DROP POLICY IF EXISTS "Users can delete trip stops in their tenant" ON public.trip_stops;

CREATE POLICY "trip_stops_tenant_select" ON public.trip_stops
  FOR SELECT TO authenticated
  USING (public.current_user_can_access_trip(trip_id));

CREATE POLICY "trip_stops_tenant_insert" ON public.trip_stops
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_access_trip(trip_id));

CREATE POLICY "trip_stops_tenant_update" ON public.trip_stops
  FOR UPDATE TO authenticated
  USING (public.current_user_can_access_trip(trip_id))
  WITH CHECK (public.current_user_can_access_trip(trip_id));

CREATE POLICY "trip_stops_tenant_delete" ON public.trip_stops
  FOR DELETE TO authenticated
  USING (public.current_user_can_access_trip(trip_id));
