-- Herhaal expliciet de gewenste adresboek-identiteit voor omgevingen waar
-- de eerste fysieke-adres-unique-index nog actief is.

ALTER TABLE public.address_book
  ADD COLUMN IF NOT EXISTS normalized_company_key text;

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.normalize_address_book_company_key(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              lower(extensions.unaccent(coalesce(value, ''))),
              '[^a-z0-9]+',
              ' ',
              'g'
            ),
            '(^| )(b v|bv|n v|nv|v o f|vof|c v|cv|ltd|llc|inc|gmbh|sa|sarl|plc)( |$)',
            ' ',
            'g'
          ),
          '[[:space:]]+',
          ' ',
          'g'
        ),
        '(^| )(b v|bv|n v|nv|v o f|vof|c v|cv|ltd|llc|inc|gmbh|sa|sarl|plc)( |$)',
        ' ',
        'g'
      ),
      '[[:space:]]+',
      ' ',
      'g'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.set_address_book_company_key()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.normalized_company_key := COALESCE(
    NULLIF(public.normalize_address_book_company_key(COALESCE(NEW.company_name, NEW.label, NEW.address)), ''),
    NEW.normalized_key
  );
  RETURN NEW;
END;
$$;

UPDATE public.address_book
SET normalized_company_key = COALESCE(
  NULLIF(public.normalize_address_book_company_key(COALESCE(company_name, label, address)), ''),
  normalized_key
)
WHERE normalized_company_key IS NULL OR normalized_company_key = '';

ALTER TABLE public.address_book
  ALTER COLUMN normalized_company_key SET DEFAULT '',
  ALTER COLUMN normalized_company_key SET NOT NULL;

DROP INDEX IF EXISTS public.address_book_tenant_normalized_key_uniq;
DROP INDEX IF EXISTS address_book_tenant_normalized_key_uniq;

DO $$
DECLARE
  idx record;
  tenant_att int2;
  key_att int2;
BEGIN
  SELECT attnum INTO tenant_att
  FROM pg_attribute
  WHERE attrelid = 'public.address_book'::regclass
    AND attname = 'tenant_id';

  SELECT attnum INTO key_att
  FROM pg_attribute
  WHERE attrelid = 'public.address_book'::regclass
    AND attname = 'normalized_key';

  FOR idx IN
    SELECT indexrelid::regclass AS index_name
    FROM pg_index
    WHERE indrelid = 'public.address_book'::regclass
      AND indisunique = true
      AND indkey::text = tenant_att::text || ' ' || key_att::text
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %s', idx.index_name);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS address_book_tenant_company_address_uniq
  ON public.address_book (tenant_id, normalized_company_key, normalized_key);

CREATE INDEX IF NOT EXISTS idx_address_book_tenant_address_key
  ON public.address_book (tenant_id, normalized_key);

DROP TRIGGER IF EXISTS set_address_book_company_key ON public.address_book;
CREATE TRIGGER set_address_book_company_key
  BEFORE INSERT OR UPDATE OF company_name, label, address, normalized_key, normalized_company_key
  ON public.address_book
  FOR EACH ROW EXECUTE FUNCTION public.set_address_book_company_key();
