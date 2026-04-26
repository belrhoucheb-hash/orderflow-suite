ALTER TABLE public.integration_credentials
  DROP CONSTRAINT IF EXISTS integration_credentials_provider_chk;

ALTER TABLE public.integration_credentials
  ADD CONSTRAINT integration_credentials_provider_chk
  CHECK (
    provider IN (
      'snelstart',
      'exact_online',
      'twinfield',
      'samsara',
      'nostradamus',
      'smtp'
    )
  );

COMMENT ON CONSTRAINT integration_credentials_provider_chk ON public.integration_credentials IS
  'Toegestane tenant-gebonden providers, inclusief SMTP voor e-mail per tenant.';

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
    WHEN 'smtp' THEN ARRAY['password']::text[]
    ELSE ARRAY[]::text[]
  END;
$$;
