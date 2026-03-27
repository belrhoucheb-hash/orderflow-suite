-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  FASE 1 — Multi-Tenant Foundation                                   ║
-- ║  Creates tenant infrastructure, drivers, stamgegevens,              ║
-- ║  adds tenant_id to ALL existing tables, rewrites RLS policies.      ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════
-- 1.1  TENANTS + TENANT_MEMBERS
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  logo_url text,
  primary_color text DEFAULT '#dc2626',
  settings jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- Tenants readable by members only (via JWT)
CREATE POLICY "Members can read own tenant"
  ON public.tenants FOR SELECT TO authenticated
  USING (id = ((SELECT auth.jwt()->'app_metadata'->>'tenant_id'))::uuid);

-- Service role can manage tenants (for admin panel)
CREATE POLICY "Service role full access tenants"
  ON public.tenants FOR ALL TO service_role
  USING (true) WITH CHECK (true);


CREATE TABLE public.tenant_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'planner',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);

ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read own tenant members"
  ON public.tenant_members FOR SELECT TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()->'app_metadata'->>'tenant_id'))::uuid);

CREATE POLICY "Owners/admins can manage tenant members"
  ON public.tenant_members FOR ALL TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()->'app_metadata'->>'tenant_id'))::uuid
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
      AND tm.tenant_id = ((SELECT auth.jwt()->'app_metadata'->>'tenant_id'))::uuid
      AND tm.role IN ('owner', 'admin')
    )
  );


-- ═══════════════════════════════════════════════════════════════════════
-- 1.2  DRIVERS TABLE
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE public.drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  license_number text,
  certifications text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'beschikbaar',
  current_vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_drivers_updated_at
  BEFORE UPDATE ON public.drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();


-- ═══════════════════════════════════════════════════════════════════════
-- 1.3  TENANT HELPER FUNCTION (JWT-based, no JOIN)
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT ((SELECT auth.jwt()->'app_metadata'->>'tenant_id'))::uuid
$$;

COMMENT ON FUNCTION public.current_tenant_id()
  IS 'Returns tenant_id from JWT app_metadata. Used by RLS policies. Wrapped in SELECT for caching.';


-- ═══════════════════════════════════════════════════════════════════════
-- 1.4  ADD tenant_id TO ALL EXISTING TABLES
-- ═══════════════════════════════════════════════════════════════════════

-- Orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- Vehicles
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- Clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- Notifications
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- Profiles (link user to tenant)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- Client locations
ALTER TABLE public.client_locations
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- Client rates
ALTER TABLE public.client_rates
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- Vehicle documents
ALTER TABLE public.vehicle_documents
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- Vehicle maintenance
ALTER TABLE public.vehicle_maintenance
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- Vehicle availability
ALTER TABLE public.vehicle_availability
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);


-- ═══════════════════════════════════════════════════════════════════════
-- 1.5  INITIAL TENANT + DATA MIGRATION
-- ═══════════════════════════════════════════════════════════════════════

-- Create the initial demo tenant
INSERT INTO public.tenants (id, name, slug, primary_color)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Royalty Cargo',
  'royalty-cargo',
  '#dc2626'
);

-- Assign ALL existing data to the demo tenant
UPDATE public.orders SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.vehicles SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.clients SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.notifications SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.profiles SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.client_locations SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.client_rates SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.vehicle_documents SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.vehicle_maintenance SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.vehicle_availability SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- Assign existing users as owners of the demo tenant
INSERT INTO public.tenant_members (tenant_id, user_id, role)
SELECT '00000000-0000-0000-0000-000000000001', user_id, 'owner'
FROM public.profiles
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- Now make tenant_id NOT NULL (after data migration)
ALTER TABLE public.orders ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.vehicles ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.clients ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.notifications ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.client_locations ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.client_rates ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.vehicle_documents ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.vehicle_maintenance ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.vehicle_availability ALTER COLUMN tenant_id SET NOT NULL;
-- profiles tenant_id stays nullable (user may not have a tenant yet)


-- ═══════════════════════════════════════════════════════════════════════
-- 1.6  REWRITE ALL RLS POLICIES FOR TENANT ISOLATION
-- ═══════════════════════════════════════════════════════════════════════

-- Helper: all policies use this pattern:
--   USING (tenant_id = (SELECT public.current_tenant_id()))
-- The (SELECT ...) wrapper ensures PostgreSQL caches the function result.

-- ─── ORDERS ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can update orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can delete orders" ON public.orders;
DROP POLICY IF EXISTS "Orders are publicly readable" ON public.orders;
DROP POLICY IF EXISTS "Anyone can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Anyone can update orders" ON public.orders;
DROP POLICY IF EXISTS "Anyone can delete orders" ON public.orders;

