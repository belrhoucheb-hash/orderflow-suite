-- ──────────────────────────────────────────────────────────────────────────
-- §24 Shipment pricing — Royalty Cargo km-model + override
--
-- Prijs wordt berekend in NewOrder (km × matrix / 725, afronding op 5, met
-- voertuig-minimum en optionele screening-fee), of handmatig overschreven.
-- We slaan het totaal op als integer cents voor financiele precisie en de
-- parameters in JSONB zodat we achteraf kunnen reproduceren hoe een prijs
-- tot stand kwam (audit + rapportages).
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS price_total_cents INTEGER,
  ADD COLUMN IF NOT EXISTS pricing JSONB;

COMMENT ON COLUMN public.shipments.price_total_cents IS
  'Totaal tarief in eurocenten. Bron: pricing.mode (standard|override).';

COMMENT ON COLUMN public.shipments.pricing IS
  'Berekeningsdetails. standard: {mode,vehicle,km,km_rounded,diesel_included,matrix_tariff,per_km,calc_raw,screening_included,screening_fee,min_applied,min_tariff,total}. override: {mode,amount,reason}.';
