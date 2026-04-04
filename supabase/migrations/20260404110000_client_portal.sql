-- ============================================================
-- Feature 7: Uitgebreid Klantportaal — Schema
-- Tables: client_portal_users
-- Alters: orders (source, portal_submitted_by, portal_submitted_at)
-- ============================================================

-- ─── 1. client_portal_users ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_portal_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portal_role TEXT NOT NULL DEFAULT 'viewer' CHECK (portal_role IN ('viewer', 'editor', 'admin')),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, client_id, user_id)
);

ALTER TABLE public.client_portal_users ENABLE ROW LEVEL SECURITY;

-- Portal users can see their own record
CREATE POLICY "client_portal_users_own_select" ON public.client_portal_users
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Tenant admins/planners can manage portal users
CREATE POLICY "client_portal_users_tenant_select" ON public.client_portal_users
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "client_portal_users_tenant_insert" ON public.client_portal_users
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "client_portal_users_tenant_update" ON public.client_portal_users
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "client_portal_users_tenant_delete" ON public.client_portal_users
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "client_portal_users_service_role" ON public.client_portal_users
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_client_portal_users_tenant ON public.client_portal_users(tenant_id);
CREATE INDEX idx_client_portal_users_client ON public.client_portal_users(client_id);
CREATE INDEX idx_client_portal_users_user ON public.client_portal_users(user_id);

-- ─── 2. ALTER orders — source + portal fields ────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'INTERN' CHECK (source IN ('INTERN', 'EMAIL', 'PORTAL', 'EDI')),
  ADD COLUMN IF NOT EXISTS portal_submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS portal_submitted_at TIMESTAMPTZ;

CREATE INDEX idx_orders_source ON public.orders(source);

-- ─── 3. RLS for portal users to see their client's orders ────
-- Portal users can read orders belonging to their client_id
CREATE POLICY "orders_portal_user_select" ON public.orders
  FOR SELECT TO authenticated
  USING (
    client_id IN (
      SELECT cpu.client_id FROM public.client_portal_users cpu
      WHERE cpu.user_id = auth.uid() AND cpu.is_active = true
    )
  );

-- Portal users with 'editor' or 'admin' role can insert orders (as DRAFT)
CREATE POLICY "orders_portal_user_insert" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (
    source = 'PORTAL'
    AND status = 'DRAFT'
    AND client_id IN (
      SELECT cpu.client_id FROM public.client_portal_users cpu
      WHERE cpu.user_id = auth.uid()
        AND cpu.is_active = true
        AND cpu.portal_role IN ('editor', 'admin')
    )
  );

-- ─── 4. Portal users can read their client's invoices ────────
-- (Only if invoices table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices' AND table_schema = 'public') THEN
    EXECUTE 'CREATE POLICY "invoices_portal_user_select" ON public.invoices
      FOR SELECT TO authenticated
      USING (
        client_id IN (
          SELECT cpu.client_id FROM public.client_portal_users cpu
          WHERE cpu.user_id = auth.uid() AND cpu.is_active = true
        )
      )';
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- Policy already exists
END;
$$;

-- ─── 5. Portal users can read trips related to their orders ──
DO $$
BEGIN
  EXECUTE 'CREATE POLICY "trips_portal_user_select" ON public.trips
    FOR SELECT TO authenticated
    USING (
      id IN (
        SELECT ts.trip_id FROM public.trip_stops ts
        JOIN public.orders o ON o.id = ts.order_id
        WHERE o.client_id IN (
          SELECT cpu.client_id FROM public.client_portal_users cpu
          WHERE cpu.user_id = auth.uid() AND cpu.is_active = true
        )
      )
    )';
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;

-- ─── 6. Portal users can read notification_log for their orders
CREATE POLICY "notification_log_portal_select" ON public.notification_log
  FOR SELECT TO authenticated
  USING (
    order_id IN (
      SELECT o.id FROM public.orders o
      WHERE o.client_id IN (
        SELECT cpu.client_id FROM public.client_portal_users cpu
        WHERE cpu.user_id = auth.uid() AND cpu.is_active = true
      )
    )
  );
