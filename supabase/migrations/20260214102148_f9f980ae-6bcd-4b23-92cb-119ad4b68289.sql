
CREATE TABLE public.vehicles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  plate text NOT NULL,
  type text NOT NULL,
  capacity_kg integer NOT NULL DEFAULT 0,
  capacity_pallets integer NOT NULL DEFAULT 0,
  features text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vehicles are publicly readable" ON public.vehicles FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert vehicles" ON public.vehicles FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update vehicles" ON public.vehicles FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete vehicles" ON public.vehicles FOR DELETE USING (auth.uid() IS NOT NULL);

CREATE TRIGGER update_vehicles_updated_at
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.vehicles (code, name, plate, type, capacity_kg, capacity_pallets, features) VALUES
  ('fv1', 'Busje 01', 'NL-BJ-01', 'Sneltransport', 800, 2, '{}'),
  ('fv2', 'Bakwagen 02', 'NL-BK-02', 'Distributie', 5000, 12, '{"LAADKLEP"}'),
  ('fv3', 'Koelwagen 03', 'NL-KW-03', 'Koeltransport', 12000, 18, '{"KOELING"}'),
  ('fv4', 'Trekker 04', 'NL-TK-04', 'Internationaal', 24000, 33, '{"ADR"}');
