-- ══════════════════════════════════════════════════════════════════════════
-- Sprint 4. Certificaat-documenten voor chauffeurs + extra certificaat-types.
--
-- De bestaande tabel public.driver_certification_expiry (migratie
-- 20260421170100) houdt issued_date, expiry_date en een document_url bij
-- per chauffeur per certificering. document_url werd tot nu toe niet
-- gebruikt omdat er geen opslag-laag aan gekoppeld was.
--
-- Deze migratie voegt:
--   1. Kolommen document_name en notes aan de bestaande tabel.
--   2. Een private storage-bucket driver-certificates met tenant-RLS.
--   3. Zeven nieuwe certificering-types (VOG, VGB, Code 95 e.d.) die
--      nodig zijn voor luchtvracht/security-domein.
--
-- Scope v1: opslag + UI. Verloop-notificaties via edge function volgen
-- in een aparte sprint; de bestaande indexen op expiry_date blijven de
-- basis voor die scan.
-- ══════════════════════════════════════════════════════════════════════════

-- ─── Basis-tabel (idempotent) ────────────────────────────────────────
-- Normaal zou 20260421170100_driver_certification_expiry.sql deze tabel
-- aanmaken, maar om ordening-problemen op remote DBs op te vangen
-- nemen we de essentiele create-kolommen hier nogmaals op met IF NOT
-- EXISTS. Op een omgeving waar de vorige migratie al draaide is dit
-- een no-op.
CREATE TABLE IF NOT EXISTS public.driver_certification_expiry (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  driver_id           uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  certification_code  text NOT NULL,
  issued_date         date,
  expiry_date         date,
  document_url        text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (driver_id, certification_code)
);

