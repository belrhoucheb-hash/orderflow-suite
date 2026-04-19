-- ══════════════════════════════════════════════════════════════════════════
-- Sprint 2 nawerk + Sprint 3 voorbereiding.
--
-- Drie kolommen op orders die de frontend (Planning.tsx, NewOrder.tsx) én
-- de tariefmotor (vehicle_type keuze per order) nodig hebben, maar die
-- ontbreken in baseline én remote-schema:
--
--   - vehicle_type_id: resultaat van sprint-2 motor, nodig voor CP-04
--     zodat planner kan filteren op passend voertuig zonder
--     shipments.pricing JSONB te hoeven uitpakken.
--   - pickup_date, delivery_date: multi-day planning, dag-selectie in
--     planbord en week-view. Planning.tsx queryt deze kolommen in
--     regel 243 wat vandaag stil faalt.
--
-- Idempotent, geen data-loss. Triggert geen tenant_id mismatches want
-- orders.tenant_id blijft leidend.
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS vehicle_type_id             UUID REFERENCES public.vehicle_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pickup_date                 DATE,
  ADD COLUMN IF NOT EXISTS delivery_date               DATE,
  ADD COLUMN IF NOT EXISTS pickup_time_window_start    TEXT,
  ADD COLUMN IF NOT EXISTS pickup_time_window_end      TEXT,
  ADD COLUMN IF NOT EXISTS delivery_time_window_start  TEXT,
  ADD COLUMN IF NOT EXISTS delivery_time_window_end    TEXT;

COMMENT ON COLUMN public.orders.vehicle_type_id IS
  'Voertuigtype dat de tariefmotor koos voor deze order. NULL als nog niet berekend of handmatig overruled.';
COMMENT ON COLUMN public.orders.pickup_date IS
  'Gevraagde ophaaldatum. Gebruikt door planbord voor dag-selectie.';
COMMENT ON COLUMN public.orders.delivery_date IS
  'Gevraagde afleverdatum. Gebruikt door planbord en week-view.';
COMMENT ON COLUMN public.orders.pickup_time_window_start IS
  'Start van ophaal-tijdvenster in lokale tijd (HH:mm). Prevails boven het algemene time_window_start.';
COMMENT ON COLUMN public.orders.pickup_time_window_end IS
  'Einde van ophaal-tijdvenster in lokale tijd (HH:mm).';
COMMENT ON COLUMN public.orders.delivery_time_window_start IS
  'Start van aflever-tijdvenster in lokale tijd (HH:mm).';
COMMENT ON COLUMN public.orders.delivery_time_window_end IS
  'Einde van aflever-tijdvenster in lokale tijd (HH:mm).';

CREATE INDEX IF NOT EXISTS idx_orders_vehicle_type
  ON public.orders (vehicle_type_id)
  WHERE vehicle_type_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_delivery_date
  ON public.orders (delivery_date);

CREATE INDEX IF NOT EXISTS idx_orders_status_delivery_date
  ON public.orders (status, delivery_date);

-- ─── ROLLBACK ─────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS idx_orders_status_delivery_date;
-- DROP INDEX IF EXISTS idx_orders_delivery_date;
-- DROP INDEX IF EXISTS idx_orders_vehicle_type;
-- ALTER TABLE public.orders
--   DROP COLUMN IF EXISTS delivery_time_window_end,
--   DROP COLUMN IF EXISTS delivery_time_window_start,
--   DROP COLUMN IF EXISTS pickup_time_window_end,
--   DROP COLUMN IF EXISTS pickup_time_window_start,
--   DROP COLUMN IF EXISTS delivery_date,
--   DROP COLUMN IF EXISTS pickup_date,
--   DROP COLUMN IF EXISTS vehicle_type_id;
