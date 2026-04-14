-- ──────────────────────────────────────────────────────────────────────────
-- Fix: RLS voor departments / shipments / traject_rules onafhankelijk maken
-- van `app_metadata.tenant_id` in de JWT.
--
-- Probleem: niet alle gebruikers hebben die claim gezet; gevolg is dat
-- RLS 0 rijen teruggeeft terwijl de gebruiker wél tenant-toegang heeft via
-- `tenant_members`.
--
-- Oplossing: een SECURITY DEFINER functie die in `tenant_members` kijkt.
-- SECURITY DEFINER = draait met de rechten van de functie-eigenaar, dus
-- bypasst RLS op `tenant_members` → geen recursie.
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.user_has_tenant_access(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
-- Expliciete search_path om search-path-injection te voorkomen.
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_members tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id = auth.uid()
  );
$$;

-- Alleen authenticated users mogen deze aanroepen vanuit policies.
REVOKE ALL ON FUNCTION public.user_has_tenant_access(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_tenant_access(UUID) TO authenticated, service_role;

-- ─── Swap policies op departments ─────────────────────────────────────────
DROP POLICY IF EXISTS "Tenant isolation for departments" ON public.departments;

CREATE POLICY "Tenant isolation for departments"
  ON public.departments FOR ALL TO authenticated
  USING (public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.user_has_tenant_access(tenant_id));

-- ─── Swap policies op shipments ───────────────────────────────────────────
DROP POLICY IF EXISTS "Tenant isolation for shipments" ON public.shipments;

CREATE POLICY "Tenant isolation for shipments"
  ON public.shipments FOR ALL TO authenticated
  USING (public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.user_has_tenant_access(tenant_id));

-- ─── Swap policies op traject_rules ───────────────────────────────────────
DROP POLICY IF EXISTS "Tenant isolation for traject_rules" ON public.traject_rules;

CREATE POLICY "Tenant isolation for traject_rules"
  ON public.traject_rules FOR ALL TO authenticated
  USING (public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.user_has_tenant_access(tenant_id));

-- Service-role policies blijven ongemoeid.
