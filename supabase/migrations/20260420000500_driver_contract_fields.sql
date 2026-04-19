-- ══════════════════════════════════════════════════════════════════════════
-- Sprint 3, CP-06. Contracturen per chauffeur als tussenoplossing tot
-- Sprint 5 (Nmbrs-sync). Bewust twee losse velden op drivers in plaats
-- van een aparte tabel: het is handmatig onderhouden en verandert zelden.
--
-- Auto-plan-engine gebruikt contract_hours_per_week in combinatie met
-- view driver_hours_per_week om over-assignering te voorkomen.
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS contract_hours_per_week INTEGER,
  ADD COLUMN IF NOT EXISTS employment_type         TEXT NOT NULL DEFAULT 'vast'
                                                     CHECK (employment_type IN ('vast','flex','ingehuurd'));

COMMENT ON COLUMN public.drivers.contract_hours_per_week IS
  'Tijdelijk handmatig veld. Sprint 5 vervangt door Nmbrs-sync. NULL = geen contracturen-check.';
COMMENT ON COLUMN public.drivers.employment_type IS
  'Contract-type: vast (in dienst), flex (oproep), ingehuurd (extern). Gebruikt door planner voor prioritering.';

-- ─── ROLLBACK ─────────────────────────────────────────────────
-- ALTER TABLE public.drivers
--   DROP COLUMN IF EXISTS employment_type,
--   DROP COLUMN IF EXISTS contract_hours_per_week;