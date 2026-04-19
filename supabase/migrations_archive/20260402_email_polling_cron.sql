-- ============================================================
-- Email Polling Cron Job
-- Schedules poll-inbox every 5 minutes via pg_cron + pg_net
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Add auto_approved column to orders for audit trail
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='auto_approved') THEN
    ALTER TABLE public.orders ADD COLUMN auto_approved BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Schedule poll-inbox every 5 minutes
SELECT cron.schedule(
  'poll-inbox-every-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/poll-inbox',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
