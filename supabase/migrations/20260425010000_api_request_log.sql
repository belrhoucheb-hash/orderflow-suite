-- API request log voor de publieke REST API v1.
--
-- Elke request schrijft één rij, gebruikt voor rate-limiting (sliding
-- window per token) en audit. Retentie 7 dagen via prune-functie die
-- dagelijks door cron wordt aangeroepen.

CREATE TABLE IF NOT EXISTS public.api_request_log (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id       UUID         NOT NULL REFERENCES public.api_tokens(id) ON DELETE CASCADE,
  tenant_id      UUID         NOT NULL,
  client_id      UUID,
  method         TEXT         NOT NULL,
  path           TEXT         NOT NULL,
  status_code    INTEGER      NOT NULL,
  duration_ms    INTEGER,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Rate-limit query: WHERE token_id=X AND created_at > now() - '1 minute'
CREATE INDEX IF NOT EXISTS idx_api_request_log_token_time
  ON public.api_request_log (token_id, created_at DESC);

-- Audit per tenant
CREATE INDEX IF NOT EXISTS idx_api_request_log_tenant_time
  ON public.api_request_log (tenant_id, created_at DESC);

COMMENT ON TABLE public.api_request_log IS
  'Log per REST API v1 request. Gebruikt voor rate-limiting (sliding window) en audit. Retentie 7 dagen.';

-- ─── RLS ────────────────────────────────────────────────────────────
ALTER TABLE public.api_request_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "API log: tenant admin select" ON public.api_request_log;
CREATE POLICY "API log: tenant admin select"
  ON public.api_request_log
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = api_request_log.tenant_id
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "API log: client-portal select" ON public.api_request_log;
CREATE POLICY "API log: client-portal select"
  ON public.api_request_log
  FOR SELECT TO authenticated
  USING (
    client_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.client_portal_users cpu
      WHERE cpu.user_id = (SELECT auth.uid())
        AND cpu.client_id = api_request_log.client_id
    )
  );

DROP POLICY IF EXISTS "API log: service_role full" ON public.api_request_log;
CREATE POLICY "API log: service_role full"
  ON public.api_request_log
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

GRANT SELECT ON public.api_request_log TO authenticated;
GRANT ALL ON public.api_request_log TO service_role;
-- Geen INSERT/UPDATE voor authenticated: alleen gateway schrijft.

-- ─── Prune-functie ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prune_api_request_log()
RETURNS INTEGER AS $$
DECLARE
  deleted INTEGER;
BEGIN
  DELETE FROM public.api_request_log
  WHERE created_at < NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.prune_api_request_log() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_api_request_log() TO service_role;

COMMENT ON FUNCTION public.prune_api_request_log() IS
  'Verwijdert api_request_log-rijen ouder dan 7 dagen. Cron roept dit dagelijks aan.';

-- --- ROLLBACK -------------------------------------------------------
-- DROP FUNCTION IF EXISTS public.prune_api_request_log();
-- DROP POLICY IF EXISTS "API log: service_role full" ON public.api_request_log;
-- DROP POLICY IF EXISTS "API log: client-portal select" ON public.api_request_log;
-- DROP POLICY IF EXISTS "API log: tenant admin select" ON public.api_request_log;
-- DROP INDEX IF EXISTS idx_api_request_log_tenant_time;
-- DROP INDEX IF EXISTS idx_api_request_log_token_time;
-- DROP TABLE IF EXISTS public.api_request_log;
