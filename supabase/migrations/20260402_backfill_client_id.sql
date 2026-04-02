-- Backfill client_id for existing orders that have a client_name but no client_id
UPDATE orders o
SET client_id = c.id
FROM clients c
WHERE o.client_id IS NULL
  AND o.client_name IS NOT NULL
  AND LOWER(c.name) = LOWER(o.client_name);
