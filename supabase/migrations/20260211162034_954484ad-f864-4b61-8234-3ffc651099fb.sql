
-- Create clients table (address book)
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  zipcode TEXT,
  city TEXT,
  country TEXT NOT NULL DEFAULT 'NL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on clients
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Clients are readable by anyone (public address book)
CREATE POLICY "Clients are publicly readable"
  ON public.clients FOR SELECT
  USING (true);

-- Only authenticated users can insert/update/delete clients
CREATE POLICY "Authenticated users can insert clients"
  ON public.clients FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update clients"
  ON public.clients FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete clients"
  ON public.clients FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Create orders table
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number SERIAL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  source_email_from TEXT,
  source_email_subject TEXT,
  source_email_body TEXT,
  confidence_score INTEGER,
  transport_type TEXT,
  pickup_address TEXT,
  delivery_address TEXT,
  quantity INTEGER,
  unit TEXT,
  weight_kg INTEGER,
  is_weight_per_unit BOOLEAN NOT NULL DEFAULT false,
  dimensions TEXT,
  requirements TEXT[] DEFAULT '{}',
  client_name TEXT,
  received_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on orders
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Orders are readable by anyone (no auth yet, internal tool)
CREATE POLICY "Orders are publicly readable"
  ON public.orders FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert orders"
  ON public.orders FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update orders"
  ON public.orders FOR UPDATE
  USING (true);

CREATE POLICY "Anyone can delete orders"
  ON public.orders FOR DELETE
  USING (true);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
