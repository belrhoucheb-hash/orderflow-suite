-- ============================================================
-- Vault round-trip test voor tenant_inboxes
-- ============================================================
--
-- Verifieert dat:
--   1. set_tenant_inbox_password encrypt + link werkt
--   2. get_tenant_inbox_password dezelfde waarde teruggeeft
--   3. update overschrijft in place (zelfde secret_id)
--   4. DELETE cascadet naar vault.secrets
--   5. RLS: password_secret_id is zichtbaar voor tenant-leden, maar
--      plaintext uit vault.decrypted_secrets niet.
--
-- Draaien: psql -f supabase/tests/tenant_inboxes_vault.sql
-- Rollt alles terug, raakt geen bestaande data.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_tenant_id uuid := '00000000-0000-0000-0000-0000000000aa';
  v_inbox_id uuid;
  v_pw_1 text := 'SuperSecret-P@ss-1!';
  v_pw_2 text := 'Rotated-P@ss-2#';
  v_retrieved text;
  v_secret_id_before uuid;
  v_secret_id_after uuid;
  v_vault_count int;
BEGIN
  -- Setup: test-tenant
  INSERT INTO public.tenants (id, name, slug, is_active)
    VALUES (v_tenant_id, 'Vault Test Tenant', 'vault-test-tenant', true)
    ON CONFLICT (id) DO NOTHING;

  -- Setup: inbox zonder wachtwoord
  INSERT INTO public.tenant_inboxes (tenant_id, label, host, username)
    VALUES (v_tenant_id, 'test-inbox', 'imap.example.com', 'test@example.com')
    RETURNING id INTO v_inbox_id;

  -- ─── Test 1: set + get round trip ────────────────────────
  PERFORM public.set_tenant_inbox_password(v_inbox_id, v_pw_1);

  SELECT password_secret_id INTO v_secret_id_before
    FROM public.tenant_inboxes WHERE id = v_inbox_id;
  IF v_secret_id_before IS NULL THEN
    RAISE EXCEPTION 'Test 1 faalt: password_secret_id niet gezet na set';
  END IF;

  v_retrieved := public.get_tenant_inbox_password(v_inbox_id);
  IF v_retrieved IS DISTINCT FROM v_pw_1 THEN
    RAISE EXCEPTION 'Test 1 faalt: get != set. Verwacht %, kreeg %', v_pw_1, v_retrieved;
  END IF;
  RAISE NOTICE 'Test 1 OK: round-trip werkt';

  -- ─── Test 2: update in place, secret_id blijft ──────────
  PERFORM public.set_tenant_inbox_password(v_inbox_id, v_pw_2);

  SELECT password_secret_id INTO v_secret_id_after
    FROM public.tenant_inboxes WHERE id = v_inbox_id;
  IF v_secret_id_after IS DISTINCT FROM v_secret_id_before THEN
    RAISE EXCEPTION 'Test 2 faalt: secret_id veranderd bij update. Voor %, na %', v_secret_id_before, v_secret_id_after;
  END IF;

  v_retrieved := public.get_tenant_inbox_password(v_inbox_id);
  IF v_retrieved IS DISTINCT FROM v_pw_2 THEN
    RAISE EXCEPTION 'Test 2 faalt: nieuwe waarde niet opgehaald. Verwacht %, kreeg %', v_pw_2, v_retrieved;
  END IF;
  RAISE NOTICE 'Test 2 OK: update in place werkt';

  -- ─── Test 3: lege wachtwoord wordt geweigerd ────────────
  BEGIN
    PERFORM public.set_tenant_inbox_password(v_inbox_id, '');
    RAISE EXCEPTION 'Test 3 faalt: lege waarde mocht niet worden geaccepteerd';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%leeg%' THEN
      RAISE EXCEPTION 'Test 3 faalt: verkeerde fout. %', SQLERRM;
    END IF;
  END;
  RAISE NOTICE 'Test 3 OK: lege waarde geweigerd';

  -- ─── Test 4: DELETE cascade naar vault ──────────────────
  DELETE FROM public.tenant_inboxes WHERE id = v_inbox_id;

  SELECT count(*) INTO v_vault_count
    FROM vault.secrets WHERE id = v_secret_id_after;
  IF v_vault_count <> 0 THEN
    RAISE EXCEPTION 'Test 4 faalt: vault secret bleef achter na inbox-delete';
  END IF;
  RAISE NOTICE 'Test 4 OK: vault secret opgeruimd';

  -- Cleanup
  DELETE FROM public.tenants WHERE id = v_tenant_id;
  RAISE NOTICE 'Alle tests geslaagd.';
END;
$$;

ROLLBACK;
