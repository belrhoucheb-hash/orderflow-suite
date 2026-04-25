-- ══════════════════════════════════════════════════════════════════════════
-- Sprint 8. Voorspellende ETA-engine met klant-pushes.
--
-- Doel: per minuut een server-side ETA berekenen voor elke actieve trip-stop,
-- zodat de planner de voorspelling ziet en de klant op tijd een SMS-update
-- krijgt zonder dat een planner handmatig hoeft te bellen. Bij voorspelde
-- vertraging die ruim buiten het tijdvenster valt wordt automatisch een
-- exception aangemaakt zodat de exceptions-pagina hem kan oppakken.
--
-- Onderdelen:
--   1. Twee nieuwe kolommen op trip_stops voor de actuele voorspelling.
--   2. Dedupe-tabel voor klant-notificaties (LEAD + UPDATE per stop).
--   3. pg_cron schedule, elke minuut, die de eta-watcher edge function
--      aanroept.
-- ══════════════════════════════════════════════════════════════════════════

-- ─── 1. trip_stops uitbreiden ─────────────────────────────────────────
ALTER TABLE public.trip_stops
  ADD COLUMN IF NOT EXISTS predicted_eta timestamptz,
  ADD COLUMN IF NOT EXISTS predicted_eta_updated_at timestamptz;

COMMENT ON COLUMN public.trip_stops.predicted_eta IS
  'Server-side voorspelling van aankomsttijd, elke minuut bijgewerkt door eta-watcher op basis van laatste vehicle_position en resterende stops.';
COMMENT ON COLUMN public.trip_stops.predicted_eta_updated_at IS
  'Tijdstip waarop predicted_eta voor het laatst is gezet door eta-watcher. Gebruikt voor staleness-detectie in de UI.';

-- ─── 2. Dedupe-tabel voor klant-notificaties ─────────────────────────
-- Per (stop, trigger_event) max één rij. Voorkomt dat dezelfde klant
-- elke minuut dezelfde SMS krijgt, ondanks dat de cron blijft lopen.
CREATE TABLE IF NOT EXISTS public.trip_stop_eta_notifications (
  trip_stop_id   UUID NOT NULL REFERENCES public.trip_stops(id) ON DELETE CASCADE,
  trigger_event  TEXT NOT NULL CHECK (trigger_event IN ('CUSTOMER_LEAD', 'CUSTOMER_UPDATE')),
  notified_eta   TIMESTAMPTZ NOT NULL,
  sent_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (trip_stop_id, trigger_event)
);

COMMENT ON TABLE public.trip_stop_eta_notifications IS
  'Idempotentie-tabel: één rij per (trip_stop, trigger_event) zodat klanten niet elke minuut dezelfde ETA-SMS krijgen. CUSTOMER_LEAD = eerste push richting de klant binnen lead_minutes voor aankomst, CUSTOMER_UPDATE = follow-up bij significante wijziging.';

CREATE INDEX IF NOT EXISTS idx_trip_stop_eta_notifications_stop
  ON public.trip_stop_eta_notifications (trip_stop_id);

ALTER TABLE public.trip_stop_eta_notifications ENABLE ROW LEVEL SECURITY;

-- Tenant-scope via join op trip_stops -> trips.tenant_id, zelfde patroon
-- als de bestaande trip_stops-policies zodat een gebruiker alleen rijen
-- voor zijn eigen tenant kan zien.
DROP POLICY IF EXISTS "Tenant isolation: trip_stop_eta_notifications SELECT"
  ON public.trip_stop_eta_notifications;
CREATE POLICY "Tenant isolation: trip_stop_eta_notifications SELECT"
  ON public.trip_stop_eta_notifications
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.trip_stops ts
      JOIN public.trips t ON t.id = ts.trip_id
      WHERE ts.id = trip_stop_eta_notifications.trip_stop_id
        AND t.tenant_id = (SELECT public.current_tenant_id())
    )
  );

DROP POLICY IF EXISTS "Service role: trip_stop_eta_notifications"
  ON public.trip_stop_eta_notifications;
CREATE POLICY "Service role: trip_stop_eta_notifications"
  ON public.trip_stop_eta_notifications
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

GRANT SELECT ON TABLE public.trip_stop_eta_notifications TO authenticated;
GRANT ALL ON TABLE public.trip_stop_eta_notifications TO service_role;

-- ─── 3. pg_cron: elke minuut ─────────────────────────────────────────
-- Volgt het patroon uit 20260422130000_certificate_expiry_notifications.sql:
-- als pg_cron beschikbaar is registreren we de schedule, anders alleen
-- een NOTICE zodat lokale dev-omgevingen de migratie niet weigeren.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('eta-watcher')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'eta-watcher');

    PERFORM cron.schedule(
      'eta-watcher',
      '* * * * *',
      $cron$
        SELECT net.http_post(
          url := current_setting('app.settings.supabase_url', true) || '/functions/v1/eta-watcher',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
          ),
          body := '{}'::jsonb
        );
      $cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron extension niet aanwezig, eta-watcher schedule wordt niet geregistreerd. Configureer handmatig via Supabase Scheduler.';
  END IF;
END $$;

-- ─── ROLLBACK ────────────────────────────────────────────────────────
-- DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
--   PERFORM cron.unschedule('eta-watcher');
-- END IF; END $$;
-- DROP TABLE IF EXISTS public.trip_stop_eta_notifications;
-- ALTER TABLE public.trip_stops DROP COLUMN IF EXISTS predicted_eta;
-- ALTER TABLE public.trip_stops DROP COLUMN IF EXISTS predicted_eta_updated_at;