CREATE POLICY "Tenant isolation: orders SELECT" ON public.orders
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Tenant isolation: orders INSERT" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Tenant isolation: orders UPDATE" ON public.orders
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Tenant isolation: orders DELETE" ON public.orders
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

-- Service role bypass (for Edge Functions)
CREATE POLICY "Service role: orders" ON public.orders
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ─── VEHICLES ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Vehicles are publicly readable" ON public.vehicles;
DROP POLICY IF EXISTS "Authenticated users can insert vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Authenticated users can update vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Authenticated users can delete vehicles" ON public.vehicles;

CREATE POLICY "Tenant isolation: vehicles SELECT" ON public.vehicles
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Tenant isolation: vehicles INSERT" ON public.vehicles
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Tenant isolation: vehicles UPDATE" ON public.vehicles
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Tenant isolation: vehicles DELETE" ON public.vehicles
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Service role: vehicles" ON public.vehicles
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ─── CLIENTS ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can insert clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can update clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can delete clients" ON public.clients;
DROP POLICY IF EXISTS "Clients are publicly readable" ON public.clients;

CREATE POLICY "Tenant isolation: clients SELECT" ON public.clients
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Tenant isolation: clients INSERT" ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Tenant isolation: clients UPDATE" ON public.clients
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Tenant isolation: clients DELETE" ON public.clients
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Service role: clients" ON public.clients
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ─── NOTIFICATIONS ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read notifications" ON public.notifications;
DROP POLICY IF EXISTS "Authenticated users can update notifications" ON public.notifications;
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Authenticated users can delete notifications" ON public.notifications;

CREATE POLICY "Tenant isolation: notifications SELECT" ON public.notifications
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Tenant isolation: notifications INSERT" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Tenant isolation: notifications UPDATE" ON public.notifications
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Tenant isolation: notifications DELETE" ON public.notifications
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Service role: notifications" ON public.notifications
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ─── DRIVERS ─────────────────────────────────────────────────────────
CREATE POLICY "Tenant isolation: drivers SELECT" ON public.drivers
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Tenant isolation: drivers INSERT" ON public.drivers
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Tenant isolation: drivers UPDATE" ON public.drivers
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Tenant isolation: drivers DELETE" ON public.drivers
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Service role: drivers" ON public.drivers
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ─── CLIENT_LOCATIONS ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read client_locations" ON public.client_locations;
DROP POLICY IF EXISTS "Authenticated users can insert client_locations" ON public.client_locations;
DROP POLICY IF EXISTS "Authenticated users can update client_locations" ON public.client_locations;
DROP POLICY IF EXISTS "Authenticated users can delete client_locations" ON public.client_locations;

