-- Fix RLS recursion op vehicle_checks + vehicle_check_photos + damage_events.
-- Gebruik de bestaande public.user_has_tenant_access() SECURITY DEFINER
-- functie zodat de policy niet via tenant_members terugverwijst.

DROP POLICY IF EXISTS "Tenant isolation for vehicle_checks" ON public.vehicle_checks;
CREATE POLICY "Tenant isolation for vehicle_checks"
  ON public.vehicle_checks FOR ALL TO authenticated
  USING (public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.user_has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "Tenant isolation for vehicle_check_photos" ON public.vehicle_check_photos;
CREATE POLICY "Tenant isolation for vehicle_check_photos"
  ON public.vehicle_check_photos FOR ALL TO authenticated
  USING (check_id IN (
    SELECT vc.id FROM public.vehicle_checks vc
    WHERE public.user_has_tenant_access(vc.tenant_id)
  ))
  WITH CHECK (check_id IN (
    SELECT vc.id FROM public.vehicle_checks vc
    WHERE public.user_has_tenant_access(vc.tenant_id)
  ));

DROP POLICY IF EXISTS "Tenant isolation for damage_events" ON public.vehicle_damage_events;
CREATE POLICY "Tenant isolation for damage_events"
  ON public.vehicle_damage_events FOR ALL TO authenticated
  USING (public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.user_has_tenant_access(tenant_id));

-- Storage-bucket policies: zelfde recursie-risico als bucket-policy
-- via tenant_members joint. Vervang door helper-functie.
DROP POLICY IF EXISTS "Tenant read on vehicle-checks bucket" ON storage.objects;
CREATE POLICY "Tenant read on vehicle-checks bucket"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'vehicle-checks'
    AND public.user_has_tenant_access((storage.foldername(name))[1]::uuid)
  );

DROP POLICY IF EXISTS "Tenant insert on vehicle-checks bucket" ON storage.objects;
CREATE POLICY "Tenant insert on vehicle-checks bucket"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'vehicle-checks'
    AND public.user_has_tenant_access((storage.foldername(name))[1]::uuid)
  );
