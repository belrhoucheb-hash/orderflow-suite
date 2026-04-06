-- ============================================================
-- SECURITY HARDENING: Replace all USING(true) with tenant isolation
-- ============================================================
-- This migration drops every dangerous USING(true) policy that grants
-- cross-tenant access and replaces them with proper tenant_id checks.
-- service_role policies (USING(true)) are intentionally left alone —
-- Edge Functions need full bypass via the service key.
-- ============================================================

-- ─── Helper function ────────────────────────────
-- Consolidate the two existing helpers into one canonical function.
CREATE OR REPLACE FUNCTION public.current_tenant_id() RETURNS uuid AS $$
  SELECT COALESCE(
    (auth.jwt()->'app_metadata'->>'tenant_id')::uuid,
    (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() LIMIT 1)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;


-- ═══════════════════════════════════════════════
-- CORE TABLES (from combined_setup / early migrations)
-- ═══════════════════════════════════════════════

-- ─── ORDERS ─────────────────────────────────────
DROP POLICY IF EXISTS "Orders are publicly readable" ON public.orders;
DROP POLICY IF EXISTS "Anyone can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Anyone can update orders" ON public.orders;
DROP POLICY IF EXISTS "Anyone can delete orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can read orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can update orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can delete orders" ON public.orders;

CREATE POLICY "tenant_read_orders" ON public.orders FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant_insert_orders" ON public.orders FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant_update_orders" ON public.orders FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant_delete_orders" ON public.orders FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id());

-- ─── CLIENTS ────────────────────────────────────
DROP POLICY IF EXISTS "Clients are publicly readable" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can insert clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can update clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can delete clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can read clients" ON public.clients;

CREATE POLICY "tenant_read_clients" ON public.clients FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant_insert_clients" ON public.clients FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant_update_clients" ON public.clients FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id());

-- ─── VEHICLES ───────────────────────────────────
DROP POLICY IF EXISTS "Vehicles are publicly readable" ON public.vehicles;
DROP POLICY IF EXISTS "Authenticated users can manage vehicles" ON public.vehicles;

CREATE POLICY "tenant_read_vehicles" ON public.vehicles FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant_insert_vehicles" ON public.vehicles FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant_update_vehicles" ON public.vehicles FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id());

-- ─── NOTIFICATIONS ──────────────────────────────
DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can read all notifications" ON public.notifications;
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can mark own notifications as read" ON public.notifications;
DROP POLICY IF EXISTS "Authenticated users can read notifications" ON public.notifications;
DROP POLICY IF EXISTS "Authenticated users can update notifications" ON public.notifications;
DROP POLICY IF EXISTS "Authenticated users can delete notifications" ON public.notifications;
DROP POLICY IF EXISTS "notifications_tenant_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_tenant_insert" ON public.notifications;
DROP POLICY IF EXISTS "notifications_tenant_update" ON public.notifications;

CREATE POLICY "tenant_read_notifications" ON public.notifications FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() AND (user_id IS NULL OR user_id = auth.uid()));
CREATE POLICY "tenant_insert_notifications" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant_update_notifications" ON public.notifications FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND (user_id IS NULL OR user_id = auth.uid()));

-- ─── PROFILES ───────────────────────────────────
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_tenant_select" ON public.profiles;

CREATE POLICY "tenant_read_profiles" ON public.profiles FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
CREATE POLICY "users_update_own_profile" ON public.profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- ─── DRIVERS ────────────────────────────────────
DROP POLICY IF EXISTS "Drivers are readable" ON public.drivers;
DROP POLICY IF EXISTS "drivers_tenant_select" ON public.drivers;

CREATE POLICY "tenant_read_drivers" ON public.drivers FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

-- ─── USER_ROLES ─────────────────────────────────
-- user_roles has no tenant_id but is keyed on user_id;
-- restrict to own roles (users see only their own roles)
DROP POLICY IF EXISTS "Authenticated users can view roles" ON public.user_roles;

CREATE POLICY "users_read_own_roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());


