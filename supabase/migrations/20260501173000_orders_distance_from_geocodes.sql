CREATE OR REPLACE FUNCTION public.orders_set_distance_km_from_geocodes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_earth_km constant double precision := 6371;
  v_pickup_lat double precision;
  v_pickup_lng double precision;
  v_delivery_lat double precision;
  v_delivery_lng double precision;
  v_dlat double precision;
  v_dlng double precision;
  v_a double precision;
  v_straight_km double precision;
BEGIN
  IF NEW.distance_km IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.geocoded_pickup_lat IS NULL
     OR NEW.geocoded_pickup_lng IS NULL
     OR NEW.geocoded_delivery_lat IS NULL
     OR NEW.geocoded_delivery_lng IS NULL THEN
    RETURN NEW;
  END IF;

  v_pickup_lat := radians(NEW.geocoded_pickup_lat);
  v_pickup_lng := radians(NEW.geocoded_pickup_lng);
  v_delivery_lat := radians(NEW.geocoded_delivery_lat);
  v_delivery_lng := radians(NEW.geocoded_delivery_lng);
  v_dlat := v_delivery_lat - v_pickup_lat;
  v_dlng := v_delivery_lng - v_pickup_lng;

  v_a := power(sin(v_dlat / 2), 2)
    + cos(v_pickup_lat) * cos(v_delivery_lat) * power(sin(v_dlng / 2), 2);
  v_straight_km := 2 * v_earth_km * atan2(sqrt(v_a), sqrt(1 - v_a));

  NEW.distance_km := round(greatest(1, v_straight_km * 1.28)::numeric, 1);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_set_distance_km_from_geocodes ON public.orders;

CREATE TRIGGER trg_orders_set_distance_km_from_geocodes
  BEFORE INSERT OR UPDATE OF distance_km, geocoded_pickup_lat, geocoded_pickup_lng, geocoded_delivery_lat, geocoded_delivery_lng
  ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.orders_set_distance_km_from_geocodes();

UPDATE public.orders
   SET distance_km = NULL
 WHERE distance_km IS NULL
   AND geocoded_pickup_lat IS NOT NULL
   AND geocoded_pickup_lng IS NOT NULL
   AND geocoded_delivery_lat IS NOT NULL
   AND geocoded_delivery_lng IS NOT NULL;

COMMENT ON FUNCTION public.orders_set_distance_km_from_geocodes() IS
  'Vult orders.distance_km uit geocode-punten wanneer New Order of imports geen afstand meesturen.';
