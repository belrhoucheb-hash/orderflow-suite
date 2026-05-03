-- Compliance Sprint: schedule the retention runner.
--
-- The runner itself is service-role gated and writes retention_runs evidence.
-- This migration registers the daily trigger where pg_cron/net are available,
-- while keeping local development migrations non-blocking.

CREATE TABLE IF NOT EXISTS public.compliance_job_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL UNIQUE,
  function_name TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  expected_frequency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'configured',
  last_verified_at TIMESTAMPTZ,
  verification_notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT compliance_job_schedules_status_chk CHECK (
    status IN ('configured', 'verified', 'missing', 'paused', 'failed')
  )
);

DROP TRIGGER IF EXISTS update_compliance_job_schedules_updated_at ON public.compliance_job_schedules;
CREATE TRIGGER update_compliance_job_schedules_updated_at
  BEFORE UPDATE ON public.compliance_job_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.compliance_job_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "compliance_job_schedules admin read" ON public.compliance_job_schedules;
CREATE POLICY "compliance_job_schedules admin read"
  ON public.compliance_job_schedules
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "compliance_job_schedules service role" ON public.compliance_job_schedules;
CREATE POLICY "compliance_job_schedules service role"
  ON public.compliance_job_schedules
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON public.compliance_job_schedules TO authenticated;
GRANT ALL ON public.compliance_job_schedules TO service_role;

COMMENT ON TABLE public.compliance_job_schedules IS
  'Internal compliance scheduler register used to prove required background jobs are configured.';

INSERT INTO public.compliance_job_schedules (
  job_name,
  function_name,
  cron_expression,
  expected_frequency,
  status,
  metadata
) VALUES (
  'run-compliance-retention',
  'run-compliance-retention',
  '15 2 * * *',
  'daily',
  'configured',
  jsonb_build_object(
    'purpose', 'Archive/purge regulated operational logs and write retention_runs evidence',
    'caller', 'pg_cron or Supabase Scheduler',
    'requires', ARRAY['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL']
  )
)
ON CONFLICT (job_name) DO UPDATE
SET
  function_name = EXCLUDED.function_name,
  cron_expression = EXCLUDED.cron_expression,
  expected_frequency = EXCLUDED.expected_frequency,
  status = EXCLUDED.status,
  metadata = EXCLUDED.metadata,
  updated_at = now();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    PERFORM cron.unschedule('run-compliance-retention')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'run-compliance-retention');

    PERFORM cron.schedule(
      'run-compliance-retention',
      '15 2 * * *',
      $cron$
        SELECT net.http_post(
          url := current_setting('app.settings.supabase_url', true) || '/functions/v1/run-compliance-retention',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
            'x-executed-by', 'pg_cron:run-compliance-retention'
          ),
          body := '{}'::jsonb
        );
      $cron$
    );

    UPDATE public.compliance_job_schedules
    SET
      status = 'verified',
      last_verified_at = now(),
      verification_notes = 'pg_cron job registered by migration'
    WHERE job_name = 'run-compliance-retention';
  ELSE
    UPDATE public.compliance_job_schedules
    SET
      status = 'configured',
      verification_notes = 'Configure Supabase Scheduler daily at 02:15 UTC if pg_cron/pg_net is unavailable'
    WHERE job_name = 'run-compliance-retention';

    RAISE NOTICE 'pg_cron/pg_net not available; configure run-compliance-retention daily via Supabase Scheduler.';
  END IF;
END $$;
