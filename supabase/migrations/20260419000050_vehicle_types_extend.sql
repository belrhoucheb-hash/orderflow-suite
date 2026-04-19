-- ──────────────────────────────────────────────────────────────────────────
-- Sprint 2. Breidt vehicle_types uit met de prijs-relevante afmetingen en
-- flags die in 20260418100000_vehicle_types.sql (archive) bedoeld waren,
-- maar op remote nog niet zijn toegepast. Idempotent.
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE public.vehicle_types
  ADD COLUMN IF NOT EXISTS max_length_cm  INTEGER,
  ADD COLUMN IF NOT EXISTS max_width_cm   INTEGER,
  ADD COLUMN IF NOT EXISTS max_height_cm  INTEGER,
  ADD COLUMN IF NOT EXISTS max_weight_kg  INTEGER,
  ADD COLUMN IF NOT EXISTS max_volume_m3  NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS max_pallets    INTEGER,
  ADD COLUMN IF NOT EXISTS has_tailgate   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_cooling    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS adr_capable    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ NOT NULL DEFAULT now();

COMMENT ON COLUMN public.vehicle_types.max_length_cm IS
  'Maximale laadruimte lengte in cm. Gebruikt door tariefmotor voor kleinste-passend-selectie.';
COMMENT ON COLUMN public.vehicle_types.has_tailgate IS
  'Of dit voertuig een laadklep heeft. Motor filtert hierop bij requires_tailgate cargo.';

DROP TRIGGER IF EXISTS update_vehicle_types_updated_at ON public.vehicle_types;
CREATE TRIGGER update_vehicle_types_updated_at
  BEFORE UPDATE ON public.vehicle_types
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
