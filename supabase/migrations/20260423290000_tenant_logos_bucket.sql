-- Publieke storage-bucket voor tenant-logo's zodat het logo direct via
-- de <img src=...> getoond kan worden zonder signed URL. Alleen admins
-- van de eigen tenant mogen uploaden/updaten/verwijderen; SELECT is
-- public omdat logo's publieke branding zijn en anders zouden signed URLs
-- expiren in tabs die lang openstaan.
--
-- Padschema: {tenant_id}/logo.{ext}. Een tenant heeft altijd maximaal
-- een actief logo; oudere bestanden worden bij re-upload overschreven.

INSERT INTO storage.buckets (id, name, public)
VALUES ('tenant-logos', 'tenant-logos', TRUE)
ON CONFLICT (id) DO NOTHING;

-- SELECT: iedereen mag logos lezen (vandaar public). Geen policy nodig
-- voor anon, wel expliciet voor consistente grants.
DROP POLICY IF EXISTS "tenant-logos public select" ON storage.objects;
CREATE POLICY "tenant-logos public select"
  ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'tenant-logos');

-- INSERT: alleen admin van de eigen tenant mag uploaden.
DROP POLICY IF EXISTS "tenant-logos admin insert" ON storage.objects;
CREATE POLICY "tenant-logos admin insert"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'tenant-logos'
    AND (storage.foldername(name))[1] = (SELECT public.current_tenant_id())::text
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- UPDATE: zelfde als insert, nodig voor upsert-style overschrijven.
DROP POLICY IF EXISTS "tenant-logos admin update" ON storage.objects;
CREATE POLICY "tenant-logos admin update"
  ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'tenant-logos'
    AND (storage.foldername(name))[1] = (SELECT public.current_tenant_id())::text
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  )
  WITH CHECK (
    bucket_id = 'tenant-logos'
    AND (storage.foldername(name))[1] = (SELECT public.current_tenant_id())::text
  );

-- DELETE: admin mag het eigen logo verwijderen.
DROP POLICY IF EXISTS "tenant-logos admin delete" ON storage.objects;
CREATE POLICY "tenant-logos admin delete"
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'tenant-logos'
    AND (storage.foldername(name))[1] = (SELECT public.current_tenant_id())::text
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- RLS op tenants-tabel voor UPDATE door admin, alleen eigen tenant.
-- We gaan ervan uit dat de baseline al SELECT toestaat voor de eigen tenant.
-- Hier expliciet een admin-UPDATE-policy zodat Branding-opslaan werkt.
DROP POLICY IF EXISTS "Tenants: admin update own" ON public.tenants;
CREATE POLICY "Tenants: admin update own"
  ON public.tenants
  FOR UPDATE TO authenticated
  USING (
    id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  )
  WITH CHECK (
    id = (SELECT public.current_tenant_id())
  );

-- --- ROLLBACK -------------------------------------------------------
-- DROP POLICY IF EXISTS "Tenants: admin update own" ON public.tenants;
-- DROP POLICY IF EXISTS "tenant-logos admin delete" ON storage.objects;
-- DROP POLICY IF EXISTS "tenant-logos admin update" ON storage.objects;
-- DROP POLICY IF EXISTS "tenant-logos admin insert" ON storage.objects;
-- DROP POLICY IF EXISTS "tenant-logos public select" ON storage.objects;
-- DELETE FROM storage.buckets WHERE id = 'tenant-logos';
