-- Vloot-vereenvoudiging:
--   1. Code en palletplaatsen worden uit het voertuig-formulier gehaald
--      en moeten daarom nullable worden op DB-niveau.
--   2. Laadruimte-afmetingen komen in de plaats: lengte, breedte, hoogte
--      in centimeters op het voertuig zelf (los van het type).
--   3. Vier overbodige voertuigtypes worden op is_active=false gezet
--      zodat ze niet meer in keuzelijsten verschijnen. Bewust geen
--      DELETE: er kunnen bestaande voertuigen of ritten aan hangen.

ALTER TABLE public.vehicles
  ALTER COLUMN code DROP NOT NULL,
  ALTER COLUMN capacity_pallets DROP NOT NULL;

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS load_length_cm integer,
  ADD COLUMN IF NOT EXISTS load_width_cm  integer,
  ADD COLUMN IF NOT EXISTS load_height_cm integer;

COMMENT ON COLUMN public.vehicles.load_length_cm IS
  'Binnenmaat laadruimte lengte in cm.';
COMMENT ON COLUMN public.vehicles.load_width_cm IS
  'Binnenmaat laadruimte breedte in cm.';
COMMENT ON COLUMN public.vehicles.load_height_cm IS
  'Binnenmaat laadruimte hoogte in cm.';

UPDATE public.vehicle_types
SET is_active = false
WHERE code IN ('hoya', 'van', 'box-truck', 'tractor', 'bestelbus');

-- ─── ROLLBACK ────────────────────────────────────────────────────────
-- UPDATE public.vehicle_types
-- SET is_active = true
-- WHERE code IN ('hoya', 'van', 'box-truck', 'tractor', 'bestelbus');
--
-- ALTER TABLE public.vehicles
--   DROP COLUMN IF EXISTS load_height_cm,
--   DROP COLUMN IF EXISTS load_width_cm,
--   DROP COLUMN IF EXISTS load_length_cm;
--
-- ALTER TABLE public.vehicles
--   ALTER COLUMN capacity_pallets SET NOT NULL,
--   ALTER COLUMN code SET NOT NULL;
