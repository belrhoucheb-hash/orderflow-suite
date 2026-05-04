-- Chauffeursportaal vervolg: opslag voor tachograaf-imports.
--
-- Chauffeurs kunnen vanuit het portaal een .DDD bestand uploaden. De
-- Edge Function `tachograph-import` zet het bestand in de private bucket
-- `tachograph-files` onder {tenant_id}/{driver_id}/{timestamp}.ddd en
-- maakt een rij aan in deze tabel met status RECEIVED.
--
-- Echte parsing van .DDD volgt in v2 (planner-side), zie commentaar in
-- `supabase/functions/tachograph-import/index.ts`. Tot die tijd blijft
-- parsed_records NULL en kan de planner de file zelf binnenhalen via
-- signed URL.

CREATE TABLE IF NOT EXISTS public.tachograph_imports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  driver_id       UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  file_path       TEXT NOT NULL,
  file_name       TEXT,
  file_size       INTEGER,
  status          TEXT NOT NULL DEFAULT 'RECEIVED'
                    CHECK (status IN ('RECEIVED','PARSING','PARSED','FAILED')),
  parsed_records  JSONB,
  parse_error     TEXT,
  imported_by     UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tachograph_imports IS
  'Door chauffeur of planner geüploade tachograaf-bestanden (.DDD). Parsing volgt asynchroon planner-side.';
COMMENT ON COLUMN public.tachograph_imports.file_path IS
  'Storage-path in de tachograph-files bucket: {tenant_id}/{driver_id}/{timestamp}.ddd';
COMMENT ON COLUMN public.tachograph_imports.parsed_records IS
  'NULL totdat de planner-side parser is gedraaid. Bevat dan een array met activiteit-events.';
COMMENT ON COLUMN public.tachograph_imports.imported_by IS
  'auth.users.id van de gebruiker die het bestand uploadde. Bij chauffeur = drivers.user_id.';

CREATE INDEX IF NOT EXISTS idx_tachograph_imports_tenant_created
  ON public.tachograph_imports (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tachograph_imports_driver_created
  ON public.tachograph_imports (driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tachograph_imports_status
  ON public.tachograph_imports (status)
  WHERE status IN ('RECEIVED','PARSING');

ALTER TABLE public.tachograph_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tachograph_imports_tenant_select" ON public.tachograph_imports;
CREATE POLICY "tachograph_imports_tenant_select" ON public.tachograph_imports
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS "tachograph_imports_tenant_insert" ON public.tachograph_imports;
CREATE POLICY "tachograph_imports_tenant_insert" ON public.tachograph_imports
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS "tachograph_imports_tenant_update" ON public.tachograph_imports;
CREATE POLICY "tachograph_imports_tenant_update" ON public.tachograph_imports
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS "tachograph_imports_service_role" ON public.tachograph_imports;
CREATE POLICY "tachograph_imports_service_role" ON public.tachograph_imports
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON TABLE public.tachograph_imports TO authenticated;
GRANT ALL ON TABLE public.tachograph_imports TO service_role;

DROP TRIGGER IF EXISTS update_tachograph_imports_updated_at ON public.tachograph_imports;
CREATE TRIGGER update_tachograph_imports_updated_at
  BEFORE UPDATE ON public.tachograph_imports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ─── Storage bucket ───────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('tachograph-files', 'tachograph-files', false)
ON CONFLICT (id) DO UPDATE
SET public = false;

DROP POLICY IF EXISTS "tachograph-files tenant select" ON storage.objects;
CREATE POLICY "tachograph-files tenant select"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'tachograph-files'
    AND (storage.foldername(name))[1] = (SELECT public.get_user_tenant_id())::text
  );

DROP POLICY IF EXISTS "tachograph-files tenant insert" ON storage.objects;
CREATE POLICY "tachograph-files tenant insert"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'tachograph-files'
    AND (storage.foldername(name))[1] = (SELECT public.get_user_tenant_id())::text
  );

DROP POLICY IF EXISTS "tachograph-files tenant delete" ON storage.objects;
CREATE POLICY "tachograph-files tenant delete"
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'tachograph-files'
    AND (storage.foldername(name))[1] = (SELECT public.get_user_tenant_id())::text
  );

-- ─── ROLLBACK ─────────────────────────────────────────────────
-- DROP TABLE IF EXISTS public.tachograph_imports CASCADE;
-- DELETE FROM storage.buckets WHERE id = 'tachograph-files';
