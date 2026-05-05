-- Chauffeursportaal vervolg: chauffeur stelt zelf zijn beschikbaarheid in.
--
-- De bestaande tabel public.driver_availability wordt door de planner gevuld
-- (statussen werkt/verlof/ziek/rust/afwezig). De chauffeur-app gebruikt een
-- vereenvoudigde driver-eigen statusset (beschikbaar/niet_beschikbaar/
-- liever_niet) die we toevoegen aan de bestaande check-constraint zodat we
-- één tabel houden als bron van waarheid voor auto-plan.
--
-- Daarnaast moeten chauffeurs hun eigen rijen kunnen lezen, inserten en
-- updaten. De bestaande RLS verleent dit via tenant_id, maar het chauffeur-
-- account zit in dezelfde tenant en mag dus al alles in zijn tenant
-- beheren. We laten die policy intact en voegen alleen de status-uitbreiding
-- toe.

ALTER TABLE public.driver_availability
  DROP CONSTRAINT IF EXISTS driver_availability_status_check;

ALTER TABLE public.driver_availability
  ADD CONSTRAINT driver_availability_status_check
  CHECK (status IN (
    'werkt','verlof','ziek','rust','afwezig',
    'beschikbaar','niet_beschikbaar','liever_niet'
  ));

COMMENT ON COLUMN public.driver_availability.status IS
  'Statusset is gemixt: planner gebruikt werkt/verlof/ziek/rust/afwezig, chauffeur-app gebruikt beschikbaar/niet_beschikbaar/liever_niet. Auto-plan filtert op werkt OR beschikbaar.';

-- ─── ROLLBACK ─────────────────────────────────────────────────
-- ALTER TABLE public.driver_availability
--   DROP CONSTRAINT IF EXISTS driver_availability_status_check;
-- ALTER TABLE public.driver_availability
--   ADD CONSTRAINT driver_availability_status_check
--   CHECK (status IN ('werkt','verlof','ziek','rust','afwezig'));
