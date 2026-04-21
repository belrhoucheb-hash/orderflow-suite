-- Google adres-autocomplete + sleepbare pin voor nieuwe orders.
-- Orders krijgen gesplitste adresvelden + coordinaten naast de bestaande
-- pickup_address / delivery_address strings. De lat/lng-kolommen
-- geocoded_pickup_lat/lng en geocoded_delivery_lat/lng bestaan al in de
-- baseline en worden hergebruikt, geen duplicaten.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pickup_street text,
  ADD COLUMN IF NOT EXISTS pickup_house_number text,
  ADD COLUMN IF NOT EXISTS pickup_house_number_suffix text,
  ADD COLUMN IF NOT EXISTS pickup_zipcode text,
  ADD COLUMN IF NOT EXISTS pickup_city text,
  ADD COLUMN IF NOT EXISTS pickup_country text,
  ADD COLUMN IF NOT EXISTS pickup_coords_manual boolean NOT NULL DEFAULT false,

  ADD COLUMN IF NOT EXISTS delivery_street text,
  ADD COLUMN IF NOT EXISTS delivery_house_number text,
  ADD COLUMN IF NOT EXISTS delivery_house_number_suffix text,
  ADD COLUMN IF NOT EXISTS delivery_zipcode text,
  ADD COLUMN IF NOT EXISTS delivery_city text,
  ADD COLUMN IF NOT EXISTS delivery_country text,
  ADD COLUMN IF NOT EXISTS delivery_coords_manual boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.orders.pickup_coords_manual IS 'true = pickup-pin handmatig versleept na autocomplete, coordinaten wijken af van Google-match.';
COMMENT ON COLUMN public.orders.delivery_coords_manual IS 'true = delivery-pin handmatig versleept na autocomplete, coordinaten wijken af van Google-match.';
