-- Naamgeving in public.orders is historisch gegroeid: de coord-kolommen
-- heten `geocoded_pickup_lat/lng` en `geocoded_delivery_lat/lng` (uit de
-- baseline), terwijl de gesplitste adresvelden `pickup_*` en `delivery_*`
-- als prefix gebruiken. Deze migratie voegt alleen SQL-COMMENTs toe zodat
-- maintainers die naar `pickup_lat` zoeken de link naar de geocoded-kolom
-- direct in het schema zien, geen renames (breaking).

COMMENT ON COLUMN public.orders.geocoded_pickup_lat IS 'Pickup-coordinaat, bij Google-autocomplete gezet. Gekoppeld aan pickup_street/zipcode/city. Zie pickup_coords_manual voor handmatige overrides.';
COMMENT ON COLUMN public.orders.geocoded_pickup_lng IS 'Pickup-coordinaat, bij Google-autocomplete gezet. Gekoppeld aan pickup_street/zipcode/city. Zie pickup_coords_manual voor handmatige overrides.';
COMMENT ON COLUMN public.orders.geocoded_delivery_lat IS 'Delivery-coordinaat, bij Google-autocomplete gezet. Gekoppeld aan delivery_street/zipcode/city. Zie delivery_coords_manual voor handmatige overrides.';
COMMENT ON COLUMN public.orders.geocoded_delivery_lng IS 'Delivery-coordinaat, bij Google-autocomplete gezet. Gekoppeld aan delivery_street/zipcode/city. Zie delivery_coords_manual voor handmatige overrides.';
