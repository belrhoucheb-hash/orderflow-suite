-- ══════════════════════════════════════════════════════════════════════════
-- Sprint 5. Vloot-documenten als master-data + private storage-bucket.
--
-- Tot nu toe staan voertuig-documenten (APK, kentekenbewijs, verzekering,
-- enz.) als losse doc_type-strings in public.vehicle_documents, zonder
-- beheerbare lijst en zonder opslag-laag voor de scans zelf. Parallel aan
-- wat al bestaat voor chauffeurs (public.driver_certifications als
-- master-data, public.driver_certification_expiry voor de records en de
-- private bucket driver-certificates) zetten we hier de vloot-kant neer:
--
--   1. public.vehicle_document_types als master-lijst per tenant, met
--      standaard-seeds voor de acht meest gebruikte voertuig-documenten.
--   2. Uitbreiding van public.vehicle_documents met document_name en
--      issued_date, plus een check-constraint op de datumvolgorde.
--   3. Private storage-bucket vehicle-documents met tenant-RLS, padschema
--      {tenant_id}/{vehicle_id}/{uuid}.{ext}.
--
-- Scope Fase 1: DB + storage. De AI-extractie (edge function), UI-dialog
-- en hooks volgen in Fase 2 zodra deze laag live is.
-- ══════════════════════════════════════════════════════════════════════════

-- ─── Tabel vehicle_document_types ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vehicle_document_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  sort_order  INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_document_types_tenant
  ON public.vehicle_document_types (tenant_id);

COMMENT ON TABLE public.vehicle_document_types IS
  'Master-data: beschikbare documenttypes per tenant voor voertuigen. vehicle_documents.doc_type bevat de codes hieruit.';

-- ─── Trigger voor updated_at ─────────────────────────────────────────
DROP TRIGGER IF EXISTS update_vehicle_document_types_updated_at ON public.vehicle_document_types;
CREATE TRIGGER update_vehicle_document_types_updated_at
  BEFORE UPDATE ON public.vehicle_document_types
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ─── RLS ─────────────────────────────────────────────────────────────
ALTER TABLE public.vehicle_document_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation: vehicle_document_types SELECT" ON public.vehicle_document_types;
CREATE POLICY "Tenant isolation: vehicle_document_types SELECT"
  ON public.vehicle_document_types
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS "Tenant isolation: vehicle_document_types INSERT" ON public.vehicle_document_types;
CREATE POLICY "Tenant isolation: vehicle_document_types INSERT"
  ON public.vehicle_document_types
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS "Tenant isolation: vehicle_document_types UPDATE" ON public.vehicle_document_types;
CREATE POLICY "Tenant isolation: vehicle_document_types UPDATE"
  ON public.vehicle_document_types
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS "Tenant isolation: vehicle_document_types DELETE" ON public.vehicle_document_types;
CREATE POLICY "Tenant isolation: vehicle_document_types DELETE"
  ON public.vehicle_document_types
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS "Service role: vehicle_document_types" ON public.vehicle_document_types;
CREATE POLICY "Service role: vehicle_document_types"
  ON public.vehicle_document_types
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

GRANT ALL ON TABLE public.vehicle_document_types TO anon;
GRANT ALL ON TABLE public.vehicle_document_types TO authenticated;
GRANT ALL ON TABLE public.vehicle_document_types TO service_role;

