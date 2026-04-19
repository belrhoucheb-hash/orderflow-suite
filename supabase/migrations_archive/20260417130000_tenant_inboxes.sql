-- ============================================================
-- Tenant Inboxes, per-klant IMAP-koppeling met Vault-encryptie
-- ============================================================
--
-- Vervangt de single-tenant env-IMAP in poll-inbox door een multi-tenant
-- model. Wachtwoorden worden nooit plaintext opgeslagen, maar via
-- supabase_vault versleuteld. Alleen SECURITY DEFINER helpers kunnen
-- decrypten, en die zijn gereserveerd voor service_role (edge functions).
--
-- Design:
--   tenant_inboxes           - config + referentie naar vault secret
--   tenant_inbox_audit       - wie, wat, wanneer (zonder waarde)
--   set_tenant_inbox_password(inbox_id, pw)   - encrypt + store id
--   get_tenant_inbox_password(inbox_id)       - decrypt, service_role only
-- ============================================================

CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- ─── 1. tenant_inboxes ──────────────────────────────────────

CREATE TABLE public.tenant_inboxes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  label                 text NOT NULL,
  provider              text NOT NULL DEFAULT 'imap' CHECK (provider IN ('imap')),
  host                  text NOT NULL,
  port                  integer NOT NULL DEFAULT 993 CHECK (port BETWEEN 1 AND 65535),
  username              text NOT NULL,
  password_secret_id    uuid,
  folder                text NOT NULL DEFAULT 'INBOX',
  is_active             boolean NOT NULL DEFAULT true,
  last_uid              bigint,
  last_polled_at        timestamptz,
  last_error            text,
  consecutive_failures  integer NOT NULL DEFAULT 0,
  next_poll_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, label)
);

COMMENT ON TABLE public.tenant_inboxes IS
  'Per-tenant IMAP inbox configuratie. Wachtwoord via password_secret_id -> vault.secrets.';
COMMENT ON COLUMN public.tenant_inboxes.password_secret_id IS
  'UUID van vault.secrets rij. NULL betekent: nog geen wachtwoord ingesteld (inactief).';
COMMENT ON COLUMN public.tenant_inboxes.next_poll_at IS
  'Backoff: poll-inbox slaat inboxes met next_poll_at > now() over.';

ALTER TABLE public.tenant_inboxes ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_tenant_inboxes_tenant       ON public.tenant_inboxes(tenant_id);
CREATE INDEX idx_tenant_inboxes_active_poll  ON public.tenant_inboxes(is_active, next_poll_at)
  WHERE is_active;

CREATE TRIGGER update_tenant_inboxes_updated_at
  BEFORE UPDATE ON public.tenant_inboxes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: authenticated leden van de tenant zien eigen inboxes (zonder wachtwoord).
CREATE POLICY "Tenant isolation: tenant_inboxes ALL"
  ON public.tenant_inboxes FOR ALL TO authenticated
  USING (public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.user_has_tenant_access(tenant_id));

CREATE POLICY "Service role: tenant_inboxes"
  ON public.tenant_inboxes FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ─── 2. tenant_inbox_audit ──────────────────────────────────

CREATE TABLE public.tenant_inbox_audit (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inbox_id    uuid REFERENCES public.tenant_inboxes(id) ON DELETE SET NULL,
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action      text NOT NULL CHECK (action IN (
    'created', 'updated', 'password_changed', 'activated', 'deactivated', 'deleted', 'tested'
  )),
  detail      jsonb DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tenant_inbox_audit IS
  'Audit log voor alle mutaties op tenant_inboxes. Wachtwoord wordt nooit gelogd, alleen action=password_changed.';

CREATE INDEX idx_tenant_inbox_audit_inbox  ON public.tenant_inbox_audit(inbox_id, created_at DESC);
CREATE INDEX idx_tenant_inbox_audit_tenant ON public.tenant_inbox_audit(tenant_id, created_at DESC);

ALTER TABLE public.tenant_inbox_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation: tenant_inbox_audit SELECT"
  ON public.tenant_inbox_audit FOR SELECT TO authenticated
  USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "Service role: tenant_inbox_audit"
  ON public.tenant_inbox_audit FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ─── 3. Password helpers (SECURITY DEFINER, service_role only) ──

-- set_tenant_inbox_password: versleutelt in vault, slaat secret_id op.
-- Bij bestaande secret update; bij nieuwe creëert en linkt.
CREATE OR REPLACE FUNCTION public.set_tenant_inbox_password(
  p_inbox_id uuid,
  p_password text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_existing_secret_id uuid;
  v_new_secret_id uuid;
  v_secret_name text;
BEGIN
  IF p_password IS NULL OR length(p_password) = 0 THEN
    RAISE EXCEPTION 'Password mag niet leeg zijn';
  END IF;

  SELECT password_secret_id INTO v_existing_secret_id
    FROM public.tenant_inboxes WHERE id = p_inbox_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant_inbox % bestaat niet', p_inbox_id;
  END IF;

  v_secret_name := 'tenant_inbox_' || p_inbox_id::text;

  IF v_existing_secret_id IS NOT NULL THEN
    -- Update in place, behoudt secret_id
    PERFORM vault.update_secret(v_existing_secret_id, p_password, v_secret_name, 'IMAP wachtwoord');
  ELSE
    -- Nieuw, link id in tenant_inboxes
    v_new_secret_id := vault.create_secret(p_password, v_secret_name, 'IMAP wachtwoord');
    UPDATE public.tenant_inboxes
       SET password_secret_id = v_new_secret_id
     WHERE id = p_inbox_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_tenant_inbox_password(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_tenant_inbox_password(uuid, text) TO service_role;


-- get_tenant_inbox_password: decrypt, alleen voor service_role.
CREATE OR REPLACE FUNCTION public.get_tenant_inbox_password(p_inbox_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id uuid;
  v_password text;
BEGIN
  SELECT password_secret_id INTO v_secret_id
    FROM public.tenant_inboxes WHERE id = p_inbox_id;

  IF v_secret_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO v_password
    FROM vault.decrypted_secrets WHERE id = v_secret_id;

  RETURN v_password;
END;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_inbox_password(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tenant_inbox_password(uuid) TO service_role;


-- ─── 4. Cleanup trigger: vault secret volgt inbox-delete ─────

CREATE OR REPLACE FUNCTION public.cleanup_tenant_inbox_secret()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
  IF OLD.password_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = OLD.password_secret_id;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER cleanup_tenant_inbox_secret_trg
  BEFORE DELETE ON public.tenant_inboxes
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_tenant_inbox_secret();
