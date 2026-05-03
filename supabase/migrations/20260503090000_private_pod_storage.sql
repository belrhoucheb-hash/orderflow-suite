-- Compliance Sprint: private Proof of Delivery storage.
--
-- New POD evidence must be stored as private storage objects under:
--   {tenant_id}/signatures/{order_id}-{uuid}.png
--   {tenant_id}/photos/{order_id}-{uuid}.jpg
--
-- Access is granted through the get-pod-file-url edge function, which creates
-- short-lived signed URLs and records every access in pod_access_log.

INSERT INTO storage.buckets (id, name, public)
VALUES ('pod-files', 'pod-files', false)
ON CONFLICT (id) DO UPDATE
SET public = false;

CREATE TABLE IF NOT EXISTS public.pod_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'signed_url',
  purpose TEXT NOT NULL DEFAULT 'view',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pod_access_log_action_chk CHECK (action IN ('signed_url', 'download', 'view'))
);

CREATE INDEX IF NOT EXISTS idx_pod_access_log_tenant_created
  ON public.pod_access_log (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pod_access_log_order_created
  ON public.pod_access_log (order_id, created_at DESC)
  WHERE order_id IS NOT NULL;

ALTER TABLE public.pod_access_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pod_access_log tenant read" ON public.pod_access_log;
CREATE POLICY "pod_access_log tenant read"
  ON public.pod_access_log
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS "pod_access_log service role" ON public.pod_access_log;
CREATE POLICY "pod_access_log service role"
  ON public.pod_access_log
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT ALL ON TABLE public.pod_access_log TO authenticated;
GRANT ALL ON TABLE public.pod_access_log TO service_role;

COMMENT ON TABLE public.pod_access_log IS
  'Audit trail for private POD evidence access via signed URLs.';

COMMENT ON COLUMN public.orders.pod_signature_url IS
  'Private storage path for POD signature in pod-files bucket. Legacy rows may contain public URLs.';

COMMENT ON COLUMN public.orders.pod_photos IS
  'JSON array of private storage paths for POD photos in pod-files bucket. Legacy rows may contain public URLs.';

DROP POLICY IF EXISTS "pod-files public read" ON storage.objects;
DROP POLICY IF EXISTS "pod-files authenticated upload" ON storage.objects;
DROP POLICY IF EXISTS "pod-files authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "pod-files authenticated delete" ON storage.objects;
DROP POLICY IF EXISTS "pod-files tenant select" ON storage.objects;
CREATE POLICY "pod-files tenant select"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'pod-files'
    AND (storage.foldername(name))[1] = (SELECT public.current_tenant_id())::text
  );

DROP POLICY IF EXISTS "pod-files tenant insert" ON storage.objects;
CREATE POLICY "pod-files tenant insert"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pod-files'
    AND (storage.foldername(name))[1] = (SELECT public.current_tenant_id())::text
  );

DROP POLICY IF EXISTS "pod-files tenant update" ON storage.objects;
CREATE POLICY "pod-files tenant update"
  ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'pod-files'
    AND (storage.foldername(name))[1] = (SELECT public.current_tenant_id())::text
  )
  WITH CHECK (
    bucket_id = 'pod-files'
    AND (storage.foldername(name))[1] = (SELECT public.current_tenant_id())::text
  );

DROP POLICY IF EXISTS "pod-files tenant delete" ON storage.objects;
CREATE POLICY "pod-files tenant delete"
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'pod-files'
    AND (storage.foldername(name))[1] = (SELECT public.current_tenant_id())::text
  );
