-- Extend clients table with additional fields
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS contact_person text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS kvk_number text,
  ADD COLUMN IF NOT EXISTS btw_number text,
  ADD COLUMN IF NOT EXISTS payment_terms integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Client locations table
CREATE TABLE IF NOT EXISTS public.client_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  label text NOT NULL,
  address text NOT NULL,
  zipcode text,
  city text,
  country text DEFAULT 'NL',
  location_type text NOT NULL DEFAULT 'pickup',
  time_window_start text,
  time_window_end text,
  max_vehicle_length text,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.client_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read client_locations" ON public.client_locations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert client_locations" ON public.client_locations FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update client_locations" ON public.client_locations FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete client_locations" ON public.client_locations FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- Client rates table
CREATE TABLE IF NOT EXISTS public.client_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  rate_type text NOT NULL,
  description text,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  currency text DEFAULT 'EUR',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.client_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read client_rates" ON public.client_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert client_rates" ON public.client_rates FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update client_rates" ON public.client_rates FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete client_rates" ON public.client_rates FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);