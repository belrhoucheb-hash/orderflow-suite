-- ══════════════════════════════════════════════════════════════════════════
-- Sprint 4. Server-side validatie van BSN en IBAN op drivers.
--
-- Waarom:
--   Client-side validatie (src/lib/validation/driverSchema.ts) is prima voor
--   UX, maar niet afdwingbaar. Een directe DB-write via service_role of een
--   slordige edge function kan zonder deze CHECK-constraints alsnog een
--   ongeldig BSN of IBAN opslaan. Dat breekt loon- en bankexports.
--
-- Aanpak:
--   Twee IMMUTABLE plpgsql-functies met dezelfde logica als in de TS-kant:
--     is_valid_bsn: 9 cijfers, elfproef (9a+8b+..+2h-1i) deelbaar door 11.
--     is_valid_iban: mod-97 op herschikte string met letters vervangen
--                    door 10..35, resultaat moet 1 zijn.
--   Twee CHECK-constraints die NULL en lege strings toestaan (bestaande
--   rijen met ontbrekende waardes mogen niet breken).
--
-- Noot: de constraints worden met NOT VALID toegevoegd. Zo worden alleen
-- nieuwe en gewijzigde rijen gevalideerd, niet het hele bestand. Een latere
-- migratie kan `VALIDATE CONSTRAINT` draaien na een data-cleanup als dat
-- veilig blijkt.
-- ══════════════════════════════════════════════════════════════════════════

-- ─── 1. BSN validator (elfproef) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_valid_bsn(p_bsn text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_digits text;
  v_sum    integer := 0;
  v_i      integer;
BEGIN
  IF p_bsn IS NULL THEN
    RETURN false;
  END IF;

  -- Verwijder alle niet-cijfers. Moet exact 9 cijfers opleveren.
  v_digits := regexp_replace(p_bsn, '[^0-9]', '', 'g');
  IF length(v_digits) <> 9 THEN
    RETURN false;
  END IF;

  -- Elfproef: 9*a + 8*b + 7*c + 6*d + 5*e + 4*f + 3*g + 2*h - 1*i
  FOR v_i IN 1..8 LOOP
    v_sum := v_sum + (substring(v_digits FROM v_i FOR 1))::int * (10 - v_i);
  END LOOP;
  v_sum := v_sum - (substring(v_digits FROM 9 FOR 1))::int;

  RETURN (v_sum % 11) = 0;
END;
$$;

COMMENT ON FUNCTION public.is_valid_bsn(text) IS
  'Controleer een Burgerservicenummer via de elfproef. NULL en alles wat niet exact 9 cijfers bevat is ongeldig. Gespiegeld aan isValidBsn in driverSchema.ts.';

-- ─── 2. IBAN validator (mod-97) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_valid_iban(p_iban text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_clean      text;
  v_rearranged text;
  v_numeric    text := '';
  v_ch         text;
  v_code       integer;
  v_i          integer;
  v_remainder  bigint := 0;
  v_block      text;
BEGIN
  IF p_iban IS NULL THEN
    RETURN false;
  END IF;

  -- Normaliseer: spaties weg, uppercase.
  v_clean := upper(regexp_replace(p_iban, '\s+', '', 'g'));

  -- Formaat: 2 letters, 2 cijfers, 8..30 alfanumerieke tekens.
  IF v_clean !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{8,30}$' THEN
    RETURN false;
  END IF;

  -- Verplaats eerste 4 tekens naar het eind.
  v_rearranged := substring(v_clean FROM 5) || substring(v_clean FROM 1 FOR 4);

  -- Letters A..Z vervangen door 10..35, cijfers blijven cijfers.
  FOR v_i IN 1..length(v_rearranged) LOOP
    v_ch := substring(v_rearranged FROM v_i FOR 1);
    IF v_ch ~ '[A-Z]' THEN
      v_code := ascii(v_ch) - 55;
      v_numeric := v_numeric || v_code::text;
    ELSE
      v_numeric := v_numeric || v_ch;
    END IF;
  END LOOP;

  -- Stapsgewijze mod-97 in blokken om overflow te voorkomen.
  v_i := 1;
  WHILE v_i <= length(v_numeric) LOOP
    v_block := v_remainder::text || substring(v_numeric FROM v_i FOR 7);
    v_remainder := v_block::bigint % 97;
    v_i := v_i + 7;
  END LOOP;

  RETURN v_remainder = 1;
END;
$$;

COMMENT ON FUNCTION public.is_valid_iban(text) IS
  'Controleer een IBAN via mod-97. Accepteert spaties en case-insensitive invoer. Gespiegeld aan isValidIban in driverSchema.ts.';

-- ─── 3. CHECK-constraints op drivers ─────────────────────────────────
-- NULL en lege strings zijn expliciet toegestaan zodat bestaande rijen
-- zonder BSN of IBAN niet breken. NOT VALID zorgt dat oude, mogelijk
-- ongeldige waarden niet in één klap de migratie laten falen.

ALTER TABLE public.drivers
  DROP CONSTRAINT IF EXISTS drivers_bsn_valid_chk;
ALTER TABLE public.drivers
  ADD CONSTRAINT drivers_bsn_valid_chk
  CHECK (
    bsn IS NULL
    OR btrim(bsn) = ''
    OR public.is_valid_bsn(bsn)
  ) NOT VALID;

ALTER TABLE public.drivers
  DROP CONSTRAINT IF EXISTS drivers_iban_valid_chk;
ALTER TABLE public.drivers
  ADD CONSTRAINT drivers_iban_valid_chk
  CHECK (
    iban IS NULL
    OR btrim(iban) = ''
    OR public.is_valid_iban(iban)
  ) NOT VALID;

-- ─── ROLLBACK ────────────────────────────────────────────────────────
-- ALTER TABLE public.drivers DROP CONSTRAINT IF EXISTS drivers_iban_valid_chk;
-- ALTER TABLE public.drivers DROP CONSTRAINT IF EXISTS drivers_bsn_valid_chk;
-- DROP FUNCTION IF EXISTS public.is_valid_iban(text);
-- DROP FUNCTION IF EXISTS public.is_valid_bsn(text);
