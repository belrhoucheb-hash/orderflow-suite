-- ============================================================
-- Server-side SLA Monitor via pg_cron
-- Replaces browser-based polling with a DB-level cron job
-- that runs every 10 minutes.
-- ============================================================

-- Ensure pg_cron is available
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ─── SLA check function ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_sla_violations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  sla_hours CONSTANT INTEGER := 4;
  warning_hours CONSTANT INTEGER := 3;
  minutes_elapsed INTEGER;
  urgency TEXT;
  notif_type TEXT;
  notif_title TEXT;
  notif_message TEXT;
  notif_icon TEXT;
  dedup_key TEXT;
BEGIN
  -- Find orders in DRAFT or PENDING with received_at set
  FOR r IN
    SELECT
      o.id,
      o.order_number,
      o.client_name,
      o.received_at,
      o.status,
      o.tenant_id,
      EXTRACT(EPOCH FROM (now() - o.received_at)) / 60 AS mins_since_received
    FROM public.orders o
    WHERE o.status IN ('DRAFT', 'PENDING')
      AND o.received_at IS NOT NULL
      AND EXTRACT(EPOCH FROM (now() - o.received_at)) / 60 >= (warning_hours * 60)
  LOOP
    minutes_elapsed := FLOOR(r.mins_since_received);

    -- Determine urgency level
    IF minutes_elapsed >= (sla_hours * 60) THEN
      urgency := 'KRITIEK';
      notif_type := 'sla_critical';
      notif_title := 'SLA verlopen: Order #' || r.order_number;
      notif_message := COALESCE(r.client_name, 'Onbekende klant')
        || ' — deadline is verstreken (' || minutes_elapsed || ' min). Direct actie vereist.';
      notif_icon := 'alert-triangle';
      dedup_key := 'sla-critical-' || r.id::TEXT;
    ELSE
      urgency := 'WARNING';
      notif_type := 'sla_warning';
      notif_title := 'SLA waarschuwing: Order #' || r.order_number;
      notif_message := COALESCE(r.client_name, 'Onbekende klant')
        || ' — nog ' || ((sla_hours * 60) - minutes_elapsed) || ' minuten tot de deadline.';
      notif_icon := 'clock';
      dedup_key := 'sla-warning-' || r.id::TEXT;
    END IF;

    -- Insert notification only if we haven't already notified for this order + urgency
    -- within the last 4 hours (deduplicate to avoid spam)
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE type = notif_type
        AND order_id = r.id
        AND created_at > now() - INTERVAL '4 hours'
    ) THEN
      INSERT INTO public.notifications (
        type,
        title,
        message,
        icon,
        order_id,
        is_read,
        metadata
      ) VALUES (
        notif_type,
        notif_title,
        notif_message,
        notif_icon,
        r.id,
        false,
        jsonb_build_object(
          'urgency', urgency,
          'minutes_elapsed', minutes_elapsed,
          'sla_hours', sla_hours,
          'order_status', r.status,
          'source', 'pg_cron'
        )
      );
    END IF;
  END LOOP;
END;
$$;

-- ─── Schedule cron job: every 10 minutes ───────────────────
SELECT cron.schedule(
  'sla-monitor-every-10min',
  '*/10 * * * *',
  $$ SELECT public.check_sla_violations(); $$
);
