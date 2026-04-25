CREATE TABLE IF NOT EXISTS public.driver_documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  driver_id         UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  provider          TEXT NOT NULL DEFAULT 'nostradamus',
  category          TEXT NOT NULL DEFAULT 'algemeen',
  title             TEXT NOT NULL,
  document_url      TEXT,
  external_file_id  TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_documents_driver
  ON public.driver_documents (tenant_id, driver_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS driver_documents_external_file_uniq
  ON public.driver_documents (tenant_id, driver_id, provider, external_file_id)
  WHERE external_file_id IS NOT NULL;

ALTER TABLE public.driver_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "driver_documents_tenant_select" ON public.driver_documents;
CREATE POLICY "driver_documents_tenant_select"
  ON public.driver_documents
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS "driver_documents_tenant_insert" ON public.driver_documents;
CREATE POLICY "driver_documents_tenant_insert"
  ON public.driver_documents
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS "driver_documents_tenant_update" ON public.driver_documents;
CREATE POLICY "driver_documents_tenant_update"
  ON public.driver_documents
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS "driver_documents_tenant_delete" ON public.driver_documents;
CREATE POLICY "driver_documents_tenant_delete"
  ON public.driver_documents
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS "driver_documents_service_role" ON public.driver_documents;
CREATE POLICY "driver_documents_service_role"
  ON public.driver_documents
  FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

DROP TRIGGER IF EXISTS update_driver_documents_updated_at ON public.driver_documents;
CREATE TRIGGER update_driver_documents_updated_at
  BEFORE UPDATE ON public.driver_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
