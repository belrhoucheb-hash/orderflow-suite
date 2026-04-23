-- ─── RLS service_role policies expliciet maken ──────────────────────
-- Vervangt alle policies met `USING (true) WITH CHECK (true)` die op
-- TO service_role staan door dezelfde policies met
-- `USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role')`.
--
-- service_role bypassed RLS sowieso, dus dit is geen functionele
-- security-fix. Het maakt de definities expliciet zodat audit-tooling
-- (Supabase advisors, custom checks) geen waarschuwingen meer afgeeft
-- over "policy USING (true)".
--
-- Beleid: per policy een DROP IF EXISTS + CREATE met identieke naam,
-- commando en TO-rol. Authenticated-policies worden NIET geraakt.

-- ─── Baseline: 20260419000000_baseline.sql ───────────────────────────

DROP POLICY IF EXISTS "Service role full access on client_contacts" ON public.client_contacts;
CREATE POLICY "Service role full access on client_contacts" ON public.client_contacts
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access tenants" ON public.tenants;
CREATE POLICY "Service role full access tenants" ON public.tenants
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role: activity_log" ON public.activity_log;
CREATE POLICY "Service role: activity_log" ON public.activity_log
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role: ai_usage_log" ON public.ai_usage_log;
CREATE POLICY "Service role: ai_usage_log" ON public.ai_usage_log
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role: clients" ON public.clients;
CREATE POLICY "Service role: clients" ON public.clients
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role: cost_types" ON public.cost_types;
CREATE POLICY "Service role: cost_types" ON public.cost_types
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role: drivers" ON public.drivers;
CREATE POLICY "Service role: drivers" ON public.drivers
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role: extraction_templates" ON public.client_extraction_templates;
CREATE POLICY "Service role: extraction_templates" ON public.client_extraction_templates
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role: invoice_lines" ON public.invoice_lines;
CREATE POLICY "Service role: invoice_lines" ON public.invoice_lines
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role: invoices" ON public.invoices;
CREATE POLICY "Service role: invoices" ON public.invoices
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role: loading_units" ON public.loading_units;
CREATE POLICY "Service role: loading_units" ON public.loading_units
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role: notifications" ON public.notifications;
CREATE POLICY "Service role: notifications" ON public.notifications
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role: orders" ON public.orders;
CREATE POLICY "Service role: orders" ON public.orders
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role: rate_limit_counters" ON public.rate_limit_counters;
CREATE POLICY "Service role: rate_limit_counters" ON public.rate_limit_counters
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role: requirement_types" ON public.requirement_types;
CREATE POLICY "Service role: requirement_types" ON public.requirement_types
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role: tenant_inbox_audit" ON public.tenant_inbox_audit;
CREATE POLICY "Service role: tenant_inbox_audit" ON public.tenant_inbox_audit
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role: tenant_inboxes" ON public.tenant_inboxes;
CREATE POLICY "Service role: tenant_inboxes" ON public.tenant_inboxes
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role: trip_costs" ON public.trip_costs;
CREATE POLICY "Service role: trip_costs" ON public.trip_costs
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role: vehicle_fixed_costs" ON public.vehicle_fixed_costs;
CREATE POLICY "Service role: vehicle_fixed_costs" ON public.vehicle_fixed_costs
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role: vehicle_types" ON public.vehicle_types;
CREATE POLICY "Service role: vehicle_types" ON public.vehicle_types
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role: vehicles" ON public.vehicles;
CREATE POLICY "Service role: vehicles" ON public.vehicles
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "ai_corrections_service_role" ON public.ai_corrections;
CREATE POLICY "ai_corrections_service_role" ON public.ai_corrections
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "audit_log_service_role" ON public.audit_log;
CREATE POLICY "audit_log_service_role" ON public.audit_log
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "client_portal_users_service_role" ON public.client_portal_users;
CREATE POLICY "client_portal_users_service_role" ON public.client_portal_users
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "consolidation_groups_service" ON public.consolidation_groups;
CREATE POLICY "consolidation_groups_service" ON public.consolidation_groups
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "consolidation_orders_service" ON public.consolidation_orders;
CREATE POLICY "consolidation_orders_service" ON public.consolidation_orders
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "delivery_exceptions_service_role" ON public.delivery_exceptions;
CREATE POLICY "delivery_exceptions_service_role" ON public.delivery_exceptions
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "driver_positions_service_role" ON public.driver_positions;
CREATE POLICY "driver_positions_service_role" ON public.driver_positions
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "driver_time_entries_service_role" ON public.driver_time_entries;
CREATE POLICY "driver_time_entries_service_role" ON public.driver_time_entries
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "location_time_windows_service" ON public.location_time_windows;
CREATE POLICY "location_time_windows_service" ON public.location_time_windows
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "notification_log_service_role" ON public.notification_log;
CREATE POLICY "notification_log_service_role" ON public.notification_log
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "notification_templates_service_role" ON public.notification_templates;
CREATE POLICY "notification_templates_service_role" ON public.notification_templates
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "packaging_movements_service_role" ON public.packaging_movements;
CREATE POLICY "packaging_movements_service_role" ON public.packaging_movements
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "proof_of_delivery_service_role" ON public.proof_of_delivery;
CREATE POLICY "proof_of_delivery_service_role" ON public.proof_of_delivery
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "rate_cards_service_role" ON public.rate_cards;
CREATE POLICY "rate_cards_service_role" ON public.rate_cards
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "rate_rules_service_role" ON public.rate_rules;
CREATE POLICY "rate_rules_service_role" ON public.rate_rules
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "slot_bookings_service" ON public.slot_bookings;
CREATE POLICY "slot_bookings_service" ON public.slot_bookings
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "surcharges_service_role" ON public.surcharges;
CREATE POLICY "surcharges_service_role" ON public.surcharges
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "trip_stops_service_role" ON public.trip_stops;
CREATE POLICY "trip_stops_service_role" ON public.trip_stops
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "trips_service_role" ON public.trips;
CREATE POLICY "trips_service_role" ON public.trips
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ─── 20260419000200_order_charges.sql ────────────────────────────────