-- ═══════════════════════════════════════════════
-- CHILD TABLES (no tenant_id — secured via parent FK join)
-- ═══════════════════════════════════════════════

-- ─── CLIENT_LOCATIONS ───────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read client_locations" ON public.client_locations;

CREATE POLICY "tenant_read_client_locations" ON public.client_locations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = client_id AND c.tenant_id = public.current_tenant_id()
  ));
CREATE POLICY "tenant_insert_client_locations" ON public.client_locations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = client_id AND c.tenant_id = public.current_tenant_id()
  ));
CREATE POLICY "tenant_update_client_locations" ON public.client_locations FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = client_id AND c.tenant_id = public.current_tenant_id()
  ));

-- ─── CLIENT_RATES ───────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read client_rates" ON public.client_rates;

CREATE POLICY "tenant_read_client_rates" ON public.client_rates FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = client_id AND c.tenant_id = public.current_tenant_id()
  ));
CREATE POLICY "tenant_insert_client_rates" ON public.client_rates FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = client_id AND c.tenant_id = public.current_tenant_id()
  ));
CREATE POLICY "tenant_update_client_rates" ON public.client_rates FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = client_id AND c.tenant_id = public.current_tenant_id()
  ));

-- ─── VEHICLE_DOCUMENTS ─────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read vehicle_documents" ON public.vehicle_documents;

CREATE POLICY "tenant_read_vehicle_documents" ON public.vehicle_documents FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = vehicle_id AND v.tenant_id = public.current_tenant_id()
  ));
CREATE POLICY "tenant_insert_vehicle_documents" ON public.vehicle_documents FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = vehicle_id AND v.tenant_id = public.current_tenant_id()
  ));
CREATE POLICY "tenant_update_vehicle_documents" ON public.vehicle_documents FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = vehicle_id AND v.tenant_id = public.current_tenant_id()
  ));

-- ─── VEHICLE_MAINTENANCE ───────────────────────
DROP POLICY IF EXISTS "Authenticated users can read vehicle_maintenance" ON public.vehicle_maintenance;

CREATE POLICY "tenant_read_vehicle_maintenance" ON public.vehicle_maintenance FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = vehicle_id AND v.tenant_id = public.current_tenant_id()
  ));
CREATE POLICY "tenant_insert_vehicle_maintenance" ON public.vehicle_maintenance FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = vehicle_id AND v.tenant_id = public.current_tenant_id()
  ));
CREATE POLICY "tenant_update_vehicle_maintenance" ON public.vehicle_maintenance FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = vehicle_id AND v.tenant_id = public.current_tenant_id()
  ));

-- ─── VEHICLE_AVAILABILITY ──────────────────────
DROP POLICY IF EXISTS "Authenticated users can read vehicle_availability" ON public.vehicle_availability;

CREATE POLICY "tenant_read_vehicle_availability" ON public.vehicle_availability FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = vehicle_id AND v.tenant_id = public.current_tenant_id()
  ));
CREATE POLICY "tenant_insert_vehicle_availability" ON public.vehicle_availability FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = vehicle_id AND v.tenant_id = public.current_tenant_id()
  ));
CREATE POLICY "tenant_update_vehicle_availability" ON public.vehicle_availability FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = vehicle_id AND v.tenant_id = public.current_tenant_id()
  ));


-- ═══════════════════════════════════════════════
-- AI / INTELLIGENCE TABLES (from multi_tenant_foundation)
-- ═══════════════════════════════════════════════

-- ─── AI_DECISIONS ───────────────────────────────
DROP POLICY IF EXISTS "Anyone can read ai_decisions" ON public.ai_decisions;
DROP POLICY IF EXISTS "Anyone can insert ai_decisions" ON public.ai_decisions;
DROP POLICY IF EXISTS "Anyone can update ai_decisions" ON public.ai_decisions;
DROP POLICY IF EXISTS "tenant_isolation" ON public.ai_decisions;

