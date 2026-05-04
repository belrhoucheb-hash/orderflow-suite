-- Connector-platform diepte: multi-environment, OAuth-token-expiry, event-policies.
--
-- Wijzigingen op integration_credentials:
--   * environment kolom (test|live), default 'live' zodat bestaande rijen blijven werken.
--   * expires_at kolom voor OAuth-tokens, optioneel.
--   * Unique-constraint vervangen: van (tenant_id, provider) naar
--     (tenant_id, provider, environment) zodat dezelfde provider zowel een
--     test- als live-set credentials kan hebben.
--
-- Nieuwe tabel connector_event_policies om per (tenant, provider, event_type)
-- een aan/uit-vlag te zetten. Edge-functies (zie runtime.ts TODO) moeten dit
-- respecteren bij dispatchen van push-events.
--
-- De bestaande RPC's get_integration_credentials_ui /
-- save_integration_credentials_secure worden uitgebreid met overloads die
-- environment ondersteunen. De zonder-environment-varianten blijven werken en
-- nemen 'live' aan als default.

BEGIN;

-- ─── 1. integration_credentials: environment + expires_at ─────────────

ALTER TABLE public.integration_credentials
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'live';

ALTER TABLE public.integration_credentials
  DROP CONSTRAINT IF EXISTS integration_credentials_environment_chk;

ALTER TABLE public.integration_credentials
  ADD CONSTRAINT integration_credentials_environment_chk
  CHECK (environment IN ('test', 'live'));

ALTER TABLE public.integration_credentials
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

COMMENT ON COLUMN public.integration_credentials.environment IS
  'Test- of live-credential-set per provider, default live voor backwards-compat.';
COMMENT ON COLUMN public.integration_credentials.expires_at IS
  'Vervaltijd van het huidige access/refresh-token (alleen relevant voor OAuth-providers).';

-- Unique-constraint upgraden naar (tenant_id, provider, environment).
ALTER TABLE public.integration_credentials
  DROP CONSTRAINT IF EXISTS integration_credentials_tenant_provider_uniq;

ALTER TABLE public.integration_credentials
  DROP CONSTRAINT IF EXISTS integration_credentials_tenant_provider_env_uniq;

ALTER TABLE public.integration_credentials
  ADD CONSTRAINT integration_credentials_tenant_provider_env_uniq
  UNIQUE (tenant_id, provider, environment);

-- ─── 2. connector_event_policies ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.connector_event_policies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  provider    TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID,
  CONSTRAINT connector_event_policies_uniq UNIQUE (tenant_id, provider, event_type)
);

CREATE INDEX IF NOT EXISTS idx_connector_event_policies_tenant_provider
  ON public.connector_event_policies (tenant_id, provider);

COMMENT ON TABLE public.connector_event_policies IS
  'Per-tenant aan/uit-vlag voor connector-events. Een ontbrekende rij betekent dat de event-default uit de catalog telt (aan).';

ALTER TABLE public.connector_event_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "connector_event_policies: tenant admin select" ON public.connector_event_policies;
CREATE POLICY "connector_event_policies: tenant admin select"
  ON public.connector_event_policies
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND public.current_user_is_tenant_admin(tenant_id)
  );

DROP POLICY IF EXISTS "connector_event_policies: tenant admin insert" ON public.connector_event_policies;
CREATE POLICY "connector_event_policies: tenant admin insert"
  ON public.connector_event_policies
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND public.current_user_is_tenant_admin(tenant_id)
  );

DROP POLICY IF EXISTS "connector_event_policies: tenant admin update" ON public.connector_event_policies;
CREATE POLICY "connector_event_policies: tenant admin update"
  ON public.connector_event_policies
  FOR UPDATE TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND public.current_user_is_tenant_admin(tenant_id)
  );

DROP POLICY IF EXISTS "connector_event_policies: tenant admin delete" ON public.connector_event_policies;
CREATE POLICY "connector_event_policies: tenant admin delete"
  ON public.connector_event_policies
  FOR DELETE TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND public.current_user_is_tenant_admin(tenant_id)
  );

DROP POLICY IF EXISTS "connector_event_policies: service_role full" ON public.connector_event_policies;
CREATE POLICY "connector_event_policies: service_role full"
  ON public.connector_event_policies
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.connector_event_policies TO authenticated;
GRANT ALL ON public.connector_event_policies TO service_role;

-- updated_at auto-refresh hergebruikt het bestaande tg_integration_credentials_touch-patroon.
CREATE OR REPLACE FUNCTION public.tg_connector_event_policies_touch()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS connector_event_policies_touch ON public.connector_event_policies;
CREATE TRIGGER connector_event_policies_touch
  BEFORE UPDATE ON public.connector_event_policies
  FOR EACH ROW EXECUTE FUNCTION public.tg_connector_event_policies_touch();

