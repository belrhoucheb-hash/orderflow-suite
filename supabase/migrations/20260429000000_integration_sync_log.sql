-- Integration sync log: append-only log van push/pull-acties richting
-- externe systemen (Snelstart, Exact Online, ...).
--
-- Gebruikt als runtime-audit voor de connector-laag (sprint 8). Per
-- sync-actie één rij. UI toont de laatste 50 per connection met
-- status, records-count en eventuele foutmelding.

CREATE TABLE IF NOT EXISTS public.integration_sync_log (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID         NOT NULL,
  provider        TEXT         NOT NULL,
  connection_id   UUID,
  direction       TEXT         NOT NULL,
  event_type      TEXT,
  entity_type     TEXT,
  entity_id       UUID,
  status          TEXT         NOT NULL,
  records_count   INTEGER      NOT NULL DEFAULT 0,
  error_message   TEXT,
  duration_ms     INTEGER,
  external_id     TEXT,
  started_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT integration_sync_log_direction_chk
    CHECK (direction IN ('push', 'pull', 'test')),
  CONSTRAINT integration_sync_log_status_chk
    CHECK (status IN ('SUCCESS', 'FAILED', 'SKIPPED'))
);

CREATE INDEX IF NOT EXISTS idx_integration_sync_log_tenant_provider
  ON public.integration_sync_log (tenant_id, provider, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_integration_sync_log_connection
  ON public.integration_sync_log (connection_id, started_at DESC);

COMMENT ON TABLE public.integration_sync_log IS
  'Append-only log van push/pull-acties tussen OrderFlow en externe systemen. Eén rij per actie. Geen UPDATE/DELETE.';

-- ─── RLS ────────────────────────────────────────────────────────────
ALTER TABLE public.integration_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "integration_sync_log: tenant admin select" ON public.integration_sync_log;
CREATE POLICY "integration_sync_log: tenant admin select"
  ON public.integration_sync_log
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = integration_sync_log.tenant_id
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "integration_sync_log: service_role full" ON public.integration_sync_log;
CREATE POLICY "integration_sync_log: service_role full"
  ON public.integration_sync_log
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- Geen INSERT/UPDATE/DELETE voor authenticated: alleen edge functions
-- (service_role) schrijven; admins lezen via UI.

GRANT SELECT ON public.integration_sync_log TO authenticated;
GRANT ALL ON public.integration_sync_log TO service_role;

-- --- ROLLBACK -------------------------------------------------------
-- DROP POLICY IF EXISTS "integration_sync_log: service_role full" ON public.integration_sync_log;
-- DROP POLICY IF EXISTS "integration_sync_log: tenant admin select" ON public.integration_sync_log;
-- DROP INDEX IF EXISTS idx_integration_sync_log_connection;
-- DROP INDEX IF EXISTS idx_integration_sync_log_tenant_provider;
-- DROP TABLE IF EXISTS public.integration_sync_log;