CREATE INDEX IF NOT EXISTS idx_driver_cert_expiry_tenant_driver
  ON public.driver_certification_expiry (tenant_id, driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_cert_expiry_expiry
  ON public.driver_certification_expiry (expiry_date)
  WHERE expiry_date IS NOT NULL;

DROP TRIGGER IF EXISTS update_driver_cert_expiry_updated_at ON public.driver_certification_expiry;
CREATE TRIGGER update_driver_cert_expiry_updated_at
  BEFORE UPDATE ON public.driver_certification_expiry
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.driver_certification_expiry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation: driver_cert_expiry SELECT" ON public.driver_certification_expiry;
CREATE POLICY "Tenant isolation: driver_cert_expiry SELECT"
  ON public.driver_certification_expiry
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS "Tenant isolation: driver_cert_expiry INSERT" ON public.driver_certification_expiry;
CREATE POLICY "Tenant isolation: driver_cert_expiry INSERT"
  ON public.driver_certification_expiry
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS "Tenant isolation: driver_cert_expiry UPDATE" ON public.driver_certification_expiry;
CREATE POLICY "Tenant isolation: driver_cert_expiry UPDATE"
  ON public.driver_certification_expiry
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS "Tenant isolation: driver_cert_expiry DELETE" ON public.driver_certification_expiry;
CREATE POLICY "Tenant isolation: driver_cert_expiry DELETE"
  ON public.driver_certification_expiry
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS "Service role: driver_cert_expiry" ON public.driver_certification_expiry;
CREATE POLICY "Service role: driver_cert_expiry"
  ON public.driver_certification_expiry
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.driver_certification_expiry TO authenticated;
GRANT ALL ON TABLE public.driver_certification_expiry TO service_role;

-- ─── Nieuwe kolommen voor document-metadata en notities ──────────────
ALTER TABLE public.driver_certification_expiry
  ADD COLUMN IF NOT EXISTS document_name TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN public.driver_certification_expiry.document_url IS
  'Pad binnen bucket driver-certificates ({tenant_id}/{driver_id}/{uuid}.{ext}) of legacy externe URL.';
COMMENT ON COLUMN public.driver_certification_expiry.document_name IS
  'Originele bestandsnaam, alleen voor weergave in de UI.';
COMMENT ON COLUMN public.driver_certification_expiry.notes IS
  'Vrije notitie over het certificaat, bijv. locatie examen of opmerkingen.';

-- Dates-check bestond nog niet. issued_date > expiry_date is altijd
-- een invoerfout, blok dat op DB-niveau.
ALTER TABLE public.driver_certification_expiry
  DROP CONSTRAINT IF EXISTS driver_cert_expiry_dates_chk;
ALTER TABLE public.driver_certification_expiry
  ADD CONSTRAINT driver_cert_expiry_dates_chk
  CHECK (expiry_date IS NULL OR issued_date IS NULL OR expiry_date >= issued_date);

-- ─── Nieuwe certificaat-types ────────────────────────────────────────
-- Luchtvracht- en security-gerelateerde types waren nog niet geseed.
-- We voegen ze per tenant toe, oude types blijven staan en kunnen via de
-- UI op is_active = false gezet worden als een tenant ze niet gebruikt.
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    INSERT INTO public.driver_certifications (tenant_id, code, name, sort_order) VALUES
      (t.id, 'vog',                     'VOG',                     100),
      (t.id, 'vgb',                     'VGB',                     110),
      (t.id, 'medewerker_luchtvracht',  'Medewerker Luchtvracht',  120),
      (t.id, 'code_95',                 'Code 95',                 130),
      (t.id, 'controleur_luchtvracht',  'Controleur Luchtvracht',  140),
      (t.id, 'security_supervisor',     'Security Supervisor',     150),
      (t.id, 'security_manager',        'Security Manager',        160)
    ON CONFLICT (tenant_id, code) DO NOTHING;
  END LOOP;
END $$;

-- ─── Storage bucket + RLS ────────────────────────────────────────────
-- Private bucket: alleen toegankelijk via authenticated requests of
-- signed URLs. Path-conventie: {tenant_id}/{driver_id}/{uuid}.{ext}.
INSERT INTO storage.buckets (id, name, public)
VALUES ('driver-certificates', 'driver-certificates', FALSE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "driver-certificates tenant select" ON storage.objects;
CREATE POLICY "driver-certificates tenant select"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'driver-certificates'
    AND (storage.foldername(name))[1] = (SELECT public.current_tenant_id())::text
  );

DROP POLICY IF EXISTS "driver-certificates tenant insert" ON storage.objects;
CREATE POLICY "driver-certificates tenant insert"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'driver-certificates'
    AND (storage.foldername(name))[1] = (SELECT public.current_tenant_id())::text
  );

DROP POLICY IF EXISTS "driver-certificates tenant update" ON storage.objects;
CREATE POLICY "driver-certificates tenant update"
  ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'driver-certificates'
    AND (storage.foldername(name))[1] = (SELECT public.current_tenant_id())::text
  )
  WITH CHECK (
    bucket_id = 'driver-certificates'
    AND (storage.foldername(name))[1] = (SELECT public.current_tenant_id())::text
  );

DROP POLICY IF EXISTS "driver-certificates tenant delete" ON storage.objects;
CREATE POLICY "driver-certificates tenant delete"
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'driver-certificates'
    AND (storage.foldername(name))[1] = (SELECT public.current_tenant_id())::text
  );

-- ─── ROLLBACK ────────────────────────────────────────────────────────
-- DROP POLICY IF EXISTS "driver-certificates tenant delete" ON storage.objects;
-- DROP POLICY IF EXISTS "driver-certificates tenant update" ON storage.objects;
-- DROP POLICY IF EXISTS "driver-certificates tenant insert" ON storage.objects;
-- DROP POLICY IF EXISTS "driver-certificates tenant select" ON storage.objects;
-- DELETE FROM storage.buckets WHERE id = 'driver-certificates';
-- ALTER TABLE public.driver_certification_expiry
--   DROP CONSTRAINT IF EXISTS driver_cert_expiry_dates_chk,
--   DROP COLUMN IF EXISTS notes,
--   DROP COLUMN IF EXISTS document_name;
-- De zeven nieuwe seed-codes kunnen handmatig verwijderd worden met
-- DELETE FROM public.driver_certifications WHERE code IN (...).