-- ─── 3. RPC's: environment-aware overloads ───────────────────────────

CREATE OR REPLACE FUNCTION public.get_integration_credentials_runtime(
  p_tenant_id uuid,
  p_provider text,
  p_environment text
)
RETURNS TABLE(enabled boolean, credentials jsonb, environment text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $$
DECLARE
  v_env text := COALESCE(NULLIF(p_environment, ''), 'live');
  v_row public.integration_credentials%ROWTYPE;
  v_credentials jsonb := '{}'::jsonb;
  v_key text;
  v_secret_id uuid;
  v_secret text;
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF p_tenant_id IS NULL OR p_tenant_id <> public.current_tenant_id() THEN
      RAISE EXCEPTION 'Geen toegang tot deze tenant';
    END IF;
    IF NOT public.current_user_is_tenant_admin(p_tenant_id) THEN
      RAISE EXCEPTION 'Alleen owner/admin mag credentials ophalen';
    END IF;
  END IF;

  SELECT *
  INTO v_row
  FROM public.integration_credentials
  WHERE tenant_id = p_tenant_id
    AND provider = p_provider
    AND environment = v_env;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, '{}'::jsonb, v_env, NULL::timestamptz;
    RETURN;
  END IF;

  v_credentials := COALESCE(v_row.credentials, '{}'::jsonb);

  FOREACH v_key IN ARRAY public.integration_secret_keys(p_provider) LOOP
    IF v_credentials ? (v_key || 'SecretId') THEN
      v_secret_id := NULLIF(v_credentials ->> (v_key || 'SecretId'), '')::uuid;
      IF v_secret_id IS NOT NULL THEN
        SELECT decrypted_secret
        INTO v_secret
        FROM vault.decrypted_secrets
        WHERE id = v_secret_id;

        IF v_secret IS NOT NULL THEN
          v_credentials := jsonb_set(v_credentials, ARRAY[v_key], to_jsonb(v_secret), true);
        END IF;
      END IF;
      v_credentials := v_credentials - (v_key || 'SecretId');
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_row.enabled, v_credentials, v_row.environment, v_row.expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_integration_credentials_ui(
  p_provider text,
  p_environment text
)
RETURNS TABLE(enabled boolean, credentials jsonb, environment text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id uuid := public.current_tenant_id();
  v_env text := COALESCE(NULLIF(p_environment, ''), 'live');
  v_enabled boolean;
  v_credentials jsonb := '{}'::jsonb;
  v_expires_at timestamptz;
  v_key text;
  v_has_secret boolean := false;
BEGIN
  IF v_tenant_id IS NULL OR NOT public.current_user_is_tenant_admin(v_tenant_id) THEN
    RAISE EXCEPTION 'Alleen owner/admin mag credentials beheren';
  END IF;

  SELECT runtime.enabled, runtime.credentials, runtime.expires_at
  INTO v_enabled, v_credentials, v_expires_at
  FROM public.get_integration_credentials_runtime(v_tenant_id, p_provider, v_env) runtime;

  v_credentials := COALESCE(v_credentials, '{}'::jsonb);

  FOREACH v_key IN ARRAY public.integration_secret_keys(p_provider) LOOP
    IF v_credentials ? v_key THEN
      v_has_secret := true;
      v_credentials := v_credentials - v_key;
    END IF;
  END LOOP;

  IF v_has_secret THEN
    v_credentials := jsonb_set(v_credentials, ARRAY['__hasStoredSecrets'], 'true'::jsonb, true);
  END IF;

  RETURN QUERY SELECT COALESCE(v_enabled, false), v_credentials, v_env, v_expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_integration_credentials_secure(
  p_provider text,
  p_enabled boolean,
  p_credentials jsonb,
  p_tenant_id uuid,
  p_environment text,
  p_expires_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $$
DECLARE
  v_tenant_id uuid := COALESCE(
    CASE
      WHEN auth.role() = 'service_role' THEN p_tenant_id
      ELSE public.current_tenant_id()
    END,
    public.current_tenant_id()
  );
  v_env text := COALESCE(NULLIF(p_environment, ''), 'live');
  v_existing jsonb := '{}'::jsonb;
  v_safe jsonb := COALESCE(p_credentials, '{}'::jsonb);
  v_key text;
  v_value text;
  v_secret_id uuid;
BEGIN
  IF auth.role() <> 'service_role'
    AND (v_tenant_id IS NULL OR NOT public.current_user_is_tenant_admin(v_tenant_id)) THEN
    RAISE EXCEPTION 'Alleen owner/admin mag credentials beheren';
  END IF;

  SELECT credentials
  INTO v_existing
  FROM public.integration_credentials
  WHERE tenant_id = v_tenant_id
    AND provider = p_provider
    AND environment = v_env;

  v_existing := COALESCE(v_existing, '{}'::jsonb);
  v_safe := v_safe - '__hasStoredSecrets';

  FOREACH v_key IN ARRAY public.integration_secret_keys(p_provider) LOOP
    v_value := NULLIF(BTRIM(COALESCE(p_credentials ->> v_key, '')), '');

    IF v_value IS NOT NULL THEN
      v_secret_id := NULLIF(v_existing ->> (v_key || 'SecretId'), '')::uuid;
      IF v_secret_id IS NOT NULL THEN
        PERFORM vault.update_secret(
          v_secret_id,
          v_value,
          format('integration:%s:%s:%s:%s', v_tenant_id, p_provider, v_env, v_key),
          format('Connector secret for %s/%s/%s', p_provider, v_env, v_key)
        );
      ELSE
        v_secret_id := vault.create_secret(
          v_value,
          format('integration:%s:%s:%s:%s', v_tenant_id, p_provider, v_env, v_key),
          format('Connector secret for %s/%s/%s', p_provider, v_env, v_key)
        );
      END IF;

      v_safe := v_safe - v_key;
      v_safe := jsonb_set(v_safe, ARRAY[v_key || 'SecretId'], to_jsonb(v_secret_id::text), true);
    ELSE
      v_safe := v_safe - v_key;
      IF v_existing ? (v_key || 'SecretId') THEN
        v_safe := jsonb_set(
          v_safe,
          ARRAY[v_key || 'SecretId'],
          v_existing -> (v_key || 'SecretId'),
          true
        );
      ELSE
        v_safe := v_safe - (v_key || 'SecretId');
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.integration_credentials (
    tenant_id,
    provider,
    environment,
    enabled,
    credentials,
    expires_at,
    updated_at,
    updated_by
  )
  VALUES (
    v_tenant_id,
    p_provider,
    v_env,
    COALESCE(p_enabled, false),
    v_safe,
    p_expires_at,
    NOW(),
    auth.uid()
  )
  ON CONFLICT (tenant_id, provider, environment)
  DO UPDATE
  SET enabled = EXCLUDED.enabled,
      credentials = EXCLUDED.credentials,
      expires_at = COALESCE(EXCLUDED.expires_at, public.integration_credentials.expires_at),
      updated_at = NOW(),
      updated_by = auth.uid();
END;
$$;

-- Backwards-compat: bestaande 4-arg signature delegeert naar de 6-arg versie.
CREATE OR REPLACE FUNCTION public.save_integration_credentials_secure(
  p_provider text,
  p_enabled boolean,
  p_credentials jsonb,
  p_tenant_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $$
BEGIN
  PERFORM public.save_integration_credentials_secure(
    p_provider,
    p_enabled,
    p_credentials,
    p_tenant_id,
    'live'::text,
    NULL::timestamptz
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_integration_credentials_secure(
  p_provider text,
  p_enabled boolean,
  p_credentials jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $$
BEGIN
  PERFORM public.save_integration_credentials_secure(
    p_provider,
    p_enabled,
    p_credentials,
    NULL::uuid,
    'live'::text,
    NULL::timestamptz
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_integration_credentials_runtime(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_integration_credentials_ui(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_integration_credentials_secure(text, boolean, jsonb, uuid, text, timestamptz) TO authenticated, service_role;

COMMIT;

-- --- ROLLBACK -------------------------------------------------------
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.save_integration_credentials_secure(text, boolean, jsonb, uuid, text, timestamptz);
-- DROP FUNCTION IF EXISTS public.get_integration_credentials_ui(text, text);
-- DROP FUNCTION IF EXISTS public.get_integration_credentials_runtime(uuid, text, text);
-- DROP TRIGGER IF EXISTS connector_event_policies_touch ON public.connector_event_policies;
-- DROP FUNCTION IF EXISTS public.tg_connector_event_policies_touch();
-- DROP TABLE IF EXISTS public.connector_event_policies;
-- ALTER TABLE public.integration_credentials DROP CONSTRAINT IF EXISTS integration_credentials_tenant_provider_env_uniq;
-- ALTER TABLE public.integration_credentials ADD CONSTRAINT integration_credentials_tenant_provider_uniq UNIQUE (tenant_id, provider);
-- ALTER TABLE public.integration_credentials DROP COLUMN IF EXISTS expires_at;
-- ALTER TABLE public.integration_credentials DROP CONSTRAINT IF EXISTS integration_credentials_environment_chk;
-- ALTER TABLE public.integration_credentials DROP COLUMN IF EXISTS environment;
-- COMMIT;
