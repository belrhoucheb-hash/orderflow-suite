-- Connector audit-trail. Append-only log van alle handmatige acties op
-- connectoren, voor compliance + UI-tab. Tenant-bound RLS; alle leden lezen,
-- alleen owner/admin/planner schrijven.

CREATE TABLE IF NOT EXISTS public.connector_audit_log (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider    TEXT         NOT NULL,
  user_id     UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  action      TEXT         NOT NULL CHECK (action IN (
                'connect','disconnect','credential_update','mapping_save',
                'manual_sync','manual_replay','threshold_change'
              )),
  details     JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connector_audit_log_tenant_provider
  ON public.connector_audit_log (tenant_id, provider, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_connector_audit_log_action
  ON public.connector_audit_log (tenant_id, action, created_at DESC);

COMMENT ON TABLE public.connector_audit_log IS
  'Append-only audit-log voor connector-acties. Geen UPDATE/DELETE via RLS.';

-- Auto-fill user_id zodat de frontend niet expliciet auth.uid() hoeft mee te sturen.
CREATE OR REPLACE FUNCTION public.fill_connector_audit_user()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS connector_audit_log_fill_user ON public.connector_audit_log;
CREATE TRIGGER connector_audit_log_fill_user
  BEFORE INSERT ON public.connector_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.fill_connector_audit_user();

-- ─── RLS ────────────────────────────────────────────────────────────
ALTER TABLE public.connector_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "connector_audit_log: tenant member select" ON public.connector_audit_log;
CREATE POLICY "connector_audit_log: tenant member select"
  ON public.connector_audit_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = connector_audit_log.tenant_id
    )
  );

DROP POLICY IF EXISTS "connector_audit_log: tenant member insert" ON public.connector_audit_log;
CREATE POLICY "connector_audit_log: tenant member insert"
  ON public.connector_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = connector_audit_log.tenant_id
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'planner'::text, 'medewerker'::text])
    )
  );

-- Bewust geen UPDATE/DELETE policies, audit-log is append-only voor authenticated.
-- service_role kan in backfill-scenarios alles.
DROP POLICY IF EXISTS "connector_audit_log: service_role full" ON public.connector_audit_log;
CREATE POLICY "connector_audit_log: service_role full"
  ON public.connector_audit_log
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

GRANT SELECT, INSERT ON public.connector_audit_log TO authenticated;
GRANT ALL ON public.connector_audit_log TO service_role;

-- --- ROLLBACK -------------------------------------------------------
-- DROP POLICY IF EXISTS "connector_audit_log: service_role full" ON public.connector_audit_log;
-- DROP POLICY IF EXISTS "connector_audit_log: tenant member insert" ON public.connector_audit_log;
-- DROP POLICY IF EXISTS "connector_audit_log: tenant member select" ON public.connector_audit_log;
-- DROP TRIGGER IF EXISTS connector_audit_log_fill_user ON public.connector_audit_log;
-- DROP FUNCTION IF EXISTS public.fill_connector_audit_user();
-- DROP INDEX IF EXISTS idx_connector_audit_log_action;
-- DROP INDEX IF EXISTS idx_connector_audit_log_tenant_provider;
-- DROP TABLE IF EXISTS public.connector_audit_log;
