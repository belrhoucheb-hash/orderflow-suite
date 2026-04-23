-- ══════════════════════════════════════════════════════════════════════════
-- Sprint 4. Auto-archive van chauffeurs op of na hun uitdienst-datum.
--
-- Waarom:
--   Een uit dienst getreden chauffeur mag niet meer in de beschikbare-lijst
--   voor planning opduiken. Handmatig op "inactief" moeten klikken naast
--   het invullen van de uitdienstdatum is dubbel werk en foutgevoelig.
--
-- Aanpak:
--   1. BEFORE INSERT OR UPDATE trigger die is_active direct op false zet
--      zodra termination_date vandaag of in het verleden ligt. Dit dekt
--      de flow "admin vult vandaag de uitdienstdatum in".
--   2. Dagelijkse pg_cron schedule (04:00 Europe/Amsterdam, dus 02:00 UTC
--      in zomertijd en 03:00 UTC in wintertijd, we kiezen 03:00 UTC als
--      veilige middenweg) die rijen opruimt waarbij termination_date in
--      het verleden ligt maar is_active nog true is. Dit dekt de flow
--      "termination_date ligt in de toekomst, wordt vanzelf verleden tijd".
-- ══════════════════════════════════════════════════════════════════════════

-- ─── 1. Trigger-functie ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_archive_terminated_driver()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.termination_date IS NOT NULL
     AND NEW.termination_date <= CURRENT_DATE THEN
    NEW.is_active := false;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.auto_archive_terminated_driver() IS
  'BEFORE INSERT/UPDATE trigger: zet is_active op false zodra termination_date vandaag of eerder is. Voorkomt dat uit-dienst-chauffeurs in planninglijsten blijven staan.';

-- Trigger idempotent (her)aankoppelen.
DROP TRIGGER IF EXISTS drivers_auto_archive_terminated ON public.drivers;
CREATE TRIGGER drivers_auto_archive_terminated
  BEFORE INSERT OR UPDATE ON public.drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_archive_terminated_driver();

-- ─── 2. Dagelijkse cron-schedule (04:00 Europe/Amsterdam) ────────────
-- pg_cron draait in UTC. Europe/Amsterdam is UTC+1 (winter) of UTC+2
-- (zomer). 03:00 UTC valt altijd binnen de nacht-window (04:00 winter,
-- 05:00 zomer), ruim vóór kantoortijden.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Idempotent: bestaande schedule met zelfde naam droppen.
    PERFORM cron.unschedule('archive-terminated-drivers')
      WHERE EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'archive-terminated-drivers'
      );

    PERFORM cron.schedule(
      'archive-terminated-drivers',
      '0 3 * * *',
      $cron$
        UPDATE public.drivers
           SET is_active = false
         WHERE is_active = true
           AND termination_date IS NOT NULL
           AND termination_date <= CURRENT_DATE;
      $cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron extension niet aanwezig, schedule wordt niet geregistreerd. Configureer handmatig via Supabase Scheduler.';
  END IF;
END $$;

-- ─── ROLLBACK ────────────────────────────────────────────────────────
-- DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
--   PERFORM cron.unschedule('archive-terminated-drivers');
-- END IF; END $$;
-- DROP TRIGGER IF EXISTS drivers_auto_archive_terminated ON public.drivers;
-- DROP FUNCTION IF EXISTS public.auto_archive_terminated_driver();
