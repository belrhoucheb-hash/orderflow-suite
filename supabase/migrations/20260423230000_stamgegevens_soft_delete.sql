-- Soft-delete voor stamgegevens, volgens AVG-bewaarplicht.
-- Admin klikt "verwijderen" in de UI, maar de rij blijft in de DB met
-- deleted_at gezet. Dit voorkomt ook het data-verlies via ON DELETE CASCADE
-- op packaging_movements.loading_unit_id (historische bewegingen blijven
-- raadpleegbaar zolang de loading_unit-rij bestaat).
--
-- Queries in de UI filteren deleted_at IS NULL. De rij zelf blijft
-- eeuwig bewaard tenzij een expliciete purge-job hem opruimt.

ALTER TABLE public.loading_units
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

ALTER TABLE public.requirement_types
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

ALTER TABLE public.tenant_warehouses
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

COMMENT ON COLUMN public.loading_units.deleted_at IS
  'Soft-delete timestamp. NULL = actief. Niet-NULL = gearchiveerd, niet meer zichtbaar in UI, wel bewaard voor AVG/historische referentie.';
COMMENT ON COLUMN public.requirement_types.deleted_at IS
  'Soft-delete timestamp. NULL = actief. Niet-NULL = gearchiveerd, niet meer zichtbaar in UI, wel bewaard voor AVG/historische referentie.';
COMMENT ON COLUMN public.tenant_warehouses.deleted_at IS
  'Soft-delete timestamp. NULL = actief. Niet-NULL = gearchiveerd, niet meer zichtbaar in UI, wel bewaard voor AVG/historische referentie.';

CREATE INDEX IF NOT EXISTS idx_loading_units_active
  ON public.loading_units (tenant_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_requirement_types_active
  ON public.requirement_types (tenant_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_warehouses_active
  ON public.tenant_warehouses (tenant_id)
  WHERE deleted_at IS NULL;

-- ─── ROLLBACK ────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS idx_loading_units_active;
-- DROP INDEX IF EXISTS idx_requirement_types_active;
-- DROP INDEX IF EXISTS idx_tenant_warehouses_active;
-- ALTER TABLE public.loading_units DROP COLUMN IF EXISTS deleted_at;
-- ALTER TABLE public.requirement_types DROP COLUMN IF EXISTS deleted_at;
-- ALTER TABLE public.tenant_warehouses DROP COLUMN IF EXISTS deleted_at;
