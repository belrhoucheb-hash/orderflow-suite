-- ──────────────────────────────────────────────────────────────────────────
-- Sprint 2, TA-04. Tijd-toeslagen op surcharges.
--
-- Bestaande surcharges tabel kende alleen applies_to.day_of_week. Dagdelen
-- (ochtend, avond, nacht) en dagtypes (zaterdag, zondag, feestdag) vereisen
-- expliciete kolommen: time_from, time_to, day_type.
--
-- Match-logica in motor: als time_from en time_to beide gezet, moet
-- pickup_time (lokale tijd Europe/Amsterdam) binnen het venster vallen.
-- day_type filtert op dag-categorie, naast bestaande applies_to.day_of_week.
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE public.surcharges
  ADD COLUMN IF NOT EXISTS time_from TIME,
  ADD COLUMN IF NOT EXISTS time_to   TIME,
  ADD COLUMN IF NOT EXISTS day_type  TEXT
    CHECK (day_type IN ('weekday','saturday','sunday','holiday','any'))
    DEFAULT 'any',
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.surcharges.time_from IS
  'Start van tijdvenster in lokale tijd (Europe/Amsterdam). NULL = hele dag.';
COMMENT ON COLUMN public.surcharges.time_to IS
  'Einde van tijdvenster in lokale tijd. Kan kleiner zijn dan time_from voor nacht-overlap (bijv. 22:00-06:00).';
COMMENT ON COLUMN public.surcharges.day_type IS
  'Dag-categorie: weekday, saturday, sunday, holiday, any. Motor checkt dit tegen pickup_date.';
COMMENT ON COLUMN public.surcharges.sort_order IS
  'Bepaalt volgorde van toepassing, relevant als meerdere toeslagen op hetzelfde subtotaal stapelen.';

-- ─── ROLLBACK ─────────────────────────────────────────────────
-- ALTER TABLE public.surcharges
--   DROP COLUMN IF EXISTS time_from,
--   DROP COLUMN IF EXISTS time_to,
--   DROP COLUMN IF EXISTS day_type,
--   DROP COLUMN IF EXISTS sort_order;
