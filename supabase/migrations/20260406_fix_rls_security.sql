-- ============================================================
-- Security Fix: Close open RLS policies (2026-04-06)
--
-- Addresses critical findings from security audit:
--   C2: trips, trip_stops, proof_of_delivery, delivery_exceptions
--       had USING(true) WITH CHECK(true) — open to everyone
--   C3: orders and clients had open policies for anon/authenticated
--   C4: vehicle_positions open for everyone (SELECT + INSERT)
-- ============================================================

-- ─── C2: Replace open RLS on delivery tables ──────────────────
-- The original "allow all" policies were already replaced by
-- 20260402_fix_dispatch_rls.sql, but drop them again defensively
-- in case they were re-created (e.g. by dev_rls_bypass.sql).

DROP POLICY IF EXISTS "trips_all" ON public.trips;
DROP POLICY IF EXISTS "trip_stops_all" ON public.trip_stops;
DROP POLICY IF EXISTS "pod_all" ON public.proof_of_delivery;
DROP POLICY IF EXISTS "dex_all" ON public.delivery_exceptions;

-- Also drop any dev bypass policies that may have been applied
DROP POLICY IF EXISTS "dev_anon_bypass_trips" ON public.trips;
DROP POLICY IF EXISTS "dev_anon_bypass_trip_stops" ON public.trip_stops;
DROP POLICY IF EXISTS "dev_anon_bypass_proof_of_delivery" ON public.proof_of_delivery;
DROP POLICY IF EXISTS "dev_anon_bypass_delivery_exceptions" ON public.delivery_exceptions;

-- Ensure proper tenant-isolated policies exist (idempotent: drop + create)
-- Trips: direct tenant_id column
DROP POLICY IF EXISTS "trips_tenant_isolation" ON public.trips;
CREATE POLICY "trips_tenant_isolation" ON public.trips
  FOR ALL
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- Trip Stops: no tenant_id — join through trips
DROP POLICY IF EXISTS "trip_stops_tenant_isolation" ON public.trip_stops;
CREATE POLICY "trip_stops_tenant_isolation" ON public.trip_stops
  FOR ALL
  TO authenticated
  USING (
    trip_id IN (SELECT id FROM public.trips WHERE tenant_id = public.get_user_tenant_id())
  )
  WITH CHECK (
    trip_id IN (SELECT id FROM public.trips WHERE tenant_id = public.get_user_tenant_id())
  );

-- Proof of Delivery: no tenant_id — join through trip_stops -> trips
DROP POLICY IF EXISTS "pod_tenant_isolation" ON public.proof_of_delivery;
CREATE POLICY "pod_tenant_isolation" ON public.proof_of_delivery
  FOR ALL
  TO authenticated
  USING (
    trip_stop_id IN (
      SELECT ts.id FROM public.trip_stops ts
      JOIN public.trips t ON t.id = ts.trip_id
      WHERE t.tenant_id = public.get_user_tenant_id()
    )
  )
  WITH CHECK (
    trip_stop_id IN (
      SELECT ts.id FROM public.trip_stops ts
      JOIN public.trips t ON t.id = ts.trip_id
      WHERE t.tenant_id = public.get_user_tenant_id()
    )
  );

-- Delivery Exceptions: direct tenant_id column
DROP POLICY IF EXISTS "dex_tenant_isolation" ON public.delivery_exceptions;
CREATE POLICY "dex_tenant_isolation" ON public.delivery_exceptions
  FOR ALL
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());


-- ─── C3: Replace open RLS on orders and clients ──────────────

-- Drop original open policies (may still exist if migrations ran out of order)
DROP POLICY IF EXISTS "Orders are publicly readable" ON public.orders;
DROP POLICY IF EXISTS "Anyone can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Anyone can update orders" ON public.orders;
DROP POLICY IF EXISTS "Anyone can delete orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can read orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can update orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can delete orders" ON public.orders;

-- Drop dev bypass policies
DROP POLICY IF EXISTS "dev_anon_bypass_orders" ON public.orders;
DROP POLICY IF EXISTS "dev_anon_bypass_clients" ON public.clients;

-- Drop old client policies
DROP POLICY IF EXISTS "Clients are publicly readable" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can insert clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can update clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can delete clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can read clients" ON public.clients;

-- Create tenant-isolated policies for orders
DROP POLICY IF EXISTS "orders_tenant_isolation" ON public.orders;
CREATE POLICY "orders_tenant_isolation" ON public.orders
  FOR ALL
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- Create tenant-isolated policies for clients
DROP POLICY IF EXISTS "clients_tenant_isolation" ON public.clients;
CREATE POLICY "clients_tenant_isolation" ON public.clients
  FOR ALL
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());


-- ─── C4: Replace open RLS on vehicle_positions ────────────────

DROP POLICY IF EXISTS "Anyone can read vehicle_positions" ON public.vehicle_positions;
DROP POLICY IF EXISTS "Anyone can insert vehicle_positions" ON public.vehicle_positions;
DROP POLICY IF EXISTS "vehicle_positions_select" ON public.vehicle_positions;
DROP POLICY IF EXISTS "vehicle_positions_insert" ON public.vehicle_positions;
DROP POLICY IF EXISTS "dev_anon_bypass_vehicle_positions" ON public.vehicle_positions;

-- vehicle_positions already has tenant_id (nullable); backfill NULLs
UPDATE public.vehicle_positions
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

DROP POLICY IF EXISTS "vehicle_positions_tenant_isolation" ON public.vehicle_positions;
CREATE POLICY "vehicle_positions_tenant_isolation" ON public.vehicle_positions
  FOR ALL
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- Service role bypass for vehicle_positions (edge functions need access)
DROP POLICY IF EXISTS "vehicle_positions_service_role" ON public.vehicle_positions;
CREATE POLICY "vehicle_positions_service_role" ON public.vehicle_positions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ─── Clean up remaining dev bypass policies on other tables ───
-- These were created by dev_rls_bypass.sql and should not exist
-- in production. Drop them all defensively.

DO $$
DECLARE
  tbl text;
  pol text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'tenants','tenant_members','clients','client_locations','client_rates',
    'orders','vehicles','vehicle_documents','vehicle_maintenance','vehicle_availability',
    'drivers','notifications','profiles','user_roles',
    'invoices','invoice_lines',
    'ai_usage_log','client_extraction_templates','activity_log',
    'vehicle_types','loading_units','requirement_types',
    'trips','trip_stops','proof_of_delivery','delivery_exceptions',
    'audit_log','webhook_subscriptions','driver_positions','driver_time_entries',
    'ai_corrections','tenant_settings','planning_drafts'
  ]
  LOOP
    pol := 'dev_anon_bypass_' || tbl;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, tbl);
  END LOOP;
END;
$$;
