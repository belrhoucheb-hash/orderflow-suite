-- Fix JWT tenant_id for existing Royalty Cargo admins so they retain access
-- after the dev_anon_bypass policies are dropped.
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('tenant_id', tm.tenant_id::text)
FROM tenant_members tm
WHERE tm.user_id = auth.users.id
  AND (auth.users.raw_app_meta_data->>'tenant_id') IS NULL;

-- Drop all dev_anon_bypass_* policies. These were leaking Royalty Cargo data
-- (and in some cases all tenants) to any authenticated user.
DROP POLICY IF EXISTS "dev_anon_bypass_activity_log" ON public.activity_log;
DROP POLICY IF EXISTS "dev_anon_bypass_ai_usage_log" ON public.ai_usage_log;
DROP POLICY IF EXISTS "dev_anon_bypass_client_extraction_templates" ON public.client_extraction_templates;
DROP POLICY IF EXISTS "dev_anon_bypass_client_locations" ON public.client_locations;
DROP POLICY IF EXISTS "dev_anon_bypass_client_rates" ON public.client_rates;
DROP POLICY IF EXISTS "dev_anon_bypass_clients" ON public.clients;
DROP POLICY IF EXISTS "dev_anon_bypass_drivers" ON public.drivers;
DROP POLICY IF EXISTS "dev_anon_bypass_invoice_lines" ON public.invoice_lines;
DROP POLICY IF EXISTS "dev_anon_bypass_invoices" ON public.invoices;
DROP POLICY IF EXISTS "dev_anon_bypass_loading_units" ON public.loading_units;
DROP POLICY IF EXISTS "dev_anon_bypass_notifications" ON public.notifications;
DROP POLICY IF EXISTS "dev_anon_bypass_orders" ON public.orders;
DROP POLICY IF EXISTS "dev_anon_bypass_profiles" ON public.profiles;
DROP POLICY IF EXISTS "dev_anon_bypass_requirement_types" ON public.requirement_types;
DROP POLICY IF EXISTS "dev_anon_bypass_tenant_members" ON public.tenant_members;
DROP POLICY IF EXISTS "dev_anon_bypass_tenants" ON public.tenants;
DROP POLICY IF EXISTS "dev_anon_bypass_user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "dev_anon_bypass_vehicle_availability" ON public.vehicle_availability;
DROP POLICY IF EXISTS "dev_anon_bypass_vehicle_documents" ON public.vehicle_documents;
DROP POLICY IF EXISTS "dev_anon_bypass_vehicle_maintenance" ON public.vehicle_maintenance;
DROP POLICY IF EXISTS "dev_anon_bypass_vehicle_types" ON public.vehicle_types;
DROP POLICY IF EXISTS "dev_anon_bypass_vehicles" ON public.vehicles;
