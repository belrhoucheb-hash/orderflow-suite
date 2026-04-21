-- ══════════════════════════════════════════════════════════════════════════
-- Sprint 4. Audit-trail en vrije notities voor klanten.
--
-- Waarom:
--   Gebruikers willen context kunnen vastleggen over een klantrelatie
--   (notities) en willen kunnen zien wie wat wanneer gewijzigd heeft
--   (audit-trail). Zonder deze twee voelt klantbeheer als een zwarte doos
--   en gaan relevante detail-afspraken verloren in losse mailtjes.
--
-- Scope:
--   Deze migratie is bewust klein en beperkt tot clients. Een generiek
--   audit-systeem (orders, drivers, vehicles) kan later volgen zodra de
--   aanpak zich bewezen heeft. Daarom een dedicated tabel in plaats van
--   een polymorfe log.
-- ══════════════════════════════════════════════════════════════════════════

-- ─── 1. Notities-kolom op clients ────────────────────────────────────
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN public.clients.notes IS
  'Vrije notitie over de klantrelatie (afspraken, aandachtspunten, context). Wordt auto-opgeslagen vanuit het klant-detailpaneel en gelogd in client_audit_log.';

-- ─── 2. Audit-log tabel ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_audit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id  UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES auth.users(id),
  user_name  TEXT,
  field      TEXT NOT NULL,
  old_value  JSONB,
  new_value  JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.client_audit_log IS
  'Onveranderlijke audit-trail van wijzigingen aan klanten (velden, contacten, notities). Eén rij per veld-wijziging.';
COMMENT ON COLUMN public.client_audit_log.field IS
  'Kolomnaam voor directe veld-wijzigingen, of event-tag (bv. contact.created, note.updated) voor handmatige events.';
COMMENT ON COLUMN public.client_audit_log.user_name IS
  'Snapshot van de display-naam ten tijde van het event, zodat de log leesbaar blijft als users later hernoemen of vertrekken.';

CREATE INDEX IF NOT EXISTS idx_client_audit_log_client_created
  ON public.client_audit_log (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_audit_log_tenant
  ON public.client_audit_log (tenant_id);

-- ─── 3. RLS ──────────────────────────────────────────────────────────
ALTER TABLE public.client_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation: client_audit_log SELECT" ON public.client_audit_log;
CREATE POLICY "Tenant isolation: client_audit_log SELECT"
  ON public.client_audit_log
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS "Tenant isolation: client_audit_log INSERT" ON public.client_audit_log;
CREATE POLICY "Tenant isolation: client_audit_log INSERT"
  ON public.client_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));

-- Immutable: geen UPDATE of DELETE policies. Een log die herschreven kan
-- worden is geen audit-trail.

DROP POLICY IF EXISTS "Service role: client_audit_log" ON public.client_audit_log;
CREATE POLICY "Service role: client_audit_log"
  ON public.client_audit_log
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

GRANT SELECT, INSERT ON TABLE public.client_audit_log TO authenticated;
GRANT ALL ON TABLE public.client_audit_log TO service_role;

-- ─── 4. Helper-functie voor handmatige events ────────────────────────
CREATE OR REPLACE FUNCTION public.log_client_audit(
  p_client_id UUID,
  p_field     TEXT,
  p_old       JSONB,
  p_new       JSONB
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_user_id   UUID;
  v_user_name TEXT;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM public.clients WHERE id = p_client_id;
  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  v_user_id := auth.uid();

  IF v_user_id IS NOT NULL THEN
    SELECT display_name INTO v_user_name
      FROM public.profiles
      WHERE user_id = v_user_id
      LIMIT 1;
  END IF;

  INSERT INTO public.client_audit_log (
    tenant_id, client_id, user_id, user_name, field, old_value, new_value
  ) VALUES (
    v_tenant_id, p_client_id, v_user_id, v_user_name, p_field, p_old, p_new
  );
END;
$$;

COMMENT ON FUNCTION public.log_client_audit(UUID, TEXT, JSONB, JSONB) IS
  'Registreer een handmatig audit-event op een klant (bv. contact aangemaakt, notitie gewijzigd). Pakt tenant en user automatisch.';

GRANT EXECUTE ON FUNCTION public.log_client_audit(UUID, TEXT, JSONB, JSONB) TO authenticated;

-- ─── 5. Trigger-functie voor kolom-wijzigingen ───────────────────────
-- Whitelist van gelogde velden. Niet alle kolommen (created_at, updated_at
-- en coordinaat-boekhouding maken veel ruis, die laten we weg).
CREATE OR REPLACE FUNCTION public.audit_clients_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_user_name TEXT;
  v_field     TEXT;
  v_fields    TEXT[] := ARRAY[
    'name', 'kvk_number', 'btw_number', 'email', 'phone',
    'contact_person', 'payment_terms', 'is_active', 'notes',
    'billing_email',
    'address', 'street', 'city', 'zipcode',
    'billing_address', 'billing_street', 'billing_city', 'billing_zipcode',
    'shipping_address', 'shipping_street', 'shipping_city', 'shipping_zipcode'
  ];
  v_old JSONB;
  v_new JSONB;
BEGIN
  IF v_user_id IS NOT NULL THEN
    SELECT display_name INTO v_user_name
      FROM public.profiles
      WHERE user_id = v_user_id
      LIMIT 1;
  END IF;

  FOREACH v_field IN ARRAY v_fields LOOP
    v_old := to_jsonb(row_to_json(OLD.*)) -> v_field;
    v_new := to_jsonb(row_to_json(NEW.*)) -> v_field;

    IF v_old IS DISTINCT FROM v_new THEN
      INSERT INTO public.client_audit_log (
        tenant_id, client_id, user_id, user_name, field, old_value, new_value
      ) VALUES (
        NEW.tenant_id, NEW.id, v_user_id, v_user_name, v_field, v_old, v_new
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.audit_clients_changes() IS
  'AFTER UPDATE trigger op clients: logt per gewijzigd veld uit de whitelist één rij in client_audit_log.';

-- Trigger idempotent koppelen (eerst droppen, dan opnieuw aanmaken).
DROP TRIGGER IF EXISTS trg_audit_clients_changes ON public.clients;
CREATE TRIGGER trg_audit_clients_changes
  AFTER UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_clients_changes();

-- ─── ROLLBACK ────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS trg_audit_clients_changes ON public.clients;
-- DROP FUNCTION IF EXISTS public.audit_clients_changes();
-- DROP FUNCTION IF EXISTS public.log_client_audit(UUID, TEXT, JSONB, JSONB);
-- DROP TABLE IF EXISTS public.client_audit_log;
-- ALTER TABLE public.clients DROP COLUMN IF EXISTS notes;
