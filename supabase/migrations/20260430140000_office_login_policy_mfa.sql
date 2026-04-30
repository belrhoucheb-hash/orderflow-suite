DROP FUNCTION IF EXISTS public.office_login_policy(TEXT);

CREATE OR REPLACE FUNCTION public.office_login_policy(p_email TEXT)
RETURNS TABLE(
  locked_until TIMESTAMPTZ,
  failed_count INTEGER,
  login_protection_enabled BOOLEAN,
  max_login_attempts INTEGER,
  lockout_minutes INTEGER,
  requires_2fa BOOLEAN,
  verification_method TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email TEXT := lower(trim(p_email));
BEGIN
  RETURN QUERY
  SELECT
    CASE
      WHEN coalesce(sec.login_protection_enabled, TRUE) = TRUE
       AND ola.locked_until IS NOT NULL
       AND ola.locked_until > NOW()
      THEN ola.locked_until
      ELSE NULL
    END AS locked_until,
    coalesce(ola.failed_count, 0) AS failed_count,
    coalesce(sec.login_protection_enabled, TRUE) AS login_protection_enabled,
    coalesce(sec.max_login_attempts, 5) AS max_login_attempts,
    coalesce(sec.lockout_minutes, 15) AS lockout_minutes,
    coalesce(sec.extra_security_enabled, FALSE) AS requires_2fa,
    coalesce(sec.verification_method, 'authenticator_app')::TEXT AS verification_method
  FROM auth.users au
  LEFT JOIN public.profiles p ON p.user_id = au.id
  LEFT JOIN public.office_user_security_settings sec
    ON sec.user_id = au.id
   AND sec.tenant_id = p.tenant_id
  LEFT JOIN public.office_login_attempts ola
    ON ola.email = v_email
  WHERE lower(au.email) = v_email
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      CASE
        WHEN ola.locked_until IS NOT NULL AND ola.locked_until > NOW()
        THEN ola.locked_until
        ELSE NULL
      END,
      coalesce(ola.failed_count, 0),
      TRUE,
      5,
      15,
      FALSE,
      'authenticator_app'::TEXT
    FROM public.office_login_attempts ola
    WHERE ola.email = v_email;

    IF NOT FOUND THEN
      RETURN QUERY SELECT NULL::TIMESTAMPTZ, 0, TRUE, 5, 15, FALSE, 'authenticator_app'::TEXT;
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.office_login_policy(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.office_login_policy(TEXT) TO anon, authenticated;
