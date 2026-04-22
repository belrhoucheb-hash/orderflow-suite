-- drivers.user_id koppelt een chauffeur aan een auth.users-account.
--
-- AuthContext doet bij elke login een lookup
--   supabase.from("drivers").select("id").eq("user_id", userId).single()
-- om te detecteren of de ingelogde user ook een chauffeur is
-- (isLinkedDriver). Zonder deze kolom crasht de query met
-- `column drivers.user_id does not exist`, wat via een kettingreactie
-- andere queries zoals de klantenlijst blokkeert.
--
-- Kantoor-chauffeurs zonder eigen login blijven NULL. Alleen chauffeurs
-- die zelf in het chauffeursportaal inloggen krijgen een user_id.

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_drivers_user_id
  ON public.drivers (user_id)
  WHERE user_id IS NOT NULL;

COMMENT ON COLUMN public.drivers.user_id IS
  'Optionele koppeling naar auth.users. NULL voor kantoor-chauffeurs zonder eigen login.';

-- ─── ROLLBACK ─────────────────────────────────────────────────
-- DROP INDEX IF EXISTS uniq_drivers_user_id;
-- ALTER TABLE public.drivers DROP COLUMN IF EXISTS user_id;
