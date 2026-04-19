-- AI-zekerheid per foto (0..1). Laag = UI toont waarschuwing, geen hard blok.
ALTER TABLE public.vehicle_check_photos
  ADD COLUMN IF NOT EXISTS confidence NUMERIC;

COMMENT ON COLUMN public.vehicle_check_photos.confidence IS
  'Zekerheid van de AI-analyse voor deze foto (0..1). Onder 0.7 tonen als zachte waarschuwing.';
