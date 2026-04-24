-- Integration credentials: API-keys en secrets voor externe koppelingen
-- (Snelstart, Exact Online, Twinfield, Samsara, ...).
--
-- Losgekoppeld van tenant_settings omdat secrets strengere RLS verdienen
-- en omdat we per provider een expliciet schema willen kunnen valideren
-- in de edge function. Eén rij per (tenant_id, provider).
--
-- credentials jsonb bevat provider-specifieke velden, bv. voor snelstart:
--   { "clientKey": "...", "subscriptionKey": "...", "administratieId": "...",
--     "standaardGrootboek": "8000", "btwGrootboek": "1500", "mockMode": false }

CREATE TABLE IF NOT EXISTS public.integration_credentials (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL,
  provider       TEXT        NOT NULL,
  enabled        BOOLEAN     NOT NULL DEFAULT FALSE,
  credentials    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by     UUID,
  CONSTRAINT integration_credentials_tenant_provider_uniq
    UNIQUE (tenant_id, provider),
  CONSTRAINT integration_credentials_provider_chk
    CHECK (provider IN ('snelstart', 'exact_online', 'twinfield', 'samsara'))
);

CREATE INDEX IF NOT EXISTS idx_integration_credentials_tenant
  ON public.integration_credentials (tenant_id);

COMMENT ON TABLE public.integration_credentials IS
  'Secrets voor externe integraties, per tenant en provider. Alleen owners/admins mogen lezen/schrijven. Edge functions gebruiken service_role.';

-- ─── RLS ────────────────────────────────────────────────────────────
ALTER TABLE public.integration_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "integration_credentials: tenant admin select" ON public.integration_credentials;
CREATE POLICY "integration_credentials: tenant admin select"
  ON public.integration_credentials
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = integration_credentials.tenant_id
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "integration_credentials: tenant admin insert" ON public.integration_credentials;
CREATE POLICY "integration_credentials: tenant admin insert"
  ON public.integration_credentials
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = integration_credentials.tenant_id
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "integration_credentials: tenant admin update" ON public.integration_credentials;
CREATE POLICY "integration_credentials: tenant admin update"
  ON public.integration_credentials
  FOR UPDATE TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = integration_credentials.tenant_id
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "integration_credentials: tenant admin delete" ON public.integration_credentials;
CREATE POLICY "integration_credentials: tenant admin delete"
  ON public.integration_credentials
  FOR DELETE TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = integration_credentials.tenant_id
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "integration_credentials: service_role full" ON public.integration_credentials;
CREATE POLICY "integration_credentials: service_role full"
  ON public.integration_credentials
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_credentials TO authenticated;
GRANT ALL ON public.integration_credentials TO service_role;

-- updated_at auto-refresh
CREATE OR REPLACE FUNCTION public.tg_integration_credentials_touch()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS integration_credentials_touch ON public.integration_credentials;
CREATE TRIGGER integration_credentials_touch
  BEFORE UPDATE ON public.integration_credentials
  FOR EACH ROW EXECUTE FUNCTION public.tg_integration_credentials_touch();

-- --- ROLLBACK -------------------------------------------------------
-- DROP TRIGGER IF EXISTS integration_credentials_touch ON public.integration_credentials;
-- DROP FUNCTION IF EXISTS public.tg_integration_credentials_touch();
-- DROP POLICY IF EXISTS "integration_credentials: service_role full" ON public.integration_credentials;
-- DROP POLICY IF EXISTS "integration_credentials: tenant admin delete" ON public.integration_credentials;
-- DROP POLICY IF EXISTS "integration_credentials: tenant admin update" ON public.integration_credentials;
-- DROP POLICY IF EXISTS "integration_credentials: tenant admin insert" ON public.integration_credentials;
-- DROP POLICY IF EXISTS "integration_credentials: tenant admin select" ON public.integration_credentials;
-- DROP INDEX IF EXISTS idx_integration_credentials_tenant;
-- DROP TABLE IF EXISTS public.integration_credentials;
