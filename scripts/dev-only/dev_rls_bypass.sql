-- ⚠️ DEV ONLY — NEVER run this on production! Bypasses all RLS policies.
-- ============================================================
-- DEV ONLY: RLS bypass for anon key on dev tenant
-- Allows the anon/publishable key to read/write all data
-- for tenant '00000000-0000-0000-0000-000000000001'
-- ============================================================

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

    -- Drop if exists (idempotent)
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, tbl);

    -- For most tables: allow full access where tenant_id matches dev tenant
    IF tbl IN ('tenants') THEN
      -- tenants table: allow reading all tenants (no tenant_id column on tenants itself)
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
        pol, tbl
      );
    ELSIF tbl IN ('invoice_lines') THEN
      -- invoice_lines has no tenant_id, access via invoice
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
        pol, tbl
      );
    ELSIF tbl IN ('profiles', 'user_roles') THEN
      -- profiles/user_roles have no tenant_id
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
        pol, tbl
      );
    ELSIF tbl IN ('tenant_members') THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (tenant_id = ''00000000-0000-0000-0000-000000000001''::uuid) WITH CHECK (tenant_id = ''00000000-0000-0000-0000-000000000001''::uuid)',
        pol, tbl
      );
    ELSE
      -- All other tables: scope to dev tenant
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (tenant_id = ''00000000-0000-0000-0000-000000000001''::uuid) WITH CHECK (tenant_id = ''00000000-0000-0000-0000-000000000001''::uuid)',
        pol, tbl
      );
    END IF;

    RAISE NOTICE 'Created policy % on %', pol, tbl;
  END LOOP;
END;
$$;
