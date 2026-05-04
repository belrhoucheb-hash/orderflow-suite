-- Trip stops: optionele jsonb-kolom voor losse metadata zoals incident-id of
-- failure-context. Bestaande failure_reason-tekst blijft bestaan; deze kolom
-- voegt gestructureerde context toe zonder de schemas eromheen te raken.

ALTER TABLE public.trip_stops
  ADD COLUMN IF NOT EXISTS extra jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.trip_stops.extra IS
  'Vrije jsonb voor stop-metadata (incident_id, weiger-reden, etc).';
