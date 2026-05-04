-- Roadmap-stem voor connectoren. Eén rij per (tenant, user, provider).
-- Uniek per drietal zodat dubbele stemmen niet kunnen. Stemmen zijn
-- tenant-scoped: andere tenants zien elkaars stemmen niet.
--
-- Aggregate-view rolt de stemmen per tenant per provider op zodat de UI
-- in één query de telling kan tonen zonder via RLS over individuele rijen
-- te lopen. SECURITY INVOKER zodat de view de RLS van de onderliggende
-- tabel respecteert, dus alleen rijen van de huidige tenant.

CREATE TABLE IF NOT EXISTS public.connector_votes (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id     UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider    TEXT         NOT NULL,
  voted_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT connector_votes_uniq UNIQUE (tenant_id, user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_connector_votes_tenant_provider
  ON public.connector_votes (tenant_id, provider);

COMMENT ON TABLE public.connector_votes IS
  'Roadmap-stemmen van gebruikers per provider, tenant-scoped. Eén rij per (tenant, user, provider).';

-- ─── RLS ────────────────────────────────────────────────────────────
ALTER TABLE public.connector_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "connector_votes: tenant select" ON public.connector_votes;
CREATE POLICY "connector_votes: tenant select"
  ON public.connector_votes
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS "connector_votes: own insert" ON public.connector_votes;
CREATE POLICY "connector_votes: own insert"
  ON public.connector_votes
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND user_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "connector_votes: own delete" ON public.connector_votes;
CREATE POLICY "connector_votes: own delete"
  ON public.connector_votes
  FOR DELETE TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND user_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "connector_votes: service_role full" ON public.connector_votes;
CREATE POLICY "connector_votes: service_role full"
  ON public.connector_votes
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

GRANT SELECT, INSERT, DELETE ON public.connector_votes TO authenticated;
GRANT ALL ON public.connector_votes TO service_role;

-- ─── Aggregate view ─────────────────────────────────────────────────
-- SECURITY INVOKER (default in PG15+) zodat RLS van de onderliggende
-- tabel actief is voor de aanroeper. Resultaat is dus tenant-scoped:
-- de view geeft per provider de telling van zichtbare rijen, dat zijn
-- alleen de votes van de eigen tenant.
DROP VIEW IF EXISTS public.connector_votes_aggregate;
CREATE VIEW public.connector_votes_aggregate
WITH (security_invoker = true)
AS
SELECT
  provider,
  COUNT(*)::bigint AS total_votes
FROM public.connector_votes
GROUP BY provider;

COMMENT ON VIEW public.connector_votes_aggregate IS
  'Stemtotaal per provider, automatisch tenant-scoped via RLS van connector_votes (security_invoker).';

GRANT SELECT ON public.connector_votes_aggregate TO authenticated, service_role;

-- --- ROLLBACK -------------------------------------------------------
-- DROP VIEW IF EXISTS public.connector_votes_aggregate;
-- DROP POLICY IF EXISTS "connector_votes: service_role full" ON public.connector_votes;
-- DROP POLICY IF EXISTS "connector_votes: own delete" ON public.connector_votes;
-- DROP POLICY IF EXISTS "connector_votes: own insert" ON public.connector_votes;
-- DROP POLICY IF EXISTS "connector_votes: tenant select" ON public.connector_votes;
-- DROP INDEX IF EXISTS idx_connector_votes_tenant_provider;
-- DROP TABLE IF EXISTS public.connector_votes;
