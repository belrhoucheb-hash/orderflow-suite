-- Klanten data-model opschoning:
-- 1) primary_contact_id op clients als enkele bron van waarheid voor primair contact
-- 2) back-fill bestaande rijen vanuit client_contacts
-- 3) partial unique index op (tenant_id, kvk_number) om duplicaten te voorkomen
-- 4) deprecation comments op contact_person, email, phone (niet droppen deze sprint)

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS primary_contact_id uuid
    REFERENCES public.client_contacts(id) ON DELETE SET NULL;

-- Back-fill: voor elke client zonder primary_contact_id, pak bij voorkeur het
-- actieve primary-contact, anders het oudste contact van die klant.
WITH ranked AS (
  SELECT
    cc.id,
    cc.client_id,
    ROW_NUMBER() OVER (
      PARTITION BY cc.client_id
      ORDER BY
        CASE WHEN cc.role = 'primary' AND cc.is_active THEN 0 ELSE 1 END,
        cc.created_at ASC
    ) AS rn
  FROM public.client_contacts cc
)
UPDATE public.clients c
SET primary_contact_id = r.id
FROM ranked r
WHERE r.client_id = c.id
  AND r.rn = 1
  AND c.primary_contact_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_clients_primary_contact
  ON public.clients (primary_contact_id);

-- Voorkom dubbele KvK-nummers per tenant, maar laat meerdere klanten zonder
-- KvK (NULL of lege string) toe.
CREATE UNIQUE INDEX IF NOT EXISTS clients_tenant_kvk_unique
  ON public.clients (tenant_id, kvk_number)
  WHERE kvk_number IS NOT NULL AND kvk_number <> '';

COMMENT ON COLUMN public.clients.primary_contact_id IS
  'FK naar client_contacts. Enkele bron van waarheid voor het primaire contact van een klant.';

COMMENT ON COLUMN public.clients.contact_person IS
  'Deprecated, gebruik primary_contact_id -> client_contacts. Blijft bestaan voor backwards-compat van bestaande queries.';
COMMENT ON COLUMN public.clients.email IS
  'Deprecated, gebruik primary_contact_id -> client_contacts. Blijft bestaan voor backwards-compat van bestaande queries.';
COMMENT ON COLUMN public.clients.phone IS
  'Deprecated, gebruik primary_contact_id -> client_contacts. Blijft bestaan voor backwards-compat van bestaande queries.';

-- Rollback:
--   DROP INDEX IF EXISTS public.clients_tenant_kvk_unique;
--   DROP INDEX IF EXISTS public.idx_clients_primary_contact;
--   ALTER TABLE public.clients DROP COLUMN IF EXISTS primary_contact_id;
--   COMMENT ON COLUMN public.clients.contact_person IS NULL;
--   COMMENT ON COLUMN public.clients.email IS NULL;
--   COMMENT ON COLUMN public.clients.phone IS NULL;
