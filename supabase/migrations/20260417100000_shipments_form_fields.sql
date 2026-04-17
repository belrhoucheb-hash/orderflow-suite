-- ──────────────────────────────────────────────────────────────────────────
-- §25 Shipment form fields — alle NewOrder-velden koppelen aan DB
--
-- Veel formuliervelden (contactpersoon, voertuigtype, MRN, PMT-screening,
-- cargo-detail, klant-referentie, laadklep) werden niet opgeslagen.
-- Deze migratie voegt de ontbrekende kolommen toe aan shipments.
-- Per-leg velden (datum, tijd, referentie, opmerkingen) bestaan al op orders.
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS contact_person TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_type TEXT,
  ADD COLUMN IF NOT EXISTS client_reference TEXT,
  ADD COLUMN IF NOT EXISTS mrn_document TEXT,
  ADD COLUMN IF NOT EXISTS requires_tail_lift BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pmt JSONB,
  ADD COLUMN IF NOT EXISTS cargo JSONB;

COMMENT ON COLUMN public.shipments.contact_person IS
  'Contactpersoon bij de klant.';

COMMENT ON COLUMN public.shipments.vehicle_type IS
  'Handmatig gekozen voertuigtype (Vrachtwagen, Bestelbus, etc.).';

COMMENT ON COLUMN public.shipments.client_reference IS
  'PO-nummer of bestelreferentie van de klant.';

COMMENT ON COLUMN public.shipments.mrn_document IS
  'MRN/douane documentnummer voor export-zendingen.';

COMMENT ON COLUMN public.shipments.requires_tail_lift IS
  'Of er een laadklep nodig is bij laden/lossen.';

COMMENT ON COLUMN public.shipments.pmt IS
  'Luchtvracht-beveiliging (PMT). {secure, methode, operator, referentie, datum, locatie, seal, by_customer}.';

COMMENT ON COLUMN public.shipments.cargo IS
  'Per-rij lading-detail. Array van {aantal, eenheid, gewicht, lengte, breedte, hoogte, stapelbaar, adr, omschrijving}.';