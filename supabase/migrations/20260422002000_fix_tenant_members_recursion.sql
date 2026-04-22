-- Fix infinite recursion op tenant_members.
--
-- Probleem: policy "Owners/admins can manage tenant members" bevatte een
-- EXISTS-subquery op tenant_members zelf. Zodra een andere policy (bijv.
-- client_contacts) tenant_members leest, evalueert Postgres de admin-policy,
-- die weer tenant_members leest, wat opnieuw de admin-policy evalueert, enz.
-- Symptoom: "infinite recursion detected in policy for relation tenant_members".
--
-- Fix: admin-check uitbesteden aan een SECURITY DEFINER functie die als
-- eigenaar (superuser) op tenant_members query en dus RLS overslaat.

CREATE OR REPLACE FUNCTION public.is_current_user_tenant_admin(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.tenant_members tm
     WHERE tm.user_id = auth.uid()
       AND tm.tenant_id = p_tenant_id
       AND tm.role = ANY (ARRAY['owner', 'admin'])
  );
$$;

ALTER FUNCTION public.is_current_user_tenant_admin(uuid) OWNER TO postgres;

DROP POLICY IF EXISTS "Owners/admins can manage tenant members" ON public.tenant_members;

CREATE POLICY "Owners/admins can manage tenant members"
  ON public.tenant_members
  TO authenticated
  USING (
    tenant_id = ((SELECT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')))::uuid
    AND public.is_current_user_tenant_admin(tenant_id)
  )
  WITH CHECK (
    tenant_id = ((SELECT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')))::uuid
    AND public.is_current_user_tenant_admin(tenant_id)
  );
