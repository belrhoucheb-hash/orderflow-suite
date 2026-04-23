-- Voegt een handmatig in te vullen debiteurnummer toe op klanten.
-- Geen UNIQUE constraint: tenants mogen zelf besluiten of ze strikt zijn
-- of tijdelijke duplicaten toestaan (bijv. bij migratie vanuit een oud
-- systeem).

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS debtor_number text;

COMMENT ON COLUMN public.clients.debtor_number IS
  'Administratief debiteurnummer, handmatig toegewezen. Optioneel.';

-- ─── ROLLBACK ────────────────────────────────────────────────────────
-- ALTER TABLE public.clients DROP COLUMN IF EXISTS debtor_number;
