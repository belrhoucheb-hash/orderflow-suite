-- Laadadressen per klant (client_locations) krijgen zelfde gesplitste
-- adresvelden en coordinaten als clients. Zo kunnen chauffeurs navigeren
-- naar de exacte pin en kan de planner afstanden berekenen.
-- De bestaande `address` kolom blijft dienen als weergave-string.

ALTER TABLE public.client_locations
  ADD COLUMN IF NOT EXISTS street text,
  ADD COLUMN IF NOT EXISTS house_number text,
  ADD COLUMN IF NOT EXISTS house_number_suffix text,
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS coords_manual boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.client_locations.lat IS 'WGS84 breedtegraad, uit Google Places of handmatig versleept.';
COMMENT ON COLUMN public.client_locations.lng IS 'WGS84 lengtegraad, uit Google Places of handmatig versleept.';
COMMENT ON COLUMN public.client_locations.coords_manual IS 'true = pin handmatig versleept na autocomplete, lat/lng wijkt af van Google-match.';
