-- Fix multi-tenant isolation: ensure tenant_id exists on all critical tables
-- and RLS policies enforce tenant-scoped access

-- Add tenant_id to vehicles if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vehicles' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.vehicles ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);
    UPDATE public.vehicles SET tenant_id = (SELECT id FROM public.tenants LIMIT 1) WHERE tenant_id IS NULL;
  END IF;
END $$;

-- Add tenant_id to drivers table (may be stored in profiles or separate)
-- Check if drivers table exists first
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'drivers') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'tenant_id') THEN
      ALTER TABLE public.drivers ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);
      UPDATE public.drivers SET tenant_id = (SELECT id FROM public.tenants LIMIT 1) WHERE tenant_id IS NULL;
    END IF;
  END IF;
END $$;

-- Add tenant_id to invoices if missing
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'tenant_id') THEN
      ALTER TABLE public.invoices ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);
      UPDATE public.invoices SET tenant_id = (SELECT id FROM public.tenants LIMIT 1) WHERE tenant_id IS NULL;
    END IF;
  END IF;
END $$;

-- Add tenant_id to notifications if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.notifications ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);
  END IF;
END $$;

-- Helper function to get current user's tenant_id from JWT
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;
$$;

-- RLS policies for vehicles
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vehicles_tenant_select" ON public.vehicles;
CREATE POLICY "vehicles_tenant_select" ON public.vehicles
  FOR SELECT USING (tenant_id = public.get_user_tenant_id() OR tenant_id IS NULL);

DROP POLICY IF EXISTS "vehicles_tenant_insert" ON public.vehicles;
CREATE POLICY "vehicles_tenant_insert" ON public.vehicles
  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS "vehicles_tenant_update" ON public.vehicles;
CREATE POLICY "vehicles_tenant_update" ON public.vehicles
  FOR UPDATE USING (tenant_id = public.get_user_tenant_id() OR tenant_id IS NULL);

-- RLS policies for notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_tenant_select" ON public.notifications;
CREATE POLICY "notifications_tenant_select" ON public.notifications
  FOR SELECT USING (tenant_id = public.get_user_tenant_id() OR tenant_id IS NULL OR user_id = auth.uid());

-- RLS for audit_log (admins only)
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_admin_select" ON public.audit_log;
CREATE POLICY "audit_log_admin_select" ON public.audit_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- RLS for webhook_subscriptions
ALTER TABLE public.webhook_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "webhook_tenant_all" ON public.webhook_subscriptions;
CREATE POLICY "webhook_tenant_all" ON public.webhook_subscriptions
  FOR ALL USING (tenant_id = public.get_user_tenant_id());

-- RLS for driver_positions
ALTER TABLE public.driver_positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "driver_positions_select" ON public.driver_positions;
CREATE POLICY "driver_positions_select" ON public.driver_positions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "driver_positions_insert" ON public.driver_positions;
CREATE POLICY "driver_positions_insert" ON public.driver_positions
  FOR INSERT WITH CHECK (driver_id::text = auth.uid()::text);

-- RLS for driver_time_entries
ALTER TABLE public.driver_time_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "driver_time_select" ON public.driver_time_entries;
CREATE POLICY "driver_time_select" ON public.driver_time_entries
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "driver_time_insert" ON public.driver_time_entries;
CREATE POLICY "driver_time_insert" ON public.driver_time_entries
  FOR INSERT WITH CHECK (driver_id::text = auth.uid()::text);
