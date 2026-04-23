-- Voegt de ontbrekende kolom orders.distance_km toe.
--
-- Context: de code gebruikt deze kolom al in Facturatie (per-km tarief),
-- auto-invoicer, FinancialTab en reportExporter, maar de kolom zelf is
-- nooit in een migratie gelegd. PostgREST gaf daardoor overal
-- "column orders.distance_km does not exist" (SQLSTATE 42703).
--
-- Type: numeric(10,2), nullable. Rijen zonder ingevulde afstand blijven
-- NULL; de front-end valt daar al op 0 terug. Geen default op DB-niveau
-- zodat handmatig invoeren en geautomatiseerd berekenen verschillend
-- behandeld kunnen worden later.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS distance_km numeric(10, 2);

COMMENT ON COLUMN public.orders.distance_km IS
  'Rit-afstand in kilometers, gebruikt voor per-km facturatie. NULL = nog niet bepaald.';

-- ─── ROLLBACK ────────────────────────────────────────────────────────
-- ALTER TABLE public.orders DROP COLUMN IF EXISTS distance_km;
