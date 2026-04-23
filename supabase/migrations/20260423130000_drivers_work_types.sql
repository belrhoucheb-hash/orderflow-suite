-- Voegt een kolom drivers.work_types toe voor aanvinkbare werkzaamheden
-- (bv. Boxen, Hoya, ADR, Kleine bus, Bakbus, DAF). Bewust losgekoppeld
-- van drivers.certifications omdat werkzaamheden ook klantnamen en
-- voertuigtypen kunnen zijn, niet alleen certificeringen.
--
-- Type: text[], default lege array zodat bestaande rijen meteen een
-- geldige waarde hebben en de UI geen null-check hoeft te doen.

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS work_types text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.drivers.work_types IS
  'Aanvinkbare werkzaamheden-tags, vrij van betekenis (klantnaam, voertuigtype, certificering). UI levert op dit moment de standaardlijst.';

-- ─── ROLLBACK ────────────────────────────────────────────────────────
-- ALTER TABLE public.drivers DROP COLUMN IF EXISTS work_types;
