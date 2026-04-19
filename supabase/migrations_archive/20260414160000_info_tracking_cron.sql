-- §22 Info-tracking cron — periodieke check (elke 15 min)
--
-- Draait in-DB via pg_cron. Doet twee dingen:
--   1. Roept sweep_overdue_info_requests() aan (zet verlopen PENDING
--      requests op OVERDUE + triggert info_status recompute).
--   2. Maakt planner-notifications aan voor nieuwe OVERDUE-requests,
--      met dedup zodat de planner niet gespamd wordt.
--
-- De reminder-mails zelf lopen via de edge-function `check-info-requests`
-- (die per request een mailtje stuurt). Die wordt óf handmatig getriggerd
-- ("Nu herinneren" in UI) óf extern gescheduled. DB-only zou SMTP moeten
-- kunnen en dat wordt rommelig.

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.info_tracking_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  o RECORD;
BEGIN
  -- 1. Overdue sweep
  PERFORM public.sweep_overdue_info_requests();

  -- 2. Escaleer nieuwe OVERDUE's naar planner-notification (dedup)
  FOR r IN
    SELECT ir.id, ir.order_id, ir.tenant_id, ir.field_name, ir.field_label
      FROM public.order_info_requests ir
     WHERE ir.status = 'OVERDUE'
       AND NOT EXISTS (
         SELECT 1
           FROM public.notifications n
          WHERE n.order_id = ir.order_id
            AND n.type = 'info_escalation'
            AND (n.metadata->>'info_request_id') = ir.id::text
       )
  LOOP
    SELECT order_number, client_name INTO o
      FROM public.orders WHERE id = r.order_id;

    INSERT INTO public.notifications (
      tenant_id, type, title, message, icon, order_id, is_read, metadata
    ) VALUES (
      r.tenant_id,
      'info_escalation',
      'Info verlopen — #' || COALESCE(o.order_number::text, '?'),
      COALESCE(r.field_label, r.field_name)
        || ' nog niet ontvangen van '
        || COALESCE(o.client_name, 'klant') || '.',
      'alert-triangle',
      r.order_id,
      false,
      jsonb_build_object(
        'info_request_id', r.id::text,
        'field_name', r.field_name,
        'source', 'info_tracking_cron'
      )
    );
  END LOOP;
END;
$$;

-- ── Schedule: elke 15 minuten ──
-- Unschedule bestaande job als hij al bestaat (idempotent migratie).
DO $$
DECLARE
  j RECORD;
BEGIN
  FOR j IN SELECT jobid FROM cron.job WHERE jobname = 'info-tracking-every-15min'
  LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'info-tracking-every-15min',
  '*/15 * * * *',
  $$ SELECT public.info_tracking_tick(); $$
);
