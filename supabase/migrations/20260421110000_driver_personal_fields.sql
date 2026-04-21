-- ══════════════════════════════════════════════════════════════════════════
-- Sprint 4. Persoonsgegevens op drivers voor HR-dossier en noodsituaties.
-- Geboortedatum + noodcontact (naam, relatie, telefoon). Allemaal nullable
-- zodat bestaande rijen niet breken en het formulier stapsgewijs kan worden
-- aangevuld.
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS birth_date                  DATE,
  ADD COLUMN IF NOT EXISTS emergency_contact_name      TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_relation  TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone     TEXT;

COMMENT ON COLUMN public.drivers.birth_date IS
  'Geboortedatum chauffeur, voor HR-dossier.';
COMMENT ON COLUMN public.drivers.emergency_contact_name IS
  'Naam persoon om te bellen bij nood.';
COMMENT ON COLUMN public.drivers.emergency_contact_relation IS
  'Relatie van noodcontact tot chauffeur, bijv. partner, ouder, broer.';
COMMENT ON COLUMN public.drivers.emergency_contact_phone IS
  'Telefoonnummer noodcontact.';

-- ─── ROLLBACK ─────────────────────────────────────────────────
-- ALTER TABLE public.drivers
--   DROP COLUMN IF EXISTS emergency_contact_phone,
--   DROP COLUMN IF EXISTS emergency_contact_relation,
--   DROP COLUMN IF EXISTS emergency_contact_name,
--   DROP COLUMN IF EXISTS birth_date;