CREATE POLICY "tenant_read_ai_decisions" ON public.ai_decisions FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant_insert_ai_decisions" ON public.ai_decisions FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant_update_ai_decisions" ON public.ai_decisions FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id());

-- ─── CONFIDENCE_METRICS ────────────────────────
DROP POLICY IF EXISTS "Anyone can read confidence_metrics" ON public.confidence_metrics;
DROP POLICY IF EXISTS "Anyone can insert confidence_metrics" ON public.confidence_metrics;
DROP POLICY IF EXISTS "Anyone can update confidence_metrics" ON public.confidence_metrics;
DROP POLICY IF EXISTS "tenant_isolation" ON public.confidence_metrics;

CREATE POLICY "tenant_read_confidence_metrics" ON public.confidence_metrics FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant_insert_confidence_metrics" ON public.confidence_metrics FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id());

-- ─── ORDER_EVENTS ──────────────────────────────
DROP POLICY IF EXISTS "Anyone can read order_events" ON public.order_events;
DROP POLICY IF EXISTS "Anyone can insert order_events" ON public.order_events;
DROP POLICY IF EXISTS "Anyone can update order_events" ON public.order_events;
DROP POLICY IF EXISTS "tenant_isolation" ON public.order_events;

CREATE POLICY "tenant_read_order_events" ON public.order_events FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant_insert_order_events" ON public.order_events FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id());

-- ─── DISRUPTIONS ────────────────────────────────
DROP POLICY IF EXISTS "Anyone can read disruptions" ON public.disruptions;
DROP POLICY IF EXISTS "Anyone can insert disruptions" ON public.disruptions;
DROP POLICY IF EXISTS "Anyone can update disruptions" ON public.disruptions;
DROP POLICY IF EXISTS "tenant_isolation" ON public.disruptions;

CREATE POLICY "tenant_read_disruptions" ON public.disruptions FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant_insert_disruptions" ON public.disruptions FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant_update_disruptions" ON public.disruptions FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id());

-- ─── REPLAN_SUGGESTIONS ────────────────────────
DROP POLICY IF EXISTS "Anyone can read replan_suggestions" ON public.replan_suggestions;
DROP POLICY IF EXISTS "Anyone can insert replan_suggestions" ON public.replan_suggestions;
DROP POLICY IF EXISTS "Anyone can update replan_suggestions" ON public.replan_suggestions;
DROP POLICY IF EXISTS "tenant_isolation" ON public.replan_suggestions;

CREATE POLICY "tenant_read_replan_suggestions" ON public.replan_suggestions FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant_insert_replan_suggestions" ON public.replan_suggestions FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant_update_replan_suggestions" ON public.replan_suggestions FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id());

-- ─── ANOMALIES ──────────────────────────────────
DROP POLICY IF EXISTS "Anyone can read anomalies" ON public.anomalies;
DROP POLICY IF EXISTS "Anyone can insert anomalies" ON public.anomalies;
DROP POLICY IF EXISTS "Anyone can update anomalies" ON public.anomalies;
DROP POLICY IF EXISTS "tenant_isolation" ON public.anomalies;

CREATE POLICY "tenant_read_anomalies" ON public.anomalies FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant_insert_anomalies" ON public.anomalies FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant_update_anomalies" ON public.anomalies FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id());

-- ─── VEHICLE_POSITIONS ─────────────────────────
DROP POLICY IF EXISTS "Anyone can read vehicle_positions" ON public.vehicle_positions;
DROP POLICY IF EXISTS "Anyone can insert vehicle_positions" ON public.vehicle_positions;
DROP POLICY IF EXISTS "tenant_isolation" ON public.vehicle_positions;

CREATE POLICY "tenant_read_vehicle_positions" ON public.vehicle_positions FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant_insert_vehicle_positions" ON public.vehicle_positions FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id());


-- ═══════════════════════════════════════════════
-- DISPATCH / DELIVERY TABLES (20260402_dispatch_to_delivery)
-- These had "Allow all for now (tighten in production)"
-- ═══════════════════════════════════════════════