DROP POLICY IF EXISTS "order_charges_service_role" ON public.order_charges;
CREATE POLICY "order_charges_service_role" ON public.order_charges
  FOR ALL TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ─── 20260420000100_driver_availability.sql ──────────────────────────

DROP POLICY IF EXISTS "driver_availability_service_role" ON public.driver_availability;
CREATE POLICY "driver_availability_service_role" ON public.driver_availability
  FOR ALL TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ─── 20260421160000_driver_certifications_master.sql ─────────────────

DROP POLICY IF EXISTS "Service role: driver_certifications" ON public.driver_certifications;
CREATE POLICY "Service role: driver_certifications" ON public.driver_certifications
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ─── 20260422001000_clients_notes_and_audit.sql ──────────────────────

DROP POLICY IF EXISTS "Service role: client_audit_log" ON public.client_audit_log;
CREATE POLICY "Service role: client_audit_log" ON public.client_audit_log
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ─── 20260422120000_driver_certificate_records.sql ───────────────────
-- Deze policy is in 20260421170100 aangemaakt en in 20260422120000
-- via DROP + CREATE opnieuw gezet. We vervangen de huidige (laatste)
-- definitie eenmalig.

DROP POLICY IF EXISTS "Service role: driver_cert_expiry" ON public.driver_certification_expiry;
CREATE POLICY "Service role: driver_cert_expiry" ON public.driver_certification_expiry
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ─── 20260422130000_certificate_expiry_notifications.sql ─────────────

DROP POLICY IF EXISTS "Service role: driver_cert_notif_sent" ON public.driver_certificate_notifications_sent;
CREATE POLICY "Service role: driver_cert_notif_sent" ON public.driver_certificate_notifications_sent
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
