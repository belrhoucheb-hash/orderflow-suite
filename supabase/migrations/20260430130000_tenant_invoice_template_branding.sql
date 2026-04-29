-- Tenant branding uitbreiden met een factuursjabloon per tenant.
-- Het sjabloon is een PDF die door de tenant-admin wordt beheerd via
-- Instellingen > Branding.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS invoice_template_url text,
  ADD COLUMN IF NOT EXISTS invoice_template_filename text,
  ADD COLUMN IF NOT EXISTS invoice_template_uploaded_at timestamptz;

COMMENT ON COLUMN public.tenants.invoice_template_url IS 'Public URL naar het actieve PDF-factuursjabloon van deze tenant.';
COMMENT ON COLUMN public.tenants.invoice_template_filename IS 'Originele bestandsnaam van het actieve factuursjabloon.';
COMMENT ON COLUMN public.tenants.invoice_template_uploaded_at IS 'Moment waarop het actieve factuursjabloon is opgeslagen.';

-- Publieke bucket: factuursjablonen zijn branding/document-output assets.
-- Padschema: {tenant_id}/invoice-template.pdf.
INSERT INTO storage.buckets (id, name, public)
VALUES ('tenant-branding', 'tenant-branding', TRUE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "tenant-branding public select" ON storage.objects;
CREATE POLICY "tenant-branding public select"
  ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'tenant-branding');

DROP POLICY IF EXISTS "tenant-branding admin insert" ON storage.objects;
CREATE POLICY "tenant-branding admin insert"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'tenant-branding'
    AND (storage.foldername(name))[1] = (SELECT public.current_tenant_id())::text
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "tenant-branding admin update" ON storage.objects;
CREATE POLICY "tenant-branding admin update"
  ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'tenant-branding'
    AND (storage.foldername(name))[1] = (SELECT public.current_tenant_id())::text
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  )
  WITH CHECK (
    bucket_id = 'tenant-branding'
    AND (storage.foldername(name))[1] = (SELECT public.current_tenant_id())::text
  );

DROP POLICY IF EXISTS "tenant-branding admin delete" ON storage.objects;
CREATE POLICY "tenant-branding admin delete"
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'tenant-branding'
    AND (storage.foldername(name))[1] = (SELECT public.current_tenant_id())::text
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- --- ROLLBACK -------------------------------------------------------
-- DROP POLICY IF EXISTS "tenant-branding admin delete" ON storage.objects;
-- DROP POLICY IF EXISTS "tenant-branding admin update" ON storage.objects;
-- DROP POLICY IF EXISTS "tenant-branding admin insert" ON storage.objects;
-- DROP POLICY IF EXISTS "tenant-branding public select" ON storage.objects;
-- DELETE FROM storage.buckets WHERE id = 'tenant-branding';
-- ALTER TABLE public.tenants
--   DROP COLUMN IF EXISTS invoice_template_uploaded_at,
--   DROP COLUMN IF EXISTS invoice_template_filename,
--   DROP COLUMN IF EXISTS invoice_template_url;