CREATE POLICY "Tenant isolation: client_locations SELECT" ON public.client_locations
  FOR SELECT TO authenticated USING (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY "Tenant isolation: client_locations INSERT" ON public.client_locations
  FOR INSERT TO authenticated WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY "Tenant isolation: client_locations UPDATE" ON public.client_locations
  FOR UPDATE TO authenticated USING (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY "Tenant isolation: client_locations DELETE" ON public.client_locations
  FOR DELETE TO authenticated USING (tenant_id = (SELECT public.current_tenant_id()));


-- ─── CLIENT_RATES ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read client_rates" ON public.client_rates;
DROP POLICY IF EXISTS "Authenticated users can insert client_rates" ON public.client_rates;
DROP POLICY IF EXISTS "Authenticated users can update client_rates" ON public.client_rates;
DROP POLICY IF EXISTS "Authenticated users can delete client_rates" ON public.client_rates;

CREATE POLICY "Tenant isolation: client_rates SELECT" ON public.client_rates
  FOR SELECT TO authenticated USING (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY "Tenant isolation: client_rates INSERT" ON public.client_rates
  FOR INSERT TO authenticated WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY "Tenant isolation: client_rates UPDATE" ON public.client_rates
  FOR UPDATE TO authenticated USING (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY "Tenant isolation: client_rates DELETE" ON public.client_rates
  FOR DELETE TO authenticated USING (tenant_id = (SELECT public.current_tenant_id()));


-- ─── VEHICLE_DOCUMENTS ──────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read vehicle_documents" ON public.vehicle_documents;
DROP POLICY IF EXISTS "Authenticated users can insert vehicle_documents" ON public.vehicle_documents;
DROP POLICY IF EXISTS "Authenticated users can update vehicle_documents" ON public.vehicle_documents;
DROP POLICY IF EXISTS "Authenticated users can delete vehicle_documents" ON public.vehicle_documents;

CREATE POLICY "Tenant isolation: vehicle_documents SELECT" ON public.vehicle_documents
  FOR SELECT TO authenticated USING (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY "Tenant isolation: vehicle_documents INSERT" ON public.vehicle_documents
  FOR INSERT TO authenticated WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY "Tenant isolation: vehicle_documents UPDATE" ON public.vehicle_documents
  FOR UPDATE TO authenticated USING (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY "Tenant isolation: vehicle_documents DELETE" ON public.vehicle_documents
  FOR DELETE TO authenticated USING (tenant_id = (SELECT public.current_tenant_id()));


-- ─── VEHICLE_MAINTENANCE ────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read vehicle_maintenance" ON public.vehicle_maintenance;
DROP POLICY IF EXISTS "Authenticated users can insert vehicle_maintenance" ON public.vehicle_maintenance;
DROP POLICY IF EXISTS "Authenticated users can update vehicle_maintenance" ON public.vehicle_maintenance;
DROP POLICY IF EXISTS "Authenticated users can delete vehicle_maintenance" ON public.vehicle_maintenance;

CREATE POLICY "Tenant isolation: vehicle_maintenance SELECT" ON public.vehicle_maintenance
  FOR SELECT TO authenticated USING (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY "Tenant isolation: vehicle_maintenance INSERT" ON public.vehicle_maintenance
  FOR INSERT TO authenticated WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY "Tenant isolation: vehicle_maintenance UPDATE" ON public.vehicle_maintenance
  FOR UPDATE TO authenticated USING (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY "Tenant isolation: vehicle_maintenance DELETE" ON public.vehicle_maintenance
  FOR DELETE TO authenticated USING (tenant_id = (SELECT public.current_tenant_id()));


-- ─── VEHICLE_AVAILABILITY ───────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read vehicle_availability" ON public.vehicle_availability;
DROP POLICY IF EXISTS "Authenticated users can insert vehicle_availability" ON public.vehicle_availability;
DROP POLICY IF EXISTS "Authenticated users can update vehicle_availability" ON public.vehicle_availability;
DROP POLICY IF EXISTS "Authenticated users can delete vehicle_availability" ON public.vehicle_availability;

CREATE POLICY "Tenant isolation: vehicle_availability SELECT" ON public.vehicle_availability
  FOR SELECT TO authenticated USING (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY "Tenant isolation: vehicle_availability INSERT" ON public.vehicle_availability
  FOR INSERT TO authenticated WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY "Tenant isolation: vehicle_availability UPDATE" ON public.vehicle_availability
  FOR UPDATE TO authenticated USING (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY "Tenant isolation: vehicle_availability DELETE" ON public.vehicle_availability
  FOR DELETE TO authenticated USING (tenant_id = (SELECT public.current_tenant_id()));


-- ═══════════════════════════════════════════════════════════════════════
-- 1.7  ORDERS TABLE EXTENSIONS
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS time_window_start text,
  ADD COLUMN IF NOT EXISTS time_window_end text,
  ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS geocoded_pickup_lat numeric,
  ADD COLUMN IF NOT EXISTS geocoded_pickup_lng numeric,
  ADD COLUMN IF NOT EXISTS geocoded_delivery_lat numeric,
  ADD COLUMN IF NOT EXISTS geocoded_delivery_lng numeric,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normaal';

COMMENT ON COLUMN public.orders.time_window_start IS 'Delivery time window start (HH:MM)';
COMMENT ON COLUMN public.orders.time_window_end IS 'Delivery time window end (HH:MM)';
COMMENT ON COLUMN public.orders.priority IS 'Order priority: laag, normaal, hoog, spoed';


-- ═══════════════════════════════════════════════════════════════════════
-- 1.8  VEHICLE_ID MIGRATION (text → uuid FK)
-- ═══════════════════════════════════════════════════════════════════════

-- Step 1: Add new uuid column
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS vehicle_uuid uuid REFERENCES public.vehicles(id) ON DELETE SET NULL;

-- Step 2: Migrate existing data — match vehicle codes to UUIDs
UPDATE public.orders o
SET vehicle_uuid = v.id
FROM public.vehicles v
WHERE o.vehicle_id IS NOT NULL
  AND (o.vehicle_id = v.code OR o.vehicle_id = v.id::text OR o.vehicle_id = v.name);

-- Step 3: Drop old text column and rename new one
ALTER TABLE public.orders DROP COLUMN IF EXISTS vehicle_id;
ALTER TABLE public.orders RENAME COLUMN vehicle_uuid TO vehicle_id;


-- ═══════════════════════════════════════════════════════════════════════
-- 1.9  NOTIFICATIONS USER_ID
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.notifications.user_id IS 'Target user for this notification (NULL = broadcast)';


-- ═══════════════════════════════════════════════════════════════════════
-- 1.10  AI USAGE LOG + CLIENT EXTRACTION TEMPLATES
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE public.ai_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  function_name text NOT NULL,
  model text NOT NULL DEFAULT 'gemini-2.5-flash',
  input_tokens integer,
  output_tokens integer,
  cost_estimate numeric(10,6),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation: ai_usage_log SELECT" ON public.ai_usage_log
  FOR SELECT TO authenticated USING (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY "Service role: ai_usage_log" ON public.ai_usage_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);


CREATE TABLE public.client_extraction_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_email text NOT NULL,
  field_mappings jsonb NOT NULL DEFAULT '{}'::jsonb,
  success_count integer DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_extraction_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation: extraction_templates SELECT" ON public.client_extraction_templates
  FOR SELECT TO authenticated USING (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY "Tenant isolation: extraction_templates ALL" ON public.client_extraction_templates
  FOR ALL TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY "Service role: extraction_templates" ON public.client_extraction_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER update_extraction_templates_updated_at
  BEFORE UPDATE ON public.client_extraction_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();


-- ═══════════════════════════════════════════════════════════════════════
-- 1.11  UPDATE handle_new_user() TRIGGER
-- ═══════════════════════════════════════════════════════════════════════

-- Drop old trigger first
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant_id uuid;
BEGIN
  -- Create profile
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'display_name', NEW.email));

  -- Assign default role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'medewerker');

  -- Check if tenant_id was passed in user metadata (e.g. invite flow)
  _tenant_id := (NEW.raw_user_meta_data ->> 'tenant_id')::uuid;

  IF _tenant_id IS NOT NULL THEN
    -- Add as member of specified tenant
    INSERT INTO public.tenant_members (tenant_id, user_id, role)
    VALUES (_tenant_id, NEW.id, 'planner')
    ON CONFLICT (tenant_id, user_id) DO NOTHING;

    -- Set tenant_id in app_metadata for JWT
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('tenant_id', _tenant_id)
    WHERE id = NEW.id;

    -- Update profile with tenant
    UPDATE public.profiles SET tenant_id = _tenant_id WHERE user_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- ═══════════════════════════════════════════════════════════════════════
-- 1.12  SEED DATA — Demo tenant drivers
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO public.drivers (tenant_id, name, email, phone, license_number, certifications, status) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Henk de Vries',    'henk@royaltycargo.nl',   '+31612345001', 'NL-RIJ-001', ARRAY['Laadklep'], 'beschikbaar'),
  ('00000000-0000-0000-0000-000000000001', 'Mo Ajam',          'mo@royaltycargo.nl',     '+31612345002', 'NL-RIJ-002', ARRAY['ADR', 'Koeling'], 'beschikbaar'),
  ('00000000-0000-0000-0000-000000000001', 'Sanne Jansen',     'sanne@royaltycargo.nl',  '+31612345003', 'NL-RIJ-003', ARRAY['Koeling', 'Laadklep'], 'beschikbaar'),
  ('00000000-0000-0000-0000-000000000001', 'Piet Pietersen',   'piet@royaltycargo.nl',   '+31612345004', 'NL-RIJ-004', ARRAY['ADR', 'Internationaal'], 'beschikbaar');


-- ═══════════════════════════════════════════════════════════════════════
-- 1.13  DATABASE INDEXES ON tenant_id (performance)
-- ═══════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_orders_tenant ON public.orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_status ON public.orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_created ON public.orders(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicles_tenant ON public.vehicles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clients_tenant ON public.clients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_drivers_tenant ON public.drivers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_drivers_tenant_active ON public.drivers(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON public.notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_user ON public.notifications(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_tenant ON public.profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_locations_tenant ON public.client_locations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_rates_tenant ON public.client_rates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_documents_tenant ON public.vehicle_documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_maintenance_tenant ON public.vehicle_maintenance(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_availability_tenant ON public.vehicle_availability(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_user ON public.tenant_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant ON public.tenant_members(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_tenant ON public.ai_usage_log(tenant_id, created_at DESC);


-- ═══════════════════════════════════════════════════════════════════════
-- 1.14  ACTIVITY LOG (audit trail)
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  changes jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_activity_tenant ON public.activity_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_entity ON public.activity_log(entity_type, entity_id);

CREATE POLICY "Tenant isolation: activity_log SELECT" ON public.activity_log
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Tenant isolation: activity_log INSERT" ON public.activity_log
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Service role: activity_log" ON public.activity_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ═══════════════════════════════════════════════════════════════════════
-- STAMGEGEVENS TABLES (vehicle_types, loading_units, requirement_types)
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE public.vehicle_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  default_capacity_kg integer,
  default_capacity_pallets integer,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, code)
);

ALTER TABLE public.vehicle_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation: vehicle_types SELECT" ON public.vehicle_types
  FOR SELECT TO authenticated USING (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY "Tenant isolation: vehicle_types ALL" ON public.vehicle_types
  FOR ALL TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY "Service role: vehicle_types" ON public.vehicle_types
  FOR ALL TO service_role USING (true) WITH CHECK (true);


CREATE TABLE public.loading_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  default_weight_kg numeric,
  default_dimensions text,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, code)
);

ALTER TABLE public.loading_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation: loading_units SELECT" ON public.loading_units
  FOR SELECT TO authenticated USING (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY "Tenant isolation: loading_units ALL" ON public.loading_units
  FOR ALL TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY "Service role: loading_units" ON public.loading_units
  FOR ALL TO service_role USING (true) WITH CHECK (true);


CREATE TABLE public.requirement_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  category text DEFAULT 'transport',
  icon text,
  color text,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, code)
);

ALTER TABLE public.requirement_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation: requirement_types SELECT" ON public.requirement_types
  FOR SELECT TO authenticated USING (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY "Tenant isolation: requirement_types ALL" ON public.requirement_types
  FOR ALL TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY "Service role: requirement_types" ON public.requirement_types
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- Seed default stamgegevens for demo tenant
INSERT INTO public.vehicle_types (tenant_id, name, code, default_capacity_kg, default_capacity_pallets, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Busje',              'busje',      800,   2,  1),
  ('00000000-0000-0000-0000-000000000001', 'Bakwagen',           'bakwagen',   5000,  12, 2),
  ('00000000-0000-0000-0000-000000000001', 'Koelwagen',          'koelwagen',  12000, 18, 3),
  ('00000000-0000-0000-0000-000000000001', 'Trekker + Oplegger', 'trekker',    24000, 33, 4);

INSERT INTO public.loading_units (tenant_id, name, code, default_weight_kg, default_dimensions, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Europallet',      'europallet',    750,  '120x80x144 cm', 1),
  ('00000000-0000-0000-0000-000000000001', 'Blokpallet',      'blokpallet',    1000, '120x100x144 cm', 2),
  ('00000000-0000-0000-0000-000000000001', 'Colli',           'colli',         NULL, NULL, 3),
  ('00000000-0000-0000-0000-000000000001', 'Container 20ft',  'container-20',  NULL, '6.06x2.44x2.59 m', 4),
  ('00000000-0000-0000-0000-000000000001', 'Container 40ft',  'container-40',  NULL, '12.19x2.44x2.59 m', 5);

INSERT INTO public.requirement_types (tenant_id, name, code, category, icon, color, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001', 'ADR (Gevaarlijke stoffen)', 'adr',            'transport', 'alert-triangle', '#f59e0b', 1),
  ('00000000-0000-0000-0000-000000000001', 'Koeling',                  'koeling',         'transport', 'snowflake',      '#3b82f6', 2),
  ('00000000-0000-0000-0000-000000000001', 'Laadklep',                 'laadklep',        'voertuig',  'arrow-down',     '#8b5cf6', 3),
  ('00000000-0000-0000-0000-000000000001', 'Douane',                   'douane',          'transport', 'shield',         '#ef4444', 4),
  ('00000000-0000-0000-0000-000000000001', 'Internationaal',           'internationaal',  'chauffeur', 'globe',          '#10b981', 5);


-- ═══════════════════════════════════════════════════════════════════════
--  STAMGEGEVENS INDEXES
-- ═══════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_vehicle_types_tenant ON public.vehicle_types(tenant_id);
CREATE INDEX IF NOT EXISTS idx_loading_units_tenant ON public.loading_units(tenant_id);
CREATE INDEX IF NOT EXISTS idx_requirement_types_tenant ON public.requirement_types(tenant_id);


-- ═══════════════════════════════════════════════════════════════════════
--  SET app_metadata FOR EXISTING USERS (one-time migration)
-- ═══════════════════════════════════════════════════════════════════════

-- Set tenant_id in app_metadata for all existing users who are tenant members
UPDATE auth.users u
SET raw_app_meta_data = COALESCE(u.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('tenant_id', tm.tenant_id)
FROM public.tenant_members tm
WHERE u.id = tm.user_id;
