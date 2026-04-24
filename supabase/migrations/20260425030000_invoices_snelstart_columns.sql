-- Snelstart-koppeling op invoices: per factuur status van de
-- boekhoudsync bijhouden, zodat de UI kan tonen of een factuur al in
-- Snelstart staat en bij welke boeking-ID.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS snelstart_boeking_id TEXT,
  ADD COLUMN IF NOT EXISTS snelstart_status     TEXT NOT NULL DEFAULT 'niet_geboekt',
  ADD COLUMN IF NOT EXISTS snelstart_error      TEXT,
  ADD COLUMN IF NOT EXISTS snelstart_geboekt_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_snelstart_status_chk'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_snelstart_status_chk
      CHECK (snelstart_status IN ('niet_geboekt', 'geboekt', 'fout', 'bezig'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_invoices_snelstart_status
  ON public.invoices (tenant_id, snelstart_status)
  WHERE snelstart_status <> 'niet_geboekt';

COMMENT ON COLUMN public.invoices.snelstart_status IS
  'Status van de sync naar Snelstart: niet_geboekt (default), bezig, geboekt, fout.';
COMMENT ON COLUMN public.invoices.snelstart_boeking_id IS
  'ID van de verkoopboeking in Snelstart (returns van /v2/verkoopboekingen).';
COMMENT ON COLUMN public.invoices.snelstart_error IS
  'Laatste foutmelding bij mislukte sync, leeg bij succes.';

-- --- ROLLBACK -------------------------------------------------------
-- DROP INDEX IF EXISTS idx_invoices_snelstart_status;
-- ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_snelstart_status_chk;
-- ALTER TABLE public.invoices
--   DROP COLUMN IF EXISTS snelstart_geboekt_at,
--   DROP COLUMN IF EXISTS snelstart_error,
--   DROP COLUMN IF EXISTS snelstart_status,
--   DROP COLUMN IF EXISTS snelstart_boeking_id;
