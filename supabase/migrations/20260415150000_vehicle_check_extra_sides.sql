-- Extra aanzichten voor voertuigcheck: dashboard (verplicht), klep en koelunit (optioneel).
-- Plak dit in de Supabase SQL Editor; niet via CLI pushen (migration history is scheef).

ALTER TABLE public.vehicle_check_photos DROP CONSTRAINT IF EXISTS vehicle_check_photos_side_check;
ALTER TABLE public.vehicle_check_photos ADD CONSTRAINT vehicle_check_photos_side_check
  CHECK (side IN ('front','rear','left','right','interior_front','interior_cargo','dashboard','klep','koelunit'));