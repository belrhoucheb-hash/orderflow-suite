-- ============================================================
-- Plan E: Dispatch Scheduler Cron Job
-- Runs every 5 minutes to auto-dispatch ready trips
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule the dispatch-scheduler function every 5 minutes
SELECT cron.schedule(
  'dispatch-scheduler',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/dispatch-scheduler',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
