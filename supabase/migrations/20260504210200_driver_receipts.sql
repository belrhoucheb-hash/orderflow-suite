-- Chauffeursportaal vervolg: bonnetjes (diesel, parking, tol, overig).
--
-- Chauffeur scant of fotografeert een bon, het bestand wordt geupload naar
-- de bucket `receipts` onder {tenant_id}/{driver_id}/{timestamp}.{ext} en
-- er wordt een rij aangemaakt in deze tabel met status `pending_ocr`.
-- OCR-extractie volgt later via een aparte pipeline (vergelijkbaar met
-- ai-intake / parse-order). Tot die tijd kan de planner de bon zelf
-- handmatig openen en het bedrag invoeren.

CREATE TABLE IF NOT EXISTS public.driver_receipts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  driver_id     UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  scanned_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  file_path     TEXT NOT NULL,
  file_name     TEXT,
  ocr_text      JSONB,
  total_amount  NUMERIC(10,2),
  vat_amount    NUMERIC(10,2),
  currency      TEXT NOT NULL DEFAULT 'EUR',
  type          TEXT NOT NULL DEFAULT 'overig'
                  CHECK (type IN ('diesel','parking','tol','overig')),
  location      TEXT,
  trip_id       UUID REFERENCES public.trips(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'pending_ocr'
                  CHECK (status IN ('pending_ocr','ocr_done','approved','rejected')),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.driver_receipts IS
  'Bonnetjes geupload door chauffeur via /chauffeur. OCR-extractie volgt asynchroon.';
COMMENT ON COLUMN public.driver_receipts.file_path IS
  'Storage-path in de receipts bucket: {tenant_id}/{driver_id}/{timestamp}.{ext}';
COMMENT ON COLUMN public.driver_receipts.ocr_text IS
  'Geextraheerde velden uit OCR (bedrag, datum, locatie, verkoper). NULL totdat OCR is gedraaid.';
COMMENT ON COLUMN public.driver_receipts.status IS
  'pending_ocr -> ocr_done -> approved/rejected. Planner valideert na OCR.';

CREATE INDEX IF NOT EXISTS idx_driver_receipts_tenant_scanned
  ON public.driver_receipts (tenant_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_receipts_driver_scanned
  ON public.driver_receipts (driver_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_receipts_status
  ON public.driver_receipts (status)
  WHERE status IN ('pending_ocr','ocr_done');

ALTER TABLE public.driver_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "driver_receipts_tenant_select" ON public.driver_receipts;
CREATE POLICY "driver_receipts_tenant_select" ON public.driver_receipts
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS "driver_receipts_tenant_insert" ON public.driver_receipts;
CREATE POLICY "driver_receipts_tenant_insert" ON public.driver_receipts
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS "driver_receipts_tenant_update" ON public.driver_receipts;
CREATE POLICY "driver_receipts_tenant_update" ON public.driver_receipts
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS "driver_receipts_tenant_delete" ON public.driver_receipts;
CREATE POLICY "driver_receipts_tenant_delete" ON public.driver_receipts
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS "driver_receipts_service_role" ON public.driver_receipts;
CREATE POLICY "driver_receipts_service_role" ON public.driver_receipts
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON TABLE public.driver_receipts TO authenticated;
GRANT ALL ON TABLE public.driver_receipts TO service_role;

DROP TRIGGER IF EXISTS update_driver_receipts_updated_at ON public.driver_receipts;
CREATE TRIGGER update_driver_receipts_updated_at
  BEFORE UPDATE ON public.driver_receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ─── Storage bucket ───────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO UPDATE
SET public = false;

DROP POLICY IF EXISTS "receipts tenant select" ON storage.objects;
CREATE POLICY "receipts tenant select"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = (SELECT public.get_user_tenant_id())::text
  );

DROP POLICY IF EXISTS "receipts tenant insert" ON storage.objects;
CREATE POLICY "receipts tenant insert"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = (SELECT public.get_user_tenant_id())::text
  );

DROP POLICY IF EXISTS "receipts tenant update" ON storage.objects;
CREATE POLICY "receipts tenant update"
  ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = (SELECT public.get_user_tenant_id())::text
  )
  WITH CHECK (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = (SELECT public.get_user_tenant_id())::text
  );

DROP POLICY IF EXISTS "receipts tenant delete" ON storage.objects;
CREATE POLICY "receipts tenant delete"
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = (SELECT public.get_user_tenant_id())::text
  );

-- ─── ROLLBACK ─────────────────────────────────────────────────
-- DROP TABLE IF EXISTS public.driver_receipts CASCADE;
-- DELETE FROM storage.buckets WHERE id = 'receipts';
