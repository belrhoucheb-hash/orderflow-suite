CREATE TABLE IF NOT EXISTS public.office_user_security_settings (
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  extra_security_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  verification_method TEXT NOT NULL DEFAULT 'authenticator_app',
  login_protection_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  max_login_attempts INTEGER NOT NULL DEFAULT 5,
  lockout_minutes INTEGER NOT NULL DEFAULT 15,
  password_reset_required BOOLEAN NOT NULL DEFAULT FALSE,
  password_reset_sent_at TIMESTAMPTZ,
  sessions_revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, user_id),
  CONSTRAINT office_user_security_verification_method_chk
    CHECK (verification_method IN ('authenticator_app', 'email')),
  CONSTRAINT office_user_security_max_attempts_chk
    CHECK (max_login_attempts BETWEEN 3 AND 10),
  CONSTRAINT office_user_security_lockout_chk
    CHECK (lockout_minutes BETWEEN 5 AND 120)
);

CREATE INDEX IF NOT EXISTS idx_office_user_security_user
  ON public.office_user_security_settings (user_id);

ALTER TABLE public.office_user_security_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "office_user_security tenant admins select" ON public.office_user_security_settings;
CREATE POLICY "office_user_security tenant admins select"
  ON public.office_user_security_settings
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      WHERE tm.tenant_id = office_user_security_settings.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "office_user_security tenant admins upsert" ON public.office_user_security_settings;
CREATE POLICY "office_user_security tenant admins upsert"
  ON public.office_user_security_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      WHERE tm.tenant_id = office_user_security_settings.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "office_user_security tenant admins update" ON public.office_user_security_settings;
CREATE POLICY "office_user_security tenant admins update"
  ON public.office_user_security_settings
  FOR UPDATE TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      WHERE tm.tenant_id = office_user_security_settings.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  )
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      WHERE tm.tenant_id = office_user_security_settings.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "office_user_security service role full" ON public.office_user_security_settings;
CREATE POLICY "office_user_security service role full"
  ON public.office_user_security_settings
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

GRANT SELECT, INSERT, UPDATE ON public.office_user_security_settings TO authenticated;
GRANT ALL ON public.office_user_security_settings TO service_role;
