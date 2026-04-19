-- ============================================================
-- Standardize tenant helper function (2026-04-03)
--
-- Problem: Two competing functions exist:
--   current_tenant_id()    — uses auth.jwt()->'app_metadata'->>'tenant_id'
--   get_user_tenant_id()   — uses current_setting('request.jwt.claims') with COALESCE
--
-- Solution: Keep get_user_tenant_id() as the canonical version (more robust),
-- redefine current_tenant_id() as an alias to avoid breaking existing policies.
-- ============================================================

-- ─── 1. Ensure get_user_tenant_id() is the canonical version ─
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS UUID AS $$
  SELECT COALESCE(
    -- Try direct JWT claim first (Supabase standard)
    (current_setting('request.jwt.claims', true)::json->'app_metadata'->>'tenant_id')::uuid,
    -- Fallback: top-level claim
    (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.get_user_tenant_id()
  IS 'Canonical tenant resolver. Returns tenant_id from JWT. Used by all RLS policies.';

-- ─── 2. Redefine current_tenant_id() as alias ───────────────
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT public.get_user_tenant_id();
$$;

COMMENT ON FUNCTION public.current_tenant_id()
  IS 'Alias for get_user_tenant_id(). Kept for backwards compatibility with older RLS policies.';

-- ─── 3. Storage bucket policies: restrict to authenticated ──
-- Currently email-attachments allows anon SELECT and any authenticated
-- user can access all files regardless of tenant.
--
-- We add tenant-prefix based policies: files must be stored under
-- {tenant_id}/... path, and users can only access their tenant's files.

-- Drop old overly-permissive policies
DROP POLICY IF EXISTS "allow-public-read" ON storage.objects;
DROP POLICY IF EXISTS "allow-authenticated-insert" ON storage.objects;
DROP POLICY IF EXISTS "allow-authenticated-update" ON storage.objects;
DROP POLICY IF EXISTS "allow-authenticated-delete" ON storage.objects;
DROP POLICY IF EXISTS "allow-pod-read" ON storage.objects;
DROP POLICY IF EXISTS "allow-pod-insert" ON storage.objects;
DROP POLICY IF EXISTS "allow-pod-update" ON storage.objects;
DROP POLICY IF EXISTS "allow-pod-delete" ON storage.objects;

-- email-attachments: tenant-scoped access
CREATE POLICY "email_attachments_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'email-attachments'
    AND (
      -- Files under tenant prefix
      (storage.foldername(name))[1] = public.get_user_tenant_id()::text
      -- Or legacy files without prefix (backwards compat)
      OR NOT (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-'
    )
  );

CREATE POLICY "email_attachments_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'email-attachments'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
  );

CREATE POLICY "email_attachments_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'email-attachments'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
  );

CREATE POLICY "email_attachments_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'email-attachments'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
  );

-- pod-files: authenticated access (tenant-prefix not enforced yet
-- because ChauffeurApp uploads via PIN auth without tenant context)
CREATE POLICY "pod_files_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'pod-files');

CREATE POLICY "pod_files_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pod-files');

CREATE POLICY "pod_files_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'pod-files');

CREATE POLICY "pod_files_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'pod-files');

-- Service role bypass for storage
CREATE POLICY "storage_service_role" ON storage.objects
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
