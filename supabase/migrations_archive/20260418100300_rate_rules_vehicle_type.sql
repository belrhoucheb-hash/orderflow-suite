-- ──────────────────────────────────────────────────────────────────────────
-- Sprint 2. Rate_rules kunnen per voertuigtype verschillen.
--
-- PER_KM en VAST_BEDRAG rules hebben vaak verschillende tarieven per type
-- (Caddy €0,95/km, Bakwagen €1,45/km). Optionele FK naar vehicle_types:
-- NULL betekent "geldt voor alle voertuigtypes".
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE public.rate_rules
  ADD COLUMN IF NOT EXISTS vehicle_type_id UUID REFERENCES public.vehicle_types(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.rate_rules.vehicle_type_id IS
  'Optioneel. Als gezet, geldt deze rule alleen voor orders met dit voertuigtype. NULL = alle types.';

CREATE INDEX IF NOT EXISTS idx_rate_rules_vehicle_type
  ON public.rate_rules (vehicle_type_id)
  WHERE vehicle_type_id IS NOT NULL;

-- ─── ROLLBACK ─────────────────────────────────────────────────
-- ALTER TABLE public.rate_rules DROP COLUMN IF EXISTS vehicle_type_id;