-- ─── TRIPS ──────────────────────────────────────
DROP POLICY IF EXISTS "trips_all" ON public.trips;

CREATE POLICY "tenant_read_trips" ON public.trips FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant_insert_trips" ON public.trips FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant_update_trips" ON public.trips FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant_delete_trips" ON public.trips FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id());

-- ─── TRIP_STOPS ─────────────────────────────────
DROP POLICY IF EXISTS "trip_stops_all" ON public.trip_stops;

CREATE POLICY "tenant_read_trip_stops" ON public.trip_stops FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = trip_id AND t.tenant_id = public.current_tenant_id()
  ));
CREATE POLICY "tenant_insert_trip_stops" ON public.trip_stops FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = trip_id AND t.tenant_id = public.current_tenant_id()
  ));
CREATE POLICY "tenant_update_trip_stops" ON public.trip_stops FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = trip_id AND t.tenant_id = public.current_tenant_id()
  ));

-- ─── PROOF_OF_DELIVERY ─────────────────────────
DROP POLICY IF EXISTS "pod_all" ON public.proof_of_delivery;

CREATE POLICY "tenant_read_pod" ON public.proof_of_delivery FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trip_stops ts
    JOIN public.trips t ON t.id = ts.trip_id
    WHERE ts.id = stop_id AND t.tenant_id = public.current_tenant_id()
  ));
CREATE POLICY "tenant_insert_pod" ON public.proof_of_delivery FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.trip_stops ts
    JOIN public.trips t ON t.id = ts.trip_id
    WHERE ts.id = stop_id AND t.tenant_id = public.current_tenant_id()
  ));
CREATE POLICY "tenant_update_pod" ON public.proof_of_delivery FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trip_stops ts
    JOIN public.trips t ON t.id = ts.trip_id
    WHERE ts.id = stop_id AND t.tenant_id = public.current_tenant_id()
  ));

-- ─── DELIVERY_EXCEPTIONS ───────────────────────
DROP POLICY IF EXISTS "dex_all" ON public.delivery_exceptions;

CREATE POLICY "tenant_read_dex" ON public.delivery_exceptions FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant_insert_dex" ON public.delivery_exceptions FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant_update_dex" ON public.delivery_exceptions FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id());


-- ═══════════════════════════════════════════════
-- DRIVER TRACKING TABLES (20260330_multi_tenant_fix)
-- These had USING(true) select policies
-- ═══════════════════════════════════════════════

-- ─── DRIVER_POSITIONS ──────────────────────────
DROP POLICY IF EXISTS "driver_positions_select" ON public.driver_positions;

CREATE POLICY "tenant_read_driver_positions" ON public.driver_positions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.id = driver_id AND d.tenant_id = public.current_tenant_id()
  ));

-- ─── DRIVER_TIME_ENTRIES ───────────────────────
DROP POLICY IF EXISTS "driver_time_select" ON public.driver_time_entries;

CREATE POLICY "tenant_read_driver_time_entries" ON public.driver_time_entries FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.id = driver_id AND d.tenant_id = public.current_tenant_id()
  ));


-- ═══════════════════════════════════════════════
-- NOTE: service_role policies with USING(true) are intentionally
-- NOT dropped. These exist on: orders, vehicles, clients, notifications,
-- drivers, ai_usage_log, extraction_templates, activity_log,
-- vehicle_types, loading_units, requirement_types, invoices,
-- invoice_lines, audit_log, driver_positions, driver_time_entries,
-- ai_corrections, storage.objects, location_time_windows,
-- slot_bookings, client_portal_users, notification_templates,
-- notification_log, rate_cards, rate_rules, surcharges,
-- packaging_movements, cost_types, trip_costs, vehicle_fixed_costs,
-- consolidation_groups, consolidation_orders, pipeline_events,
-- validation_queue, dispatch_rules, dispatch_anomalies, tenants.
--
-- service_role bypasses RLS by design and is only used by
-- Edge Functions with the server-side service key.
-- ═══════════════════════════════════════════════
