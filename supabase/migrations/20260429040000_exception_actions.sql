-- Exception Copilot: voorgestelde acties op uitzonderingen, anomalies en ad-hoc signalen.
-- Houdt zowel de aanbevelingen zelf als de uitvoer/audit bij.

CREATE TABLE IF NOT EXISTS public.exception_actions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  exception_id      UUID        REFERENCES public.delivery_exceptions(id) ON DELETE CASCADE,
  source_type       TEXT        NOT NULL DEFAULT 'delivery_exception',
  source_ref        TEXT        NOT NULL,
  action_type       TEXT        NOT NULL,
  title             TEXT        NOT NULL,
  description       TEXT,
  confidence        NUMERIC(5,2) NOT NULL,
  impact_json       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  payload_json      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  status            TEXT        NOT NULL DEFAULT 'PENDING',
  recommended       BOOLEAN     NOT NULL DEFAULT false,
  requires_approval BOOLEAN     NOT NULL DEFAULT true,
  executed_at       TIMESTAMPTZ,
  executed_by       UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT exception_actions_confidence_chk
    CHECK (confidence >= 0 AND confidence <= 100),
  CONSTRAINT exception_actions_status_chk
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'AUTO_EXECUTED', 'EXECUTED', 'FAILED')),
  CONSTRAINT exception_actions_source_type_chk
    CHECK (source_type IN ('delivery_exception', 'anomaly', 'adhoc')),
  CONSTRAINT exception_actions_type_nonempty_chk
    CHECK (length(trim(action_type)) > 0),
  CONSTRAINT exception_actions_title_nonempty_chk
    CHECK (length(trim(title)) > 0),
  CONSTRAINT exception_actions_source_ref_nonempty_chk
    CHECK (length(trim(source_ref)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_exception_actions_tenant_status
  ON public.exception_actions (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_exception_actions_source
  ON public.exception_actions (tenant_id, source_type, source_ref);

CREATE INDEX IF NOT EXISTS idx_exception_actions_exception_id
  ON public.exception_actions (exception_id)
  WHERE exception_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_exception_actions_one_recommended
  ON public.exception_actions (tenant_id, source_type, source_ref)
  WHERE recommended = true AND status = 'PENDING';

COMMENT ON TABLE public.exception_actions IS
  'Copilot-acties die worden voorgesteld op delivery exceptions, anomalies of ad-hoc exceptions.';

COMMENT ON COLUMN public.exception_actions.source_type IS
  'Bron van de exception: delivery_exception, anomaly of adhoc.';

COMMENT ON COLUMN public.exception_actions.source_ref IS
  'Bron-id als string zodat ook anomaly/ad-hoc sleutels ondersteund worden.';

COMMENT ON COLUMN public.exception_actions.impact_json IS
  'Verwachte impact zoals tijdswinst, kostenverschil, klantimpact of risicoverlaging.';

COMMENT ON COLUMN public.exception_actions.payload_json IS
  'Machine-readable payload om de actie later uit te voeren.';

CREATE TABLE IF NOT EXISTS public.exception_action_runs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  exception_action_id UUID        NOT NULL REFERENCES public.exception_actions(id) ON DELETE CASCADE,
  run_type            TEXT        NOT NULL,
  result              TEXT        NOT NULL,
  notes               TEXT,
  payload_json        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT exception_action_runs_type_chk
    CHECK (run_type IN ('PROPOSED', 'APPROVED', 'REJECTED', 'EXECUTED', 'AUTO_EXECUTED', 'FAILED', 'DISMISSED')),
  CONSTRAINT exception_action_runs_result_chk
    CHECK (result IN ('SUCCESS', 'FAILED', 'SKIPPED', 'ACKNOWLEDGED'))
);

CREATE INDEX IF NOT EXISTS idx_exception_action_runs_action
  ON public.exception_action_runs (exception_action_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_exception_action_runs_tenant
  ON public.exception_action_runs (tenant_id, created_at DESC);

COMMENT ON TABLE public.exception_action_runs IS
  'Audit trail van exception action voorstellen, approvals, rejects en uitvoer.';

-- updated_at trigger
DROP TRIGGER IF EXISTS set_exception_actions_updated_at ON public.exception_actions;
CREATE TRIGGER set_exception_actions_updated_at
  BEFORE UPDATE ON public.exception_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.exception_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exception_action_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Exception actions: tenant member select" ON public.exception_actions;
CREATE POLICY "Exception actions: tenant member select"
  ON public.exception_actions
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = exception_actions.tenant_id
    )
  );

DROP POLICY IF EXISTS "Exception actions: tenant planner insert" ON public.exception_actions;
CREATE POLICY "Exception actions: tenant planner insert"
  ON public.exception_actions
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = exception_actions.tenant_id
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'medewerker'::text])
    )
  );

DROP POLICY IF EXISTS "Exception actions: tenant planner update" ON public.exception_actions;
CREATE POLICY "Exception actions: tenant planner update"
  ON public.exception_actions
  FOR UPDATE TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = exception_actions.tenant_id
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'medewerker'::text])
    )
  )
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
  );

DROP POLICY IF EXISTS "Exception action runs: tenant member select" ON public.exception_action_runs;
CREATE POLICY "Exception action runs: tenant member select"
  ON public.exception_action_runs
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = exception_action_runs.tenant_id
    )
  );

DROP POLICY IF EXISTS "Exception action runs: tenant planner insert" ON public.exception_action_runs;
CREATE POLICY "Exception action runs: tenant planner insert"
  ON public.exception_action_runs
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = exception_action_runs.tenant_id
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'medewerker'::text])
    )
  );

DROP POLICY IF EXISTS "Exception actions: service_role full" ON public.exception_actions;
CREATE POLICY "Exception actions: service_role full"
  ON public.exception_actions
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Exception action runs: service_role full" ON public.exception_action_runs;
CREATE POLICY "Exception action runs: service_role full"
  ON public.exception_action_runs
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

GRANT SELECT, INSERT, UPDATE ON public.exception_actions TO authenticated;
GRANT SELECT, INSERT ON public.exception_action_runs TO authenticated;
GRANT ALL ON public.exception_actions TO service_role;
GRANT ALL ON public.exception_action_runs TO service_role;
