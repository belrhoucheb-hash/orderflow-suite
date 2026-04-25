CREATE OR REPLACE FUNCTION public.current_user_is_tenant_admin(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_members tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id = auth.uid()
      AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
  );
$$;

CREATE OR REPLACE FUNCTION public.integration_secret_keys(p_provider text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_provider
    WHEN 'snelstart' THEN ARRAY['clientKey', 'subscriptionKey']::text[]
    WHEN 'exact_online' THEN ARRAY['clientSecret', 'accessToken', 'refreshToken']::text[]
    WHEN 'twinfield' THEN ARRAY['password']::text[]
    WHEN 'samsara' THEN ARRAY['apiKey']::text[]
    WHEN 'nostradamus' THEN ARRAY['apiToken']::text[]
    ELSE ARRAY[]::text[]
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_integration_credentials_runtime(
  p_tenant_id uuid,
  p_provider text
)
RETURNS TABLE(enabled boolean, credentials jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $$
DECLARE
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
    AND provider = p_provider;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, '{}'::jsonb;
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

  RETURN QUERY SELECT v_row.enabled, v_credentials;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_integration_credentials_ui(p_provider text)
RETURNS TABLE(enabled boolean, credentials jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id uuid := public.current_tenant_id();
  v_enabled boolean;
  v_credentials jsonb := '{}'::jsonb;
  v_key text;
  v_has_secret boolean := false;
BEGIN
  IF v_tenant_id IS NULL OR NOT public.current_user_is_tenant_admin(v_tenant_id) THEN
    RAISE EXCEPTION 'Alleen owner/admin mag credentials beheren';
  END IF;

  SELECT runtime.enabled, runtime.credentials
  INTO v_enabled, v_credentials
  FROM public.get_integration_credentials_runtime(v_tenant_id, p_provider) runtime;

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

  RETURN QUERY SELECT COALESCE(v_enabled, false), v_credentials;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_integration_credentials_secure(
  p_provider text,
  p_enabled boolean,
  p_credentials jsonb,
  p_tenant_id uuid DEFAULT NULL
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
    AND provider = p_provider;

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
          format('integration:%s:%s:%s', v_tenant_id, p_provider, v_key),
          format('Connector secret for %s/%s', p_provider, v_key)
        );
      ELSE
        v_secret_id := vault.create_secret(
          v_value,
          format('integration:%s:%s:%s', v_tenant_id, p_provider, v_key),
          format('Connector secret for %s/%s', p_provider, v_key)
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
    enabled,
    credentials,
    updated_at,
    updated_by
  )
  VALUES (
    v_tenant_id,
    p_provider,
    COALESCE(p_enabled, false),
    v_safe,
    NOW(),
    auth.uid()
  )
  ON CONFLICT (tenant_id, provider)
  DO UPDATE
  SET enabled = EXCLUDED.enabled,
      credentials = EXCLUDED.credentials,
      updated_at = NOW(),
      updated_by = auth.uid();
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
    NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sms_secret_keys()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY['twilioAuthToken', 'messageBirdApiKey']::text[];
$$;

CREATE OR REPLACE FUNCTION public.get_sms_settings_runtime(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $$
DECLARE
  v_settings jsonb := '{}'::jsonb;
  v_key text;
  v_secret_id uuid;
  v_secret text;
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF p_tenant_id IS NULL OR p_tenant_id <> public.current_tenant_id() THEN
      RAISE EXCEPTION 'Geen toegang tot deze tenant';
    END IF;
    IF NOT public.current_user_is_tenant_admin(p_tenant_id) THEN
      RAISE EXCEPTION 'Alleen owner/admin mag SMS-config ophalen';
    END IF;
  END IF;

  SELECT COALESCE(settings, '{}'::jsonb)
  INTO v_settings
  FROM public.tenant_settings
  WHERE tenant_id = p_tenant_id
    AND category = 'sms';

  v_settings := COALESCE(v_settings, '{}'::jsonb);

  FOREACH v_key IN ARRAY public.sms_secret_keys() LOOP
    IF v_settings ? (v_key || 'SecretId') THEN
      v_secret_id := NULLIF(v_settings ->> (v_key || 'SecretId'), '')::uuid;
      IF v_secret_id IS NOT NULL THEN
        SELECT decrypted_secret
        INTO v_secret
        FROM vault.decrypted_secrets
        WHERE id = v_secret_id;

        IF v_secret IS NOT NULL THEN
          v_settings := jsonb_set(v_settings, ARRAY[v_key], to_jsonb(v_secret), true);
        END IF;
      END IF;
      v_settings := v_settings - (v_key || 'SecretId');
    END IF;
  END LOOP;

  RETURN v_settings;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_sms_settings_ui()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id uuid := public.current_tenant_id();
  v_settings jsonb := '{}'::jsonb;
  v_key text;
BEGIN
  IF v_tenant_id IS NULL OR NOT public.current_user_is_tenant_admin(v_tenant_id) THEN
    RAISE EXCEPTION 'Alleen owner/admin mag SMS-config beheren';
  END IF;

  v_settings := COALESCE(public.get_sms_settings_runtime(v_tenant_id), '{}'::jsonb);

  FOREACH v_key IN ARRAY public.sms_secret_keys() LOOP
    IF v_settings ? v_key THEN
      v_settings := jsonb_set(
        v_settings,
        ARRAY['has' || upper(left(v_key, 1)) || substr(v_key, 2)],
        'true'::jsonb,
        true
      );
      v_settings := v_settings - v_key;
    END IF;
  END LOOP;

  RETURN v_settings;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_sms_settings_secure(p_settings jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $$
DECLARE
  v_tenant_id uuid := public.current_tenant_id();
  v_existing jsonb := '{}'::jsonb;
  v_safe jsonb := COALESCE(p_settings, '{}'::jsonb);
  v_key text;
  v_value text;
  v_secret_id uuid;
BEGIN
  IF v_tenant_id IS NULL OR NOT public.current_user_is_tenant_admin(v_tenant_id) THEN
    RAISE EXCEPTION 'Alleen owner/admin mag SMS-config beheren';
  END IF;

  SELECT settings
  INTO v_existing
  FROM public.tenant_settings
  WHERE tenant_id = v_tenant_id
    AND category = 'sms';

  v_existing := COALESCE(v_existing, '{}'::jsonb);

  FOREACH v_key IN ARRAY public.sms_secret_keys() LOOP
    v_value := NULLIF(BTRIM(COALESCE(p_settings ->> v_key, '')), '');
    v_safe := v_safe - ('has' || upper(left(v_key, 1)) || substr(v_key, 2));

    IF v_value IS NOT NULL THEN
      v_secret_id := NULLIF(v_existing ->> (v_key || 'SecretId'), '')::uuid;
      IF v_secret_id IS NOT NULL THEN
        PERFORM vault.update_secret(
          v_secret_id,
          v_value,
          format('sms:%s:%s', v_tenant_id, v_key),
          format('SMS secret for %s', v_key)
        );
      ELSE
        v_secret_id := vault.create_secret(
          v_value,
          format('sms:%s:%s', v_tenant_id, v_key),
          format('SMS secret for %s', v_key)
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

  INSERT INTO public.tenant_settings (tenant_id, category, settings, updated_at)
  VALUES (v_tenant_id, 'sms', v_safe, NOW())
  ON CONFLICT (tenant_id, category)
  DO UPDATE
  SET settings = EXCLUDED.settings,
      updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.current_user_is_tenant_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.integration_secret_keys(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_integration_credentials_runtime(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_integration_credentials_ui(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_integration_credentials_secure(text, boolean, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_integration_credentials_secure(text, boolean, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sms_secret_keys() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_sms_settings_runtime(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_sms_settings_ui() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_sms_settings_secure(jsonb) TO authenticated, service_role;
