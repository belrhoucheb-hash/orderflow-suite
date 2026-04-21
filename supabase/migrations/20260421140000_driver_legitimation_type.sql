-- ══════════════════════════════════════════════════════════════════════════
-- Sprint 4. Sub-type voor legitimatie op drivers. license_number is tot nu
-- toe een los tekstveld; met deze kolom leggen we vast welk document het
-- nummer beschrijft (rijbewijs, paspoort of ID-kaart). Nullable zonder
-- default zodat bestaande rijen geen waarde krijgen die niet gecontroleerd
-- is bij de chauffeur.
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS legitimation_type TEXT
    CHECK (legitimation_type IN ('rijbewijs', 'paspoort', 'id-kaart'));

COMMENT ON COLUMN public.drivers.legitimation_type IS
  'Type legitimatie dat `license_number` betreft.';

-- ─── ROLLBACK ─────────────────────────────────────────────────
-- ALTER TABLE public.drivers
--   DROP COLUMN IF EXISTS legitimation_type;
