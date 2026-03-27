
-- Extend vehicles table with additional fields
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS build_year integer,
  ADD COLUMN IF NOT EXISTS cargo_length_cm integer,
  ADD COLUMN IF NOT EXISTS cargo_width_cm integer,
  ADD COLUMN IF NOT EXISTS cargo_height_cm integer,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'beschikbaar',
  ADD COLUMN IF NOT EXISTS assigned_driver text,
  ADD COLUMN IF NOT EXISTS fuel_consumption numeric;

-- Vehicle documents (APK, insurance, ADR, tachograph)
CREATE TABLE public.vehicle_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  expiry_date date,
  file_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read vehicle_documents" ON public.vehicle_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert vehicle_documents" ON public.vehicle_documents FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update vehicle_documents" ON public.vehicle_documents FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete vehicle_documents" ON public.vehicle_documents FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- Vehicle maintenance log
CREATE TABLE public.vehicle_maintenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  maintenance_type text NOT NULL DEFAULT 'regulier',
  description text,
  mileage_km integer,
  scheduled_date date,
  completed_date date,
  cost numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_maintenance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read vehicle_maintenance" ON public.vehicle_maintenance FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert vehicle_maintenance" ON public.vehicle_maintenance FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update vehicle_maintenance" ON public.vehicle_maintenance FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete vehicle_maintenance" ON public.vehicle_maintenance FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- Vehicle availability blocks
CREATE TABLE public.vehicle_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  date date NOT NULL,
  status text NOT NULL DEFAULT 'beschikbaar',
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read vehicle_availability" ON public.vehicle_availability FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert vehicle_availability" ON public.vehicle_availability FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update vehicle_availability" ON public.vehicle_availability FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete vehicle_availability" ON public.vehicle_availability FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);
