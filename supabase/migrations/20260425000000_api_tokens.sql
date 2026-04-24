-- Publieke REST API v1: tokens voor externe integraties.
--
-- Token wordt alleen gehashed opgeslagen (SHA-256). De eerste 8 karakters
-- staan in clear in token_prefix zodat de UI ze kan tonen zonder te
-- ontsleutelen. Plaintext wordt eenmaal getoond bij aanmaak.
--
-- Scope-model:
--   - tenant-token: client_id IS NULL, ziet alle data van de tenant
--   - klant-token: client_id = specifieke klant, ziet alleen diens data
--
-- Scopes: lijst van strings zoals 'orders:read', 'orders:write',
-- 'trips:read', 'invoices:read', 'clients:read'. De gateway checkt per
-- endpoint welke scope nodig is.

CREATE TABLE IF NOT EXISTS public.api_tokens (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL,
  client_id      UUID,
  name           TEXT        NOT NULL,
  token_hash     TEXT        NOT NULL UNIQUE,
  token_prefix   TEXT        NOT NULL,
  scopes         TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at   TIMESTAMPTZ,
  expires_at     TIMESTAMPTZ,
  revoked_at     TIMESTAMPTZ,
  CONSTRAINT api_tokens_scopes_nonempty_chk
    CHECK (array_length(scopes, 1) >= 1),
  CONSTRAINT api_tokens_prefix_len_chk
    CHECK (length(token_prefix) BETWEEN 6 AND 12),
  CONSTRAINT api_tokens_hash_len_chk
    CHECK (length(token_hash) = 64)
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_tenant ON public.api_tokens (tenant_id, revoked_at);
CREATE INDEX IF NOT EXISTS idx_api_tokens_client ON public.api_tokens (client_id, revoked_at) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_api_tokens_hash_lookup ON public.api_tokens (token_hash) WHERE revoked_at IS NULL;

COMMENT ON TABLE public.api_tokens IS
  'Publieke REST API tokens. Tenant-scoped (client_id NULL) of per-klant (client_id gezet). Alleen hash opgeslagen, plaintext eenmaal getoond bij aanmaak.';

COMMENT ON COLUMN public.api_tokens.token_hash IS 'SHA-256 hex van de plaintext token.';
COMMENT ON COLUMN public.api_tokens.token_prefix IS 'Eerste 6-12 karakters van plaintext voor UI-herkenning (niet gevoelig).';
COMMENT ON COLUMN public.api_tokens.scopes IS 'Lijst scopes: {orders:read,orders:write,trips:read,invoices:read,clients:read}.';

-- ─── RLS ────────────────────────────────────────────────────────────
ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;

-- Tenant-admins beheren tenant-tokens EN klant-tokens binnen hun tenant.
DROP POLICY IF EXISTS "API tokens: tenant admin select" ON public.api_tokens;
CREATE POLICY "API tokens: tenant admin select"
  ON public.api_tokens
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = api_tokens.tenant_id
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "API tokens: tenant admin insert" ON public.api_tokens;
CREATE POLICY "API tokens: tenant admin insert"
  ON public.api_tokens
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = api_tokens.tenant_id
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

-- Update alleen voor revoke / rename / expires update.
DROP POLICY IF EXISTS "API tokens: tenant admin update" ON public.api_tokens;
CREATE POLICY "API tokens: tenant admin update"
  ON public.api_tokens
  FOR UPDATE TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = api_tokens.tenant_id
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

-- Klant-portal users mogen alleen eigen klant-tokens zien en aanmaken.
-- client_portal_users tabel bestaat via portal-module.
DROP POLICY IF EXISTS "API tokens: client-portal select" ON public.api_tokens;
CREATE POLICY "API tokens: client-portal select"
  ON public.api_tokens
  FOR SELECT TO authenticated
  USING (
    client_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.client_portal_users cpu
      WHERE cpu.user_id = (SELECT auth.uid())
        AND cpu.client_id = api_tokens.client_id
    )
  );

DROP POLICY IF EXISTS "API tokens: client-portal insert" ON public.api_tokens;
CREATE POLICY "API tokens: client-portal insert"
  ON public.api_tokens
  FOR INSERT TO authenticated
  WITH CHECK (
    client_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.client_portal_users cpu
      WHERE cpu.user_id = (SELECT auth.uid())
        AND cpu.client_id = api_tokens.client_id
        AND cpu.tenant_id = api_tokens.tenant_id
    )
  );

DROP POLICY IF EXISTS "API tokens: client-portal update" ON public.api_tokens;
CREATE POLICY "API tokens: client-portal update"
  ON public.api_tokens
  FOR UPDATE TO authenticated
  USING (
    client_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.client_portal_users cpu
      WHERE cpu.user_id = (SELECT auth.uid())
        AND cpu.client_id = api_tokens.client_id
        AND cpu.tenant_id = api_tokens.tenant_id
    )
  );

DROP POLICY IF EXISTS "API tokens: service_role full" ON public.api_tokens;
CREATE POLICY "API tokens: service_role full"
  ON public.api_tokens
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

GRANT SELECT, INSERT, UPDATE ON public.api_tokens TO authenticated;
GRANT ALL ON public.api_tokens TO service_role;
-- Geen DELETE voor authenticated: tokens revoken (set revoked_at), niet hard-deleten.

-- --- ROLLBACK -------------------------------------------------------
-- DROP POLICY IF EXISTS "API tokens: service_role full" ON public.api_tokens;
-- DROP POLICY IF EXISTS "API tokens: client-portal update" ON public.api_tokens;
-- DROP POLICY IF EXISTS "API tokens: client-portal insert" ON public.api_tokens;
-- DROP POLICY IF EXISTS "API tokens: client-portal select" ON public.api_tokens;
-- DROP POLICY IF EXISTS "API tokens: tenant admin update" ON public.api_tokens;
-- DROP POLICY IF EXISTS "API tokens: tenant admin insert" ON public.api_tokens;
-- DROP POLICY IF EXISTS "API tokens: tenant admin select" ON public.api_tokens;
-- DROP INDEX IF EXISTS idx_api_tokens_hash_lookup;
-- DROP INDEX IF EXISTS idx_api_tokens_client;
-- DROP INDEX IF EXISTS idx_api_tokens_tenant;
-- DROP TABLE IF EXISTS public.api_tokens;
