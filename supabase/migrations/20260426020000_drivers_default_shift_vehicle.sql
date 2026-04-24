-- Sprint 7. Default-rooster en default-voertuig per chauffeur.
--
-- Waarom:
--   "Andreas rijdt altijd Caddy35 in dagdienst" is een stabiele waarheid die
--   niet iedere dag opnieuw ingevoerd hoeft te worden. De "Pas standaard-
--   rooster toe"-actie in de Rooster-weekview leest deze defaults en vult
--   daarmee de hele week in één klik.
--
--   FK's ON DELETE SET NULL zodat een verwijderde template of voertuig de
--   chauffeur-rij niet stuk maakt; de default valt dan terug op leeg.

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS default_shift_template_id UUID
    REFERENCES public.shift_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_vehicle_id UUID
    REFERENCES public.vehicles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_drivers_default_shift_template
  ON public.drivers (default_shift_template_id)
  WHERE default_shift_template_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_drivers_default_vehicle
  ON public.drivers (default_vehicle_id)
  WHERE default_vehicle_id IS NOT NULL;

COMMENT ON COLUMN public.drivers.default_shift_template_id IS
  'Standaard-rooster voor deze chauffeur (Vroeg/Dag/Laat/...). Gebruikt door de "Pas standaardrooster toe"-actie om een week in één klik te vullen.';

COMMENT ON COLUMN public.drivers.default_vehicle_id IS
  'Voertuig dat deze chauffeur normaal rijdt. Gebruikt door "Pas standaardrooster toe" en als prefill in nieuwe rooster-rijen.';

-- ─── ROLLBACK ──────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS idx_drivers_default_vehicle;
-- DROP INDEX IF EXISTS idx_drivers_default_shift_template;
-- ALTER TABLE public.drivers
--   DROP COLUMN IF EXISTS default_vehicle_id,
--   DROP COLUMN IF EXISTS default_shift_template_id;
