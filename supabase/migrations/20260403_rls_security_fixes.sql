-- ============================================================
-- Security Fix: RLS gaps identified by audit (2026-04-03)
-- Fixes: audit_log tenant isolation, NULL loopholes,
--        missing policies, dev bypass completeness
-- ============================================================

-- ─── 1. CRITICAL: Add tenant_id to audit_log ───────────────
-- Currently any admin can read all audit logs across tenants

ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- Backfill tenant_id from related entities where possible
UPDATE public.audit_log al
SET tenant_id = o.tenant_id
FROM public.orders o
WHERE al.table_name = 'orders'
  AND al.record_id = o.id::text
  AND al.tenant_id IS NULL;

UPDATE public.audit_log al
SET tenant_id = i.tenant_id
FROM public.invoices i
WHERE al.table_name = 'invoices'
  AND al.record_id = i.id::text
  AND al.tenant_id IS NULL;

UPDATE public.audit_log al
SET tenant_id = t.tenant_id
FROM public.trips t
WHERE al.table_name = 'trips'
  AND al.record_id = t.id::text
  AND al.tenant_id IS NULL;

UPDATE public.audit_log al
SET tenant_id = c.tenant_id
FROM public.clients c
WHERE al.table_name = 'clients'
  AND al.record_id = c.id::text
  AND al.tenant_id IS NULL;

UPDATE public.audit_log al
SET tenant_id = v.tenant_id
FROM public.vehicles v
WHERE al.table_name = 'vehicles'
  AND al.record_id = v.id::text
  AND al.tenant_id IS NULL;

-- Remaining NULLs get the default dev tenant
UPDATE public.audit_log
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

-- Drop old admin-only policy
DROP POLICY IF EXISTS "Admin read access" ON public.audit_log;
DROP POLICY IF EXISTS "admin_read_audit_log" ON public.audit_log;

-- Create tenant-isolated policies
CREATE POLICY "audit_log_tenant_select" ON public.audit_log
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "audit_log_tenant_insert" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id() OR tenant_id IS NULL);

CREATE POLICY "audit_log_service_role" ON public.audit_log
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant ON public.audit_log(tenant_id);

-- ─── 2. CRITICAL: Remove NULL loophole from driver_positions ─
DROP POLICY IF EXISTS "driver_positions_select" ON public.driver_positions;
DROP POLICY IF EXISTS "driver_positions_insert" ON public.driver_positions;

-- Backfill NULL tenant_ids
UPDATE public.driver_positions
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

CREATE POLICY "driver_positions_tenant_select" ON public.driver_positions
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "driver_positions_tenant_insert" ON public.driver_positions
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "driver_positions_tenant_update" ON public.driver_positions
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "driver_positions_tenant_delete" ON public.driver_positions
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "driver_positions_service_role" ON public.driver_positions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─── 3. CRITICAL: Remove NULL loophole from driver_time_entries
DROP POLICY IF EXISTS "driver_time_entries_select" ON public.driver_time_entries;
DROP POLICY IF EXISTS "driver_time_entries_insert" ON public.driver_time_entries;

UPDATE public.driver_time_entries
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

CREATE POLICY "driver_time_entries_tenant_select" ON public.driver_time_entries
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "driver_time_entries_tenant_insert" ON public.driver_time_entries
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "driver_time_entries_tenant_update" ON public.driver_time_entries
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "driver_time_entries_tenant_delete" ON public.driver_time_entries
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "driver_time_entries_service_role" ON public.driver_time_entries
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─── 4. CRITICAL: Remove NULL loophole from ai_corrections ──
DROP POLICY IF EXISTS "ai_corrections_all" ON public.ai_corrections;
DROP POLICY IF EXISTS "Tenant isolation: ai_corrections" ON public.ai_corrections;

UPDATE public.ai_corrections
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

CREATE POLICY "ai_corrections_tenant_select" ON public.ai_corrections
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "ai_corrections_tenant_insert" ON public.ai_corrections
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "ai_corrections_tenant_update" ON public.ai_corrections
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "ai_corrections_tenant_delete" ON public.ai_corrections
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "ai_corrections_service_role" ON public.ai_corrections
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─── 5. HIGH: Scope profiles SELECT to tenant ───────────────
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

CREATE POLICY "profiles_tenant_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    OR tenant_id IS NULL  -- profiles without tenant (e.g. during onboarding)
    OR id = auth.uid()    -- users can always see their own profile
  );

-- ─── 6. HIGH: Scope user_roles to tenant via tenant_members ─
DROP POLICY IF EXISTS "Users can view roles" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_select" ON public.user_roles;

CREATE POLICY "user_roles_tenant_select" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    user_id IN (
      SELECT tm.user_id FROM public.tenant_members tm
      WHERE tm.tenant_id = public.get_user_tenant_id()
    )
    OR user_id = auth.uid()  -- users can always see their own roles
  );

-- ─── 7. MEDIUM: Service role bypass for newer tables ────────
-- (Supabase service_role bypasses RLS by default, but explicit
--  policies are best practice for when that config changes)

DO $$
DECLARE
  tbl text;
  pol text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'trips', 'trip_stops', 'proof_of_delivery', 'delivery_exceptions',
    'tenant_settings', 'planning_drafts'
  ]
  LOOP
    pol := tbl || '_service_role';
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      pol, tbl
    );
  END LOOP;
END;
$$;

-- ─── 8. LOW: FK constraint for planning_drafts.tenant_id ────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_type = 'FOREIGN KEY'
      AND table_name = 'planning_drafts'
      AND constraint_name LIKE '%tenant%'
  ) THEN
    ALTER TABLE public.planning_drafts
      ADD CONSTRAINT planning_drafts_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
  END IF;
END;
$$;
