-- Add geocoding columns to trip_stops for geofence arrival detection
ALTER TABLE public.trip_stops
  ADD COLUMN IF NOT EXISTS planned_latitude double precision,
  ADD COLUMN IF NOT EXISTS planned_longitude double precision;

-- Index for geofence proximity queries
CREATE INDEX IF NOT EXISTS idx_trip_stops_geo
  ON public.trip_stops(planned_latitude, planned_longitude)
  WHERE planned_latitude IS NOT NULL;
