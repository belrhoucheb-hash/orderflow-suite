-- Optionele at-rest encryption voor integration_credentials.credentials.
--
-- Achtergrond: de geheime velden (clientKey, clientSecret, accessToken, ...)
-- worden al sinds 20260429030000_secret_hardening.sql in Supabase Vault gezet
-- en uit de jsonb-kolom verwijderd. De runtime-RPC haalt ze on-demand op via
-- vault.decrypted_secrets. De resterende JSONB bevat dus alleen niet-gevoelige
-- configuratie (administratieId, mockMode, redirectUri, ...) plus de
-- *SecretId-pointers naar Vault.
--
-- Deze migratie voegt een aanvullende defense-in-depth-laag toe: een bytea-
-- kolom met de hele jsonb pgsodium-encrypted, zodat een eventuele backup-leak
-- van de tabel niet direct de configuratie-structuur lekt.
--
-- pgsodium is op gehoste Supabase tegenwoordig deprecated/optioneel. We
-- proberen de extension te enablen; lukt het niet, dan slaan we de hele
-- backfill over en blijft de kolom NULL. De runtime gebruikt in dat geval
-- gewoon de bestaande jsonb-kolom (met Vault-resolved secrets).

-- 1. Probeer pgsodium te enablen. NIET fatal als het niet kan.
DO $pgsodium_enable$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pgsodium;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pgsodium niet beschikbaar (%): credentials_encrypted blijft NULL tot manueel ingeschakeld', SQLERRM;
  END;
END
$pgsodium_enable$;

-- 2. Voeg de encrypted-kolom toe (altijd, ongeacht pgsodium-beschikbaarheid).
ALTER TABLE public.integration_credentials
  ADD COLUMN IF NOT EXISTS credentials_encrypted bytea NULL;

COMMENT ON COLUMN public.integration_credentials.credentials_encrypted IS
  'Optionele pgsodium-encrypted versie van credentials. NULL als pgsodium niet beschikbaar of nog niet gebackfilld. Edge functions vallen terug op credentials-jsonb wanneer leeg. DEPRECATED: zal credentials-jsonb vervangen zodra alle edge functions zijn omgezet.';

COMMENT ON COLUMN public.integration_credentials.credentials IS
  'DEPRECATED: jsonb-versie van credentials. Wordt op termijn vervangen door credentials_encrypted. Geheime velden staan al in Vault, deze kolom bevat alleen niet-gevoelige config + SecretId-pointers.';

-- 3. Encrypt-helper en backfill, alleen als pgsodium echt geladen is.
--    We bouwen de helper en draaien de backfill binnen één DO-block dat
--    via dynamic-SQL alle pgsodium-calls doet, zodat het block zelfs op
--    omgevingen zonder pgsodium parseerbaar blijft.
DO $backfill$
DECLARE
  v_has_pgsodium boolean;
  v_row record;
  v_key bytea;
  v_nonce bytea;
  v_cipher bytea;
  v_count int := 0;
  v_errors int := 0;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgsodium')
    INTO v_has_pgsodium;

  IF NOT v_has_pgsodium THEN
    RAISE NOTICE 'pgsodium ontbreekt, backfill overgeslagen, kolom blijft NULL';
    RETURN;
  END IF;

  FOR v_row IN
    SELECT id, tenant_id, credentials
    FROM public.integration_credentials
    WHERE credentials_encrypted IS NULL
      AND credentials IS NOT NULL
      AND credentials <> '{}'::jsonb
  LOOP
    BEGIN
      -- Tenant-scoped 32-byte key via crypto_generichash van het uuid-bytes.
      EXECUTE 'SELECT pgsodium.crypto_generichash($1, 32)'
        INTO v_key
        USING decode(replace(v_row.tenant_id::text, '-', ''), 'hex');

      -- 24-byte random nonce.
      EXECUTE 'SELECT pgsodium.randombytes_buf(24)' INTO v_nonce;

      -- crypto_secretbox levert ciphertext; we slaan nonce || ciphertext op
      -- zodat we bij decode de nonce gewoon kunnen splitsen.
      EXECUTE 'SELECT pgsodium.crypto_secretbox($1, $2, $3)'
        INTO v_cipher
        USING convert_to(v_row.credentials::text, 'UTF8'), v_nonce, v_key;

      UPDATE public.integration_credentials
         SET credentials_encrypted = v_nonce || v_cipher
       WHERE id = v_row.id;

      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      RAISE NOTICE 'Backfill mislukt voor %: %', v_row.id, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'integration_credentials backfill: % rijen versleuteld, % fouten', v_count, v_errors;
END
$backfill$;

-- --- ROLLBACK -------------------------------------------------------
-- ALTER TABLE public.integration_credentials DROP COLUMN IF EXISTS credentials_encrypted;
-- COMMENT ON COLUMN public.integration_credentials.credentials IS NULL;
