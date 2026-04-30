-- Herbereken bestaande adresboek-identiteiten met de actuele SQL-normalizer.
-- Dit maakt migrated rows gelijk aan nieuwe writes via de app/RPC.

UPDATE public.address_book
SET
  aliases = public.normalize_address_book_aliases(aliases),
  alias_search = coalesce((
    SELECT string_agg(public.normalize_address_book_company_key(alias), ' ')
    FROM unnest(public.normalize_address_book_aliases(aliases)) alias
  ), ''),
  normalized_company_key = COALESCE(
    NULLIF(public.normalize_address_book_company_key(COALESCE(company_name, label, address)), ''),
    normalized_key
  );
