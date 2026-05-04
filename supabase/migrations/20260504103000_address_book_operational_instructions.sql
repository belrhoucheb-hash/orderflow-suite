-- Store reusable operational instructions per customer location.
-- New Order writes these fields when a planner uses Google or manual input,
-- so planning and the chauffeur portal can reuse fixed location rules.

ALTER TABLE public.address_book
  ADD COLUMN IF NOT EXISTS driver_instructions text,
  ADD COLUMN IF NOT EXISTS requires_tail_lift boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS temperature_controlled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS photo_required boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_address_book_tenant_operational_flags
  ON public.address_book (tenant_id, requires_tail_lift, temperature_controlled, photo_required);

CREATE OR REPLACE FUNCTION public.upsert_address_book_entry(p_entry jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_existing public.address_book%ROWTYPE;
  v_row public.address_book%ROWTYPE;
  v_aliases text[];
  v_next_company text;
  v_next_key text;
  v_next_acronym text;
  v_existing_alias_match boolean;
BEGIN
  v_tenant := public.get_user_tenant_id();
  IF v_tenant IS NULL THEN
    v_tenant := NULLIF(p_entry->>'tenant_id', '')::uuid;
  END IF;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Geen actieve tenant gevonden';
  END IF;

  IF NULLIF(p_entry->>'tenant_id', '') IS NOT NULL
     AND (p_entry->>'tenant_id')::uuid <> v_tenant THEN
    RAISE EXCEPTION 'Geen toegang tot adresboek van andere tenant';
  END IF;

  v_aliases := public.normalize_address_book_aliases(
    coalesce(
      ARRAY(SELECT jsonb_array_elements_text(coalesce(p_entry->'aliases', '[]'::jsonb))),
      ARRAY[]::text[]
    )
  );
  v_next_company := coalesce(NULLIF(p_entry->>'company_name', ''), NULLIF(p_entry->>'label', ''), p_entry->>'address');
  v_next_key := public.normalize_address_book_company_key(v_next_company);
  v_next_acronym := public.address_book_company_acronym(v_next_company);

  SELECT ab.* INTO v_existing
  FROM public.address_book ab
  WHERE ab.tenant_id = v_tenant
    AND ab.normalized_key = p_entry->>'normalized_key'
    AND (
      ab.normalized_company_key = p_entry->>'normalized_company_key'
      OR ab.normalized_company_key = v_next_key
      OR ab.normalized_company_key = v_next_acronym
      OR public.address_book_company_acronym(ab.company_name) = v_next_key
      OR EXISTS (
        SELECT 1
        FROM unnest(coalesce(ab.aliases, ARRAY[]::text[])) existing_alias(alias)
        WHERE public.normalize_address_book_company_key(existing_alias.alias) = v_next_key
           OR public.normalize_address_book_company_key(existing_alias.alias) = ANY (
             SELECT public.normalize_address_book_company_key(next_alias)
             FROM unnest(v_aliases) next_alias
           )
      )
    )
  ORDER BY ab.usage_count DESC, ab.updated_at DESC
  LIMIT 1;

  IF FOUND THEN
    v_existing_alias_match := v_existing.normalized_company_key <> v_next_key;

    UPDATE public.address_book
    SET
      address = p_entry->>'address',
      street = p_entry->>'street',
      house_number = coalesce(p_entry->>'house_number', ''),
      house_number_suffix = coalesce(p_entry->>'house_number_suffix', ''),
      zipcode = upper(coalesce(p_entry->>'zipcode', '')),
      city = coalesce(p_entry->>'city', ''),
      country = upper(coalesce(p_entry->>'country', 'NL')),
      lat = NULLIF(p_entry->>'lat', '')::double precision,
      lng = NULLIF(p_entry->>'lng', '')::double precision,
      coords_manual = coalesce((p_entry->>'coords_manual')::boolean, false),
      location_type = CASE
        WHEN address_book.location_type = coalesce(p_entry->>'location_type', 'both') THEN address_book.location_type
        ELSE 'both'
      END,
      notes = coalesce(NULLIF(p_entry->>'notes', ''), address_book.notes),
      driver_instructions = coalesce(NULLIF(p_entry->>'driver_instructions', ''), address_book.driver_instructions),
      requires_tail_lift = address_book.requires_tail_lift OR coalesce((p_entry->>'requires_tail_lift')::boolean, false),
      temperature_controlled = address_book.temperature_controlled OR coalesce((p_entry->>'temperature_controlled')::boolean, false),
      photo_required = address_book.photo_required OR coalesce((p_entry->>'photo_required')::boolean, false),
      time_window_start = NULLIF(p_entry->>'time_window_start', ''),
      time_window_end = NULLIF(p_entry->>'time_window_end', ''),
      aliases = public.normalize_address_book_aliases(
        coalesce(address_book.aliases, ARRAY[]::text[])
        || v_aliases
        || CASE WHEN v_existing_alias_match THEN ARRAY[v_next_company] ELSE ARRAY[]::text[] END
      ),
      source = coalesce(NULLIF(p_entry->>'source', ''), address_book.source),
      usage_count = address_book.usage_count + 1,
      last_used_at = now()
    WHERE id = v_existing.id
    RETURNING * INTO v_row;

    RETURN jsonb_build_object(
      'action', 'updated',
      'row', to_jsonb(v_row),
      'matched_name', coalesce(v_existing.company_name, v_existing.label),
      'message', coalesce(v_existing.company_name, v_existing.label) || ' is bijgewerkt in het adresboek.'
    );
  END IF;

  INSERT INTO public.address_book (
    tenant_id, label, company_name, aliases, address, street, house_number,
    house_number_suffix, zipcode, city, country, lat, lng, coords_manual,
    location_type, notes, driver_instructions, requires_tail_lift,
    temperature_controlled, photo_required, time_window_start, time_window_end,
    normalized_company_key, normalized_key, source, usage_count, last_used_at
  )
  VALUES (
    v_tenant,
    p_entry->>'label',
    p_entry->>'company_name',
    v_aliases,
    p_entry->>'address',
    p_entry->>'street',
    coalesce(p_entry->>'house_number', ''),
    coalesce(p_entry->>'house_number_suffix', ''),
    upper(coalesce(p_entry->>'zipcode', '')),
    coalesce(p_entry->>'city', ''),
    upper(coalesce(p_entry->>'country', 'NL')),
    NULLIF(p_entry->>'lat', '')::double precision,
    NULLIF(p_entry->>'lng', '')::double precision,
    coalesce((p_entry->>'coords_manual')::boolean, false),
    coalesce(p_entry->>'location_type', 'both'),
    NULLIF(p_entry->>'notes', ''),
    NULLIF(p_entry->>'driver_instructions', ''),
    coalesce((p_entry->>'requires_tail_lift')::boolean, false),
    coalesce((p_entry->>'temperature_controlled')::boolean, false),
    coalesce((p_entry->>'photo_required')::boolean, false),
    NULLIF(p_entry->>'time_window_start', ''),
    NULLIF(p_entry->>'time_window_end', ''),
    p_entry->>'normalized_company_key',
    p_entry->>'normalized_key',
    coalesce(NULLIF(p_entry->>'source', ''), 'manual'),
    1,
    now()
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'action', 'inserted',
    'row', to_jsonb(v_row),
    'matched_name', null,
    'message', coalesce(v_row.company_name, v_row.label) || ' is toegevoegd aan het adresboek.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_address_book_entry(jsonb) TO authenticated;

COMMENT ON COLUMN public.address_book.driver_instructions IS
  'Vaste instructies voor chauffeur/planning op deze klantlocatie.';
COMMENT ON COLUMN public.address_book.photo_required IS
  'Geeft aan dat chauffeur foto bewijs moet maken bij deze locatie.';
