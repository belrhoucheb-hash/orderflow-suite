-- Soft-delete voor vloot-entiteiten, volgens fiscale bewaarplicht (art. 52 AWR).
--
-- Admin klikt in de UI op "verwijderen", maar de rij blijft in de DB met
-- deleted_at gezet. Zo verdwijnen voertuigen, documenten en onderhouds-
-- regels uit de app zonder dat we historische trips, orders, facturen
-- en onderhoudsfacturen loskoppelen of kwijtraken. Dat laatste is een
-- harde eis vanuit de bewaarplicht (7 jaar) en maakt een belasting-
-- controle reconstrueerbaar.
--
-- Queries in de UI filteren deleted_at IS NULL. Een purge-job bestaat
-- bewust nog niet, een toekomstige job kan rijen ouder dan 7 jaar
-- opruimen of pseudonimiseren.
--
-- vehicle_types blijft hard-delete: het is een catalogus-entry zonder
-- financiele waarde, FK-restrict op rate_rules en vehicles beschermt
-- tegen dangling references.

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

ALTER TABLE public.vehicle_documents
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

ALTER TABLE public.vehicle_maintenance
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

COMMENT ON COLUMN public.vehicles.deleted_at IS
  'Soft-delete timestamp. NULL = actief. Niet-NULL = gearchiveerd, niet meer zichtbaar in UI, wel bewaard voor fiscale bewaarplicht (7 jaar) en historische trips/orders.';
COMMENT ON COLUMN public.vehicle_documents.deleted_at IS
  'Soft-delete timestamp. NULL = actief. Niet-NULL = gearchiveerd. Het onderliggende bestand in Supabase Storage blijft staan zolang de rij bestaat, conform bewaarplicht voor keuringen en vergunningen.';
COMMENT ON COLUMN public.vehicle_maintenance.deleted_at IS
  'Soft-delete timestamp. NULL = actief. Niet-NULL = gearchiveerd. Onderhoudsfacturen vallen onder de 7-jaar bewaarplicht, dus de rij blijft bewaard.';

CREATE INDEX IF NOT EXISTS idx_vehicles_active
  ON public.vehicles (tenant_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vehicle_documents_active
  ON public.vehicle_documents (vehicle_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vehicle_maintenance_active
  ON public.vehicle_maintenance (vehicle_id)
  WHERE deleted_at IS NULL;

-- --- ROLLBACK -------------------------------------------------------
-- DROP INDEX IF EXISTS idx_vehicles_active;
-- DROP INDEX IF EXISTS idx_vehicle_documents_active;
-- DROP INDEX IF EXISTS idx_vehicle_maintenance_active;
-- ALTER TABLE public.vehicles           DROP COLUMN IF EXISTS deleted_at;
-- ALTER TABLE public.vehicle_documents  DROP COLUMN IF EXISTS deleted_at;
-- ALTER TABLE public.vehicle_maintenance DROP COLUMN IF EXISTS deleted_at;
