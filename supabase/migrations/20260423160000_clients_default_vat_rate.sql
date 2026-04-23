-- Default BTW-tarief per klant. UI biedt op dit moment twee keuzes:
-- 0% (verlegd of intracommunautair) en 21% (standaard NL). Kolom is
-- numeric zodat eventuele toekomstige tarieven (9% laag tarief) zonder
-- migratie passen.
--
-- Default 21 zodat bestaande rijen meteen een zinnig tarief hebben en
-- de UI geen null-check hoeft te doen.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS default_vat_rate numeric(5, 2) NOT NULL DEFAULT 21.00;

COMMENT ON COLUMN public.clients.default_vat_rate IS
  'Standaard BTW-percentage dat bij facturatie wordt voorgesteld. 0 = verlegd of intracommunautair, 21 = standaard NL.';

-- ─── ROLLBACK ────────────────────────────────────────────────────────
-- ALTER TABLE public.clients DROP COLUMN IF EXISTS default_vat_rate;
