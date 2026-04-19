CREATE TABLE IF NOT EXISTS public.vehicle_positions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  vehicle_id UUID,
  driver_id UUID,
  trip_id UUID,
  lat NUMERIC(10,7) NOT NULL,
  lng NUMERIC(10,7) NOT NULL,
  heading NUMERIC(5,1),
  speed NUMERIC(6,2),
  accuracy NUMERIC(6,1),
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vehicle_positions_trip ON public.vehicle_positions(trip_id);
CREATE INDEX idx_vehicle_positions_vehicle ON public.vehicle_positions(vehicle_id);
CREATE INDEX idx_vehicle_positions_time ON public.vehicle_positions(recorded_at DESC);

ALTER TABLE public.vehicle_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read vehicle_positions" ON public.vehicle_positions FOR SELECT USING (true);
CREATE POLICY "Anyone can insert vehicle_positions" ON public.vehicle_positions FOR INSERT WITH CHECK (true);
