-- Meerdere facturatie-emailadressen per klant. Tot nu toe was er alleen
-- een enkel billing_email-veld; sommige klanten willen facturen naar
-- meerdere adressen (administratie + inkoop + CFO, enz.).
--
-- Nieuwe kolom als array van tekst, default lege array. Bestaande
-- waardes worden eenmalig overgezet naar billing_emails zodat niets
-- verloren gaat. billing_email blijft bestaan als "primair" veld
-- voor back-compat met de facturatie-flow; UI kan later volledig
-- omschakelen naar het array-veld.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS billing_emails text[] NOT NULL DEFAULT '{}';

UPDATE public.clients
SET billing_emails = ARRAY[trim(billing_email)]
WHERE billing_email IS NOT NULL
  AND trim(billing_email) <> ''
  AND COALESCE(array_length(billing_emails, 1), 0) = 0;

COMMENT ON COLUMN public.clients.billing_emails IS
  'Alle facturatie-emailadressen voor deze klant. billing_emails[1] = primair, gekopieerd naar billing_email voor back-compat.';

-- ─── ROLLBACK ────────────────────────────────────────────────────────
-- ALTER TABLE public.clients DROP COLUMN IF EXISTS billing_emails;
