CREATE TABLE IF NOT EXISTS public.office_user_access_overrides (
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  access_level TEXT NOT NULL,
  actions JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, user_id, module),
  CONSTRAINT office_user_access_level_chk
    CHECK (access_level IN ('none', 'limited', 'full')),
  CONSTRAINT office_user_access_actions_object_chk
    CHECK (jsonb_typeof(actions) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_office_user_access_user
  ON public.office_user_access_overrides (user_id);

ALTER TABLE public.office_user_access_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "office_user_access tenant admins select" ON public.office_user_access_overrides;
CREATE POLICY "office_user_access tenant admins select"
  ON public.office_user_access_overrides
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      WHERE tm.tenant_id = office_user_access_overrides.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "office_user_access own select" ON public.office_user_access_overrides;
CREATE POLICY "office_user_access own select"
  ON public.office_user_access_overrides
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "office_user_access service role full" ON public.office_user_access_overrides;
CREATE POLICY "office_user_access service role full"
  ON public.office_user_access_overrides
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

GRANT SELECT ON public.office_user_access_overrides TO authenticated;
GRANT ALL ON public.office_user_access_overrides TO service_role;

CREATE TABLE IF NOT EXISTS public.office_user_sessions (
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_key TEXT NOT NULL,
  browser TEXT,
  platform TEXT,
  user_agent TEXT,
  ip_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, user_id, session_key)
);

CREATE INDEX IF NOT EXISTS idx_office_user_sessions_user
  ON public.office_user_sessions (tenant_id, user_id, last_seen_at DESC);

ALTER TABLE public.office_user_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "office_user_sessions own select" ON public.office_user_sessions;
CREATE POLICY "office_user_sessions own select"
  ON public.office_user_sessions
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "office_user_sessions own upsert" ON public.office_user_sessions;
CREATE POLICY "office_user_sessions own upsert"
  ON public.office_user_sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "office_user_sessions own update" ON public.office_user_sessions;
CREATE POLICY "office_user_sessions own update"
  ON public.office_user_sessions
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "office_user_sessions tenant admins select" ON public.office_user_sessions;
CREATE POLICY "office_user_sessions tenant admins select"
  ON public.office_user_sessions
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      WHERE tm.tenant_id = office_user_sessions.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "office_user_sessions service role full" ON public.office_user_sessions;
CREATE POLICY "office_user_sessions service role full"
  ON public.office_user_sessions
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

GRANT SELECT, INSERT, UPDATE ON public.office_user_sessions TO authenticated;
GRANT ALL ON public.office_user_sessions TO service_role;

CREATE TABLE IF NOT EXISTS public.office_login_attempts (
  email TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_failed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.office_login_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "office_login_attempts service role full" ON public.office_login_attempts;
CREATE POLICY "office_login_attempts service role full"
  ON public.office_login_attempts
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE OR REPLACE FUNCTION public.office_login_lockout(p_email TEXT)
RETURNS TABLE(locked_until TIMESTAMPTZ, failed_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(trim(p_email));
BEGIN
  RETURN QUERY
  SELECT ola.locked_until, ola.failed_count
  FROM public.office_login_attempts ola
  WHERE ola.email = v_email
    AND ola.locked_until IS NOT NULL
    AND ola.locked_until > NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.office_login_policy(p_email TEXT)
RETURNS TABLE(
  locked_until TIMESTAMPTZ,
  failed_count INTEGER,
  login_protection_enabled BOOLEAN,
  max_login_attempts INTEGER,
  lockout_minutes INTEGER
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
    coalesce(sec.lockout_minutes, 15) AS lockout_minutes
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
      15
    FROM public.office_login_attempts ola
    WHERE ola.email = v_email;

    IF NOT FOUND THEN
      RETURN QUERY SELECT NULL::TIMESTAMPTZ, 0, TRUE, 5, 15;
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_office_login_attempt(
  p_email TEXT,
  p_success BOOLEAN,
  p_max_attempts INTEGER DEFAULT 5,
  p_lockout_minutes INTEGER DEFAULT 15
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(trim(p_email));
  v_max INTEGER := least(10, greatest(3, coalesce(p_max_attempts, 5)));
  v_lockout INTEGER := least(120, greatest(5, coalesce(p_lockout_minutes, 15)));
  v_failed INTEGER;
BEGIN
  IF v_email = '' THEN
    RETURN;
  END IF;

  IF p_success THEN
    DELETE FROM public.office_login_attempts WHERE email = v_email;
    RETURN;
  END IF;

  INSERT INTO public.office_login_attempts (email, failed_count, last_failed_at, updated_at)
  VALUES (v_email, 1, NOW(), NOW())
  ON CONFLICT (email)
  DO UPDATE SET
    failed_count = public.office_login_attempts.failed_count + 1,
    last_failed_at = NOW(),
    updated_at = NOW()
  RETURNING failed_count INTO v_failed;

  IF v_failed >= v_max THEN
    UPDATE public.office_login_attempts
    SET locked_until = NOW() + make_interval(mins => v_lockout),
        updated_at = NOW()
    WHERE email = v_email;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.office_login_lockout(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.office_login_policy(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_office_login_attempt(TEXT, BOOLEAN, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.office_login_lockout(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.office_login_policy(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_office_login_attempt(TEXT, BOOLEAN, INTEGER, INTEGER) TO anon, authenticated;
