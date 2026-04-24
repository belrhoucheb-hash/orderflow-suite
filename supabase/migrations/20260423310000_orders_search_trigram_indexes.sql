-- Trigram-indexen zodat ilike '%search%' in de orderlijst-UI niet
-- terugvalt op sequential scan. Nodig voor de zoekbalk op Orders:
-- client_name / pickup_address / delivery_address.
--
-- pg_trgm is een standaard Postgres-extensie die in de Supabase managed
-- omgeving beschikbaar is. GIN-index op trigrams levert sub-ms lookup
-- voor substring-zoeken, ook bij miljoenen rijen.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_orders_client_name_trgm
  ON public.orders USING gin (client_name gin_trgm_ops)
  WHERE client_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_pickup_address_trgm
  ON public.orders USING gin (pickup_address gin_trgm_ops)
  WHERE pickup_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_delivery_address_trgm
  ON public.orders USING gin (delivery_address gin_trgm_ops)
  WHERE delivery_address IS NOT NULL;
