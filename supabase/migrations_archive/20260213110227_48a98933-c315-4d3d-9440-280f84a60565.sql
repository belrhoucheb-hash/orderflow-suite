
-- Drop existing restrictive policies on clients
DROP POLICY IF EXISTS "Clients are publicly readable" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can insert clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can update clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can delete clients" ON public.clients;

-- Recreate as PERMISSIVE policies
CREATE POLICY "Clients are publicly readable"
ON public.clients FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can insert clients"
ON public.clients FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update clients"
ON public.clients FOR UPDATE
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete clients"
ON public.clients FOR DELETE
USING (auth.uid() IS NOT NULL);

-- Also fix orders policies (same issue)
DROP POLICY IF EXISTS "Orders are publicly readable" ON public.orders;
DROP POLICY IF EXISTS "Anyone can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Anyone can update orders" ON public.orders;
DROP POLICY IF EXISTS "Anyone can delete orders" ON public.orders;

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