-- ─── Seed-functie ────────────────────────────────────────────────────
-- Standaard-set voor de acht documenten die in de praktijk standaard bij
-- een voertuig horen. Volgorde bepaalt de UI-sortering. Idempotent via
-- ON CONFLICT op de unique (tenant_id, code).
CREATE OR REPLACE FUNCTION public.seed_default_vehicle_document_types(p_tenant_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO public.vehicle_document_types (tenant_id, code, name, sort_order) VALUES
    (p_tenant_id, 'apk',            'APK-keuring',         10),
    (p_tenant_id, 'kentekenbewijs', 'Kentekenbewijs',      20),
    (p_tenant_id, 'verzekering',    'Verzekeringsbewijs',  30),
    (p_tenant_id, 'groene_kaart',   'Groene kaart',        40),
    (p_tenant_id, 'eurovignet',     'Eurovignet',          50),
    (p_tenant_id, 'adr',            'ADR-keuring',         60),
    (p_tenant_id, 'tachograaf',     'Tachograaf-ijking',   70),
    (p_tenant_id, 'leasecontract',  'Leasecontract',       80)
  ON CONFLICT (tenant_id, code) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.seed_default_vehicle_document_types(UUID) IS
  'Idempotente seed van de acht default voertuig-documenttypes per tenant.';

-- ─── Toepassen op alle bestaande tenants ─────────────────────────────
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    PERFORM public.seed_default_vehicle_document_types(t.id);
  END LOOP;
END $$;

-- ─── Uitbreiding vehicle_documents ───────────────────────────────────
ALTER TABLE public.vehicle_documents
  ADD COLUMN IF NOT EXISTS document_name TEXT,
  ADD COLUMN IF NOT EXISTS issued_date   DATE;

COMMENT ON COLUMN public.vehicle_documents.file_url IS
  'Pad binnen bucket vehicle-documents ({tenant_id}/{vehicle_id}/{uuid}.{ext}) of legacy externe URL.';
COMMENT ON COLUMN public.vehicle_documents.document_name IS
  'Originele bestandsnaam, alleen voor weergave in de UI.';

-- Dates-check: als beide ingevuld zijn, moet expiry_date niet voor
-- issued_date liggen. Consistent met driver_cert_expiry_dates_chk.
ALTER TABLE public.vehicle_documents
  DROP CONSTRAINT IF EXISTS vehicle_documents_dates_chk;
ALTER TABLE public.vehicle_documents
  ADD CONSTRAINT vehicle_documents_dates_chk
  CHECK (expiry_date IS NULL OR issued_date IS NULL OR expiry_date >= issued_date);

-- ─── Storage bucket + RLS ────────────────────────────────────────────
-- Private bucket: alleen toegankelijk via authenticated requests of
-- signed URLs. Path-conventie: {tenant_id}/{vehicle_id}/{uuid}.{ext}.
INSERT INTO storage.buckets (id, name, public)
VALUES ('vehicle-documents', 'vehicle-documents', FALSE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "vehicle-documents tenant select" ON storage.objects;
CREATE POLICY "vehicle-documents tenant select"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'vehicle-documents'
    AND (storage.foldername(name))[1] = (SELECT public.current_tenant_id())::text
  );

DROP POLICY IF EXISTS "vehicle-documents tenant insert" ON storage.objects;
CREATE POLICY "vehicle-documents tenant insert"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'vehicle-documents'
    AND (storage.foldername(name))[1] = (SELECT public.current_tenant_id())::text
  );

DROP POLICY IF EXISTS "vehicle-documents tenant update" ON storage.objects;
CREATE POLICY "vehicle-documents tenant update"
  ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'vehicle-documents'
    AND (storage.foldername(name))[1] = (SELECT public.current_tenant_id())::text
  )
  WITH CHECK (
    bucket_id = 'vehicle-documents'
    AND (storage.foldername(name))[1] = (SELECT public.current_tenant_id())::text
  );

DROP POLICY IF EXISTS "vehicle-documents tenant delete" ON storage.objects;
CREATE POLICY "vehicle-documents tenant delete"
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'vehicle-documents'
    AND (storage.foldername(name))[1] = (SELECT public.current_tenant_id())::text
  );

-- ─── ROLLBACK ────────────────────────────────────────────────────────
-- DROP POLICY IF EXISTS "vehicle-documents tenant delete" ON storage.objects;
-- DROP POLICY IF EXISTS "vehicle-documents tenant update" ON storage.objects;
-- DROP POLICY IF EXISTS "vehicle-documents tenant insert" ON storage.objects;
-- DROP POLICY IF EXISTS "vehicle-documents tenant select" ON storage.objects;
-- DELETE FROM storage.buckets WHERE id = 'vehicle-documents';
-- ALTER TABLE public.vehicle_documents
--   DROP CONSTRAINT IF EXISTS vehicle_documents_dates_chk,
--   DROP COLUMN IF EXISTS issued_date,
--   DROP COLUMN IF EXISTS document_name;
-- DROP FUNCTION IF EXISTS public.seed_default_vehicle_document_types(UUID);
-- DROP TABLE IF EXISTS public.vehicle_document_types;
