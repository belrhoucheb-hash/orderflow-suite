-- Geo-indexen op orders zodat kaart-queries (bounding-box, dichtstbijzijnde)
-- niet full-table-scans worden naarmate de orders-tabel groeit.
-- Partial index: alleen rijen met niet-null coordinaten, scheelt ruimte.

CREATE INDEX IF NOT EXISTS idx_orders_pickup_geo
  ON public.orders (geocoded_pickup_lat, geocoded_pickup_lng)
  WHERE geocoded_pickup_lat IS NOT NULL AND geocoded_pickup_lng IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_delivery_geo
  ON public.orders (geocoded_delivery_lat, geocoded_delivery_lng)
  WHERE geocoded_delivery_lat IS NOT NULL AND geocoded_delivery_lng IS NOT NULL;
