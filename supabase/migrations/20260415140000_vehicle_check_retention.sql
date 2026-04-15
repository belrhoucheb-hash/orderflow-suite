-- ──────────────────────────────────────────────────────────────────────────
-- Retentie voor voertuigcheck-foto's
--
-- Storage loopt vol als we alle check-foto's eeuwig bewaren. Alleen foto's
-- van OK-checks ouder dan N dagen mogen weg. DAMAGE_FOUND en RELEASED
-- blijven bewijsmateriaal. Baseline-seed foto's blijven staan (referentie
-- voor toekomstige diffs).
-- ──────────────────────────────────────────────────────────────────────────

-- 1. Retention-config: voor nu alleen een default (180 dagen) die door de
--    SQL-functie wordt gebruikt. Per-tenant override kan later bovenop een
--    bestaande settings-tabel gebouwd worden.

-- 2. Log-tabel
CREATE TABLE IF NOT EXISTS public.vehicle_check_retention_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  days_threshold INT NOT NULL,
  deleted_count INT NOT NULL DEFAULT 0,
  deleted_bytes_estimate BIGINT NOT NULL DEFAULT 0,
  executed_by TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_retention_log_run_at
  ON public.vehicle_check_retention_log(run_at DESC);

ALTER TABLE public.vehicle_check_retention_log ENABLE ROW LEVEL SECURITY;

-- Alleen service_role mag schrijven; geauthenticeerde gebruikers mogen lezen
-- zodat admin/planner de historie ziet.
CREATE POLICY "Service role full access on retention_log"
  ON public.vehicle_check_retention_log FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Authenticated read on retention_log"
  ON public.vehicle_check_retention_log FOR SELECT TO authenticated
  USING (true);

COMMENT ON TABLE public.vehicle_check_retention_log IS
  'Elke run van prune_vehicle_check_photos schrijft hier een regel. Audit trail.';

-- ─── 3. Prune-functie ────────────────────────────────────────────────────
-- SECURITY DEFINER zodat de functie via cron (zonder auth-context) objecten
-- in storage.objects kan verwijderen. Cross-tenant: ja, dit is een platform-
-- job, geen per-tenant actie.
CREATE OR REPLACE FUNCTION public.prune_vehicle_check_photos(
  days_threshold INT DEFAULT 180
) RETURNS TABLE (
  deleted_count INT,
  deleted_bytes_estimate BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_deleted_count INT := 0;
  v_bytes_estimate BIGINT := 0;
  v_photo RECORD;
  v_bucket CONSTANT TEXT := 'vehicle-checks';
BEGIN
  IF days_threshold IS NULL OR days_threshold < 1 THEN
    RAISE EXCEPTION 'days_threshold moet minimaal 1 zijn, kreeg %', days_threshold;
  END IF;

  FOR v_photo IN
    SELECT p.id AS photo_id, p.storage_path
    FROM public.vehicle_check_photos p
    JOIN public.vehicle_checks c ON c.id = p.check_id
    WHERE c.status = 'OK'
      AND c.is_baseline_seed = false
      AND c.completed_at IS NOT NULL
      AND c.completed_at < now() - make_interval(days => days_threshold)
      AND NOT EXISTS (
        SELECT 1 FROM public.vehicle_checks c2
        WHERE c2.baseline_check_id = c.id
      )
  LOOP
    -- Schatting bytes via storage.objects metadata indien aanwezig.
    BEGIN
      SELECT COALESCE((metadata->>'size')::BIGINT, 0)
      INTO v_bytes_estimate
      FROM storage.objects
      WHERE bucket_id = v_bucket AND name = v_photo.storage_path;
    EXCEPTION WHEN OTHERS THEN
      v_bytes_estimate := 0;
    END;

    -- Verwijder object in storage.
    DELETE FROM storage.objects
    WHERE bucket_id = v_bucket AND name = v_photo.storage_path;

    -- Verwijder metadata-rij.
    DELETE FROM public.vehicle_check_photos WHERE id = v_photo.photo_id;

    v_deleted_count := v_deleted_count + 1;
  END LOOP;

  deleted_count := v_deleted_count;
  deleted_bytes_estimate := v_bytes_estimate;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_vehicle_check_photos(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_vehicle_check_photos(INT) TO service_role;

COMMENT ON FUNCTION public.prune_vehicle_check_photos(INT) IS
  'Verwijdert foto''s van OK-checks ouder dan N dagen. DAMAGE_FOUND, RELEASED en baseline-seed blijven behouden. Retourneert aantal verwijderde foto''s.';

-- ─── 4. pg_cron: dagelijks om 03:15 UTC ──────────────────────────────────
-- Alleen plannen als extensie beschikbaar is. Bestaande cron-entry wordt
-- eerst verwijderd zodat her-apply idempotent is.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('prune-vehicle-check-photos')
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'prune-vehicle-check-photos'
    );

    PERFORM cron.schedule(
      'prune-vehicle-check-photos',
      '15 3 * * *',
      $cron$
      WITH r AS (
        SELECT * FROM public.prune_vehicle_check_photos(180)
      )
      INSERT INTO public.vehicle_check_retention_log
        (days_threshold, deleted_count, deleted_bytes_estimate, executed_by, details)
      SELECT 180, r.deleted_count, r.deleted_bytes_estimate, 'pg_cron', '{}'::jsonb
      FROM r;
      $cron$
    );
  END IF;
END $$;
