-- Gestructureerde incident-vastlegging vanuit het chauffeursportaal.
-- Vervangt de eerdere vrije-tekst flow waarbij een chauffeur alleen een MISLUKT-
-- status kon zetten zonder categorie of bewijs. Eén incident hoort bij één stop.

CREATE TABLE IF NOT EXISTS public.stop_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  trip_stop_id uuid NOT NULL REFERENCES public.trip_stops(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  category text NOT NULL,
  photo_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stop_incidents_category_check CHECK (
    category = ANY (ARRAY['SCHADE','GEWEIGERD','GEEN_TOEGANG','ONBEREIKBAAR'])
  )
);

CREATE INDEX IF NOT EXISTS idx_stop_incidents_tenant
  ON public.stop_incidents (tenant_id);
CREATE INDEX IF NOT EXISTS idx_stop_incidents_trip_stop
  ON public.stop_incidents (trip_stop_id);
CREATE INDEX IF NOT EXISTS idx_stop_incidents_order
  ON public.stop_incidents (order_id);

ALTER TABLE public.stop_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stop_incidents tenant select"
  ON public.stop_incidents
  FOR SELECT
  TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "stop_incidents tenant insert"
  ON public.stop_incidents
  FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "stop_incidents tenant update"
  ON public.stop_incidents
  FOR UPDATE
  TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "stop_incidents service role"
  ON public.stop_incidents
  TO service_role
  USING (true)
  WITH CHECK (true);
