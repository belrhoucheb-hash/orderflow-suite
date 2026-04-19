-- ──────────────────────────────────────────────────────────────────────────
-- Fix: RLS recursion op departments / shipments / traject_rules
--
-- De initiële migratie 20260414100000 gebruikte voor tenant-isolatie een
-- subquery op `tenant_members`. Dat veroorzaakt "infinite recursion detected
-- in policy for relation tenant_members" omdat tenant_members zelf ook een
-- policy heeft (zie 20260327152900_multi_tenant_foundation.sql) die
-- richting die tabel evalueert.
--
-- Projectconventie voor tenant-isolatie: JWT-claim via
--   auth.jwt()->'app_metadata'->>'tenant_id'
-- Dit is de lookup-vrije vorm en wordt overal elders in de codebase gebruikt.
-- ──────────────────────────────────────────────────────────────────────────

-- ─── Drop de oude recursieve policies ────────────────────────────────────
DROP POLICY IF EXISTS "Tenant isolation for departments"  ON public.departments;
DROP POLICY IF EXISTS "Tenant isolation for shipments"    ON public.shipments;
DROP POLICY IF EXISTS "Tenant isolation for traject_rules" ON public.traject_rules;

-- ─── Vervang door JWT-claim gebaseerde policies ──────────────────────────
CREATE POLICY "Tenant isolation for departments"
  ON public.departments FOR ALL TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()->'app_metadata'->>'tenant_id'))::uuid)
  WITH CHECK (tenant_id = ((SELECT auth.jwt()->'app_metadata'->>'tenant_id'))::uuid);

CREATE POLICY "Tenant isolation for shipments"
  ON public.shipments FOR ALL TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()->'app_metadata'->>'tenant_id'))::uuid)
  WITH CHECK (tenant_id = ((SELECT auth.jwt()->'app_metadata'->>'tenant_id'))::uuid);

CREATE POLICY "Tenant isolation for traject_rules"
  ON public.traject_rules FOR ALL TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()->'app_metadata'->>'tenant_id'))::uuid)
  WITH CHECK (tenant_id = ((SELECT auth.jwt()->'app_metadata'->>'tenant_id'))::uuid);

-- Service-role policies blijven zoals ze waren (geen recursie).
