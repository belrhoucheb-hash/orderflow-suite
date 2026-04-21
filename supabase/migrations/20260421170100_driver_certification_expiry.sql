-- ══════════════════════════════════════════════════════════════════════════
-- Sprint 4, chauffeurs-redesign. Vervaldata per certificering per chauffeur.
--
-- drivers.certifications[] bevat de lijst codes die de chauffeur bezit.
-- Deze tabel legt per (driver, cert) de issued_date en expiry_date vast,
-- zodat planning kan waarschuwen voor aflopende certificeringen (ADR,
-- Code 95, etc.). document_url is voorbereid voor volgende sprint waar
-- we PDF-kopieen via Supabase Storage opslaan.
-- ══════════════════════════════════════════════════════════════════════════

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

COMMENT ON TABLE public.driver_certification_expiry IS
  'Vervaldata per certificering per chauffeur. Basis voor rijbewijs/Code 95/ADR alertering.';

DROP TRIGGER IF EXISTS update_driver_cert_expiry_updated_at ON public.driver_certification_expiry;
CREATE TRIGGER update_driver_cert_expiry_updated_at
  BEFORE UPDATE ON public.driver_certification_expiry
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ─── RLS ─────────────────────────────────────────────────────
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

-- ─── ROLLBACK ─────────────────────────────────────────────────
-- DROP TABLE IF EXISTS public.driver_certification_expiry CASCADE;
