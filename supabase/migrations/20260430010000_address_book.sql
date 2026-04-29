-- Tenant-breed adresboek voor laad- en losadressen.
-- Duplicaten worden voorkomen via normalized_key:
-- country + zipcode + city + street + house_number + suffix.

CREATE TABLE IF NOT EXISTS public.address_book (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  label text NOT NULL,
  company_name text,
  address text NOT NULL,
  street text NOT NULL,
  house_number text NOT NULL DEFAULT '',
  house_number_suffix text NOT NULL DEFAULT '',
  zipcode text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT 'NL',
  lat double precision,
  lng double precision,
  coords_manual boolean NOT NULL DEFAULT false,
  location_type text NOT NULL DEFAULT 'both',
  notes text,
  time_window_start text,
  time_window_end text,
  usage_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  normalized_key text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT address_book_location_type_chk
    CHECK (location_type = ANY (ARRAY['pickup'::text, 'delivery'::text, 'both'::text])),
  CONSTRAINT address_book_time_window_start_chk
    CHECK (time_window_start IS NULL OR time_window_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT address_book_time_window_end_chk
    CHECK (time_window_end IS NULL OR time_window_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);

CREATE UNIQUE INDEX IF NOT EXISTS address_book_tenant_normalized_key_uniq
  ON public.address_book (tenant_id, normalized_key);

CREATE INDEX IF NOT EXISTS idx_address_book_tenant_label
  ON public.address_book (tenant_id, lower(label));

CREATE INDEX IF NOT EXISTS idx_address_book_tenant_city
  ON public.address_book (tenant_id, lower(city));

DROP TRIGGER IF EXISTS update_address_book_updated_at ON public.address_book;
CREATE TRIGGER update_address_book_updated_at
  BEFORE UPDATE ON public.address_book
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.address_book ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation: address_book SELECT" ON public.address_book;
CREATE POLICY "Tenant isolation: address_book SELECT"
  ON public.address_book
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "Tenant isolation: address_book INSERT" ON public.address_book;
CREATE POLICY "Tenant isolation: address_book INSERT"
  ON public.address_book
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "Tenant isolation: address_book UPDATE" ON public.address_book;
CREATE POLICY "Tenant isolation: address_book UPDATE"
  ON public.address_book
  FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "Tenant isolation: address_book DELETE" ON public.address_book;
CREATE POLICY "Tenant isolation: address_book DELETE"
  ON public.address_book
  FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id());

GRANT ALL ON TABLE public.address_book TO authenticated;
GRANT ALL ON TABLE public.address_book TO service_role;

COMMENT ON TABLE public.address_book IS
  'Tenant-breed adresboek voor laad-/losadressen met duplicate-preventie op normalized_key.';
COMMENT ON COLUMN public.address_book.normalized_key IS
  'Genormaliseerde adresidentiteit: country|zipcode|city|street|house_number|suffix.';
