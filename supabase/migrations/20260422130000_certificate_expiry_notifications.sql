-- ══════════════════════════════════════════════════════════════════════════
-- Sprint 4. Verloop-notificaties voor chauffeur-certificaten.
--
-- Doel: automatisch mailen naar chauffeur (+ BCC admin) op 90, 30 en 7
-- dagen voor verval, en op de verval-dag zelf. Zonder dit missen admins
-- makkelijk een verlopend certificaat waarna een chauffeur ongeldig
-- rijdt, met boetes en audit-problemen tot gevolg.
--
-- Onderdelen:
--   1. CHECK constraint op notification_templates uitbreiden met de 4
--      nieuwe trigger_event waarden.
--   2. Dedupe-tabel zodat dezelfde trigger voor één record niet twee
--      keer een mail stuurt (cron draait dagelijks).
--   3. Seed: default templates per tenant met redelijke voorbeeld-body.
--   4. pg_cron schedule die dagelijks om 07:00 de edge function
--      notify-expiring-certificates aanroept.
-- ══════════════════════════════════════════════════════════════════════════

-- ─── 1. CHECK constraint verbreden ───────────────────────────────────
ALTER TABLE public.notification_templates
  DROP CONSTRAINT IF EXISTS notification_templates_trigger_event_check;
ALTER TABLE public.notification_templates
  ADD CONSTRAINT notification_templates_trigger_event_check CHECK (
    trigger_event = ANY (ARRAY[
      'ORDER_CONFIRMED',
      'TRIP_STARTED',
      'ETA_CHANGED',
      'DRIVER_ARRIVED',
      'DELIVERED',
      'EXCEPTION',
      'VEHICLE_DAMAGE',
      'CERTIFICATE_EXPIRING_90D',
      'CERTIFICATE_EXPIRING_30D',
      'CERTIFICATE_EXPIRING_7D',
      'CERTIFICATE_EXPIRED'
    ])
  );

-- ─── 2. Dedupe-tabel ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.driver_certificate_notifications_sent (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  record_id      UUID NOT NULL REFERENCES public.driver_certification_expiry(id) ON DELETE CASCADE,
  trigger_event  TEXT NOT NULL,
  sent_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (record_id, trigger_event)
);

COMMENT ON TABLE public.driver_certificate_notifications_sent IS
  'Idempotentie-tabel: één rij per (certificaat, trigger_event) zodat dezelfde waarschuwing nooit dubbel verstuurd wordt ondanks dagelijkse cron.';

CREATE INDEX IF NOT EXISTS idx_driver_cert_notif_sent_tenant
  ON public.driver_certificate_notifications_sent (tenant_id);

ALTER TABLE public.driver_certificate_notifications_sent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation: driver_cert_notif_sent SELECT"
  ON public.driver_certificate_notifications_sent;
CREATE POLICY "Tenant isolation: driver_cert_notif_sent SELECT"
  ON public.driver_certificate_notifications_sent
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS "Service role: driver_cert_notif_sent"
  ON public.driver_certificate_notifications_sent;
CREATE POLICY "Service role: driver_cert_notif_sent"
  ON public.driver_certificate_notifications_sent
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

GRANT SELECT ON TABLE public.driver_certificate_notifications_sent TO authenticated;
GRANT ALL ON TABLE public.driver_certificate_notifications_sent TO service_role;

-- ─── 3. Default templates seeden ─────────────────────────────────────
-- Variabelen in de body (bv. {{driver_name}}) worden in send-notification
-- vervangen op basis van de extra_variables uit de trigger-payload.
CREATE OR REPLACE FUNCTION public.seed_certificate_expiry_templates(p_tenant_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO public.notification_templates
    (tenant_id, trigger_event, channel, subject_template, body_template)
  VALUES
    (
      p_tenant_id,
      'CERTIFICATE_EXPIRING_90D',
      'EMAIL',
      'Certificaat {{certification_name}} verloopt over 90 dagen',
      'Hallo {{driver_name}},\n\nJouw certificaat {{certification_name}} verloopt op {{expiry_date}}. Plan op tijd een verlenging zodat je inzetbaar blijft.\n\nGroet,\n{{tenant_name}}'
    ),
    (
      p_tenant_id,
      'CERTIFICATE_EXPIRING_30D',
      'EMAIL',
      'Let op: {{certification_name}} verloopt binnen 30 dagen',
      'Hallo {{driver_name}},\n\nJouw certificaat {{certification_name}} verloopt op {{expiry_date}}, dat is binnen 30 dagen. Regel de verlenging zo snel mogelijk.\n\nGroet,\n{{tenant_name}}'
    ),
    (
      p_tenant_id,
      'CERTIFICATE_EXPIRING_7D',
      'EMAIL',
      'URGENT: {{certification_name}} verloopt binnen een week',
      'Hallo {{driver_name}},\n\nJouw certificaat {{certification_name}} verloopt op {{expiry_date}}. Zonder geldig certificaat mag je deze week niet meer gerelateerde ritten uitvoeren. Neem direct contact op met planning.\n\nGroet,\n{{tenant_name}}'
    ),
    (
      p_tenant_id,
      'CERTIFICATE_EXPIRED',
      'EMAIL',
      'Certificaat {{certification_name}} is verlopen',
      'Hallo {{driver_name}},\n\nJouw certificaat {{certification_name}} is op {{expiry_date}} verlopen. Je mag geen werkzaamheden meer uitvoeren die dit certificaat vereisen. Neem direct contact op met planning voor de vervolgstappen.\n\nGroet,\n{{tenant_name}}'
    )
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    PERFORM public.seed_certificate_expiry_templates(t.id);
  END LOOP;
END $$;

-- ─── 4. pg_cron: dagelijkse scan om 07:00 ────────────────────────────
-- De edge function notify-expiring-certificates doet het werk. Hier
-- registreren we alleen de schedule. Als pg_cron niet beschikbaar is
-- (lokaal) slaat deze blok over zonder te falen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Idempotent: oude schedule met zelfde naam droppen voor opnieuw inrichten.
    PERFORM cron.unschedule('notify-expiring-certificates')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-expiring-certificates');

    PERFORM cron.schedule(
      'notify-expiring-certificates',
      '0 7 * * *',
      $cron$
        SELECT net.http_post(
          url := current_setting('app.settings.supabase_url', true) || '/functions/v1/notify-expiring-certificates',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
          ),
          body := '{}'::jsonb
        );
      $cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron extension niet aanwezig, schedule wordt niet geregistreerd. Configureer handmatig via Supabase Scheduler.';
  END IF;
END $$;

-- ─── ROLLBACK ────────────────────────────────────────────────────────
-- DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
--   PERFORM cron.unschedule('notify-expiring-certificates');
-- END IF; END $$;
-- DROP FUNCTION IF EXISTS public.seed_certificate_expiry_templates(UUID);
-- DROP TABLE IF EXISTS public.driver_certificate_notifications_sent;
-- Constraint-rollback: zet terug naar de originele 7 waardes indien gewenst.
