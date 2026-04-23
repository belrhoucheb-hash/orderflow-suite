-- Meerdere e-mailadressen per klant voor betalingsherinneringen.
-- Gescheiden van billing_emails omdat sommige klanten de
-- herinneringen naar andere ontvangers willen (bijv. directe debiteur)
-- dan de factuur zelf (administratie + inkoop).

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS reminder_emails text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.clients.reminder_emails IS
  'E-mailadressen waar betalingsherinneringen naartoe worden gestuurd. Leeg = fallback op billing_emails.';

-- ─── ROLLBACK ────────────────────────────────────────────────────────
-- ALTER TABLE public.clients DROP COLUMN IF EXISTS reminder_emails;
