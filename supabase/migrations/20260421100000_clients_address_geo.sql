-- Google adres-autocomplete + sleepbare pin: gesplitste adresvelden + coordinaten
-- Scope: alleen clients (main, billing, shipping). client_locations volgt later.
-- Bestaande address/zipcode/city/country blijven bestaan als display-strings,
-- de dialog vult ze bij opslaan zodat downstream code (facturen, CMR,
-- trajectRouter) onveranderd blijft werken.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS street text,
  ADD COLUMN IF NOT EXISTS house_number text,
  ADD COLUMN IF NOT EXISTS house_number_suffix text,
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS coords_manual boolean NOT NULL DEFAULT false,

  ADD COLUMN IF NOT EXISTS billing_street text,
  ADD COLUMN IF NOT EXISTS billing_house_number text,
  ADD COLUMN IF NOT EXISTS billing_house_number_suffix text,
  ADD COLUMN IF NOT EXISTS billing_lat double precision,
  ADD COLUMN IF NOT EXISTS billing_lng double precision,
  ADD COLUMN IF NOT EXISTS billing_coords_manual boolean NOT NULL DEFAULT false,

  ADD COLUMN IF NOT EXISTS shipping_street text,
  ADD COLUMN IF NOT EXISTS shipping_house_number text,
  ADD COLUMN IF NOT EXISTS shipping_house_number_suffix text,
  ADD COLUMN IF NOT EXISTS shipping_lat double precision,
  ADD COLUMN IF NOT EXISTS shipping_lng double precision,
  ADD COLUMN IF NOT EXISTS shipping_coords_manual boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clients.lat IS 'WGS84 breedtegraad hoofdadres, uit Google Places of handmatig versleept.';
COMMENT ON COLUMN public.clients.lng IS 'WGS84 lengtegraad hoofdadres, uit Google Places of handmatig versleept.';
COMMENT ON COLUMN public.clients.coords_manual IS 'true = pin is handmatig versleept na autocomplete, lat/lng wijkt af van Google-match.';
