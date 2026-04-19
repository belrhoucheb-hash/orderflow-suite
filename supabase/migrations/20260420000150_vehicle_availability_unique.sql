-- ══════════════════════════════════════════════════════════════════════════
-- Sprint 3, CP-05. vehicle_availability bestaat al maar heeft geen UNIQUE
-- constraint op (vehicle_id, date). Nodig voor idempotente upsert vanuit
-- de Dagsetup-UI. driver_availability heeft de constraint wel, zodat
-- beide tabellen nu hetzelfde upsert-contract delen.
-- ══════════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS uniq_vehicle_availability_vehicle_date
  ON public.vehicle_availability (vehicle_id, date);

-- ─── ROLLBACK ─────────────────────────────────────────────────
-- DROP INDEX IF EXISTS uniq_vehicle_availability_vehicle_date;
