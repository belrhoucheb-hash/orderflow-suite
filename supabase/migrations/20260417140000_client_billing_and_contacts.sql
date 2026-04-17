-- ──────────────────────────────────────────────────────────────────────────
-- §26 Client billing-velden en client_contacts tabel
--
-- Factuur/POD-mail (Sprint TA-06, PD-03) moet richten op stamgegevens,
-- niet op opdracht-contactpersoon. Daarom expliciete factuur- en
-- post-adressen op clients, plus een contacten-tabel met max één actieve
-- primair en één actieve backup per klant. Bestaande clients.contact_person
-- blijft intact voor backwards-compat, wordt in een latere sprint opgeruimd.
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS billing_email TEXT,
  ADD COLUMN IF NOT EXISTS billing_same_as_main BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS billing_address TEXT,
  ADD COLUMN IF NOT EXISTS billing_zipcode TEXT,
  ADD COLUMN IF NOT EXISTS billing_city TEXT,
  ADD COLUMN IF NOT EXISTS billing_country TEXT,
  ADD COLUMN IF NOT EXISTS shipping_same_as_main BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS shipping_address TEXT,
  ADD COLUMN IF NOT EXISTS shipping_zipcode TEXT,
  ADD COLUMN IF NOT EXISTS shipping_city TEXT,
  ADD COLUMN IF NOT EXISTS shipping_country TEXT;

COMMENT ON COLUMN public.clients.billing_email IS
  'Apart factuur-mailadres. Leeg betekent: gebruik clients.email.';

COMMENT ON COLUMN public.clients.billing_same_as_main IS
  'Als true, facturatie gebruikt clients.address; de billing_* velden worden genegeerd.';

COMMENT ON COLUMN public.clients.shipping_same_as_main IS
  'Als true, postzendingen (facturen op papier, docs) gebruiken clients.address.';

CREATE TABLE IF NOT EXISTS public.client_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('primary', 'backup', 'other')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.client_contacts IS
  'Contactpersonen per klant. Max één actieve primary en één actieve backup per client_id, afgedwongen via partial unique indexes.';

CREATE INDEX IF NOT EXISTS idx_client_contacts_tenant_client
  ON public.client_contacts (tenant_id, client_id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_client_contacts_primary_per_client
  ON public.client_contacts (client_id)
  WHERE role = 'primary' AND is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_client_contacts_backup_per_client
  ON public.client_contacts (client_id)
  WHERE role = 'backup' AND is_active = true;

DROP TRIGGER IF EXISTS update_client_contacts_updated_at ON public.client_contacts;
CREATE TRIGGER update_client_contacts_updated_at
BEFORE UPDATE ON public.client_contacts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation for client_contacts" ON public.client_contacts;
CREATE POLICY "Tenant isolation for client_contacts"
  ON public.client_contacts FOR ALL
  TO authenticated
  USING (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()));

DROP POLICY IF EXISTS "Service role full access on client_contacts" ON public.client_contacts;
CREATE POLICY "Service role full access on client_contacts"
  ON public.client_contacts FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Backfill: bestaande clients.contact_person → primary contact
INSERT INTO public.client_contacts (tenant_id, client_id, name, email, phone, role)
SELECT tenant_id, id, contact_person, email, phone, 'primary'
FROM public.clients
WHERE contact_person IS NOT NULL
  AND trim(contact_person) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.client_contacts cc
    WHERE cc.client_id = clients.id AND cc.role = 'primary' AND cc.is_active = true
  );
