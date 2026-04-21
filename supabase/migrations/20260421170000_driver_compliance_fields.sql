-- ══════════════════════════════════════════════════════════════════════════
-- Sprint 4, chauffeurs-redesign. Compliance-velden op drivers.
--
-- Bevat:
--   Adres (CAO woon-werk): street, house_number, house_number_suffix,
--                          zipcode, city, country (NL default).
--   Administratie: bsn (11-proef validatie client-side),
--                  iban, personnel_number (uniek per tenant).
--   Arbeid: hire_date, termination_date.
--   Legitimatie: legitimation_expiry_date, code95_expiry_date.
--
-- Allemaal nullable zodat bestaande rijen niet breken; de UI en validatie
-- vragen de velden op bij create of edit.
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS street                    text,
  ADD COLUMN IF NOT EXISTS house_number              text,
  ADD COLUMN IF NOT EXISTS house_number_suffix       text,
  ADD COLUMN IF NOT EXISTS zipcode                   text,
  ADD COLUMN IF NOT EXISTS city                      text,
  ADD COLUMN IF NOT EXISTS country                   text DEFAULT 'NL',

  ADD COLUMN IF NOT EXISTS bsn                       text,
  ADD COLUMN IF NOT EXISTS iban                      text,
  ADD COLUMN IF NOT EXISTS personnel_number          text,

  ADD COLUMN IF NOT EXISTS hire_date                 date,
  ADD COLUMN IF NOT EXISTS termination_date          date,

  ADD COLUMN IF NOT EXISTS legitimation_expiry_date  date,
  ADD COLUMN IF NOT EXISTS code95_expiry_date        date;

COMMENT ON COLUMN public.drivers.bsn IS
  'Burgerservicenummer. Gevoelig, alleen voor loonadministratie. 11-proef client-side.';
COMMENT ON COLUMN public.drivers.iban IS
  'Bankrekeningnummer voor salaris. Checksum client-side.';
COMMENT ON COLUMN public.drivers.personnel_number IS
  'Intern personeelsnummer, uniek per tenant. Wordt gebruikt in urenexport.';
COMMENT ON COLUMN public.drivers.legitimation_expiry_date IS
  'Vervaldatum van rijbewijs, paspoort of ID-kaart. Basis voor alertering.';
COMMENT ON COLUMN public.drivers.code95_expiry_date IS
  'Vervaldatum Code 95 chauffeursdiploma. 5-jaarlijks verplicht voor C/CE-rijbewijs.';

-- Uniciteitsconstraint op personnel_number per tenant. Partial index zodat
-- NULL-waarden niet botsen met elkaar.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_drivers_personnel_number_per_tenant
  ON public.drivers (tenant_id, personnel_number)
  WHERE personnel_number IS NOT NULL;

-- ─── ROLLBACK ─────────────────────────────────────────────────
-- DROP INDEX IF EXISTS uniq_drivers_personnel_number_per_tenant;
-- ALTER TABLE public.drivers
--   DROP COLUMN IF EXISTS code95_expiry_date,
--   DROP COLUMN IF EXISTS legitimation_expiry_date,
--   DROP COLUMN IF EXISTS termination_date,
--   DROP COLUMN IF EXISTS hire_date,
--   DROP COLUMN IF EXISTS personnel_number,
--   DROP COLUMN IF EXISTS iban,
--   DROP COLUMN IF EXISTS bsn,
--   DROP COLUMN IF EXISTS country,
--   DROP COLUMN IF EXISTS city,
--   DROP COLUMN IF EXISTS zipcode,
--   DROP COLUMN IF EXISTS house_number_suffix,
--   DROP COLUMN IF EXISTS house_number,
--   DROP COLUMN IF EXISTS street;
