-- Klant-broadcast deduplicatie. Zowel de bestaande DB-trigger
-- `trg_notify_driver_arrived` als de nieuwe Edge Function
-- `notify-customer-stop-status` versturen een notificatie bij AANGEKOMEN.
-- Deze kolom laat de Edge Function de laatste verzonden status per stop
-- onthouden zodat een herhaalde aanroep geen tweede bericht oplevert.
-- De DB-trigger blijft ongewijzigd, want die bedient nog het legacy
-- chauffeur-app-pad; de nieuwe pipeline dedupt op zichzelf.

ALTER TABLE public.trip_stops
  ADD COLUMN IF NOT EXISTS last_notified_status text NULL;

COMMENT ON COLUMN public.trip_stops.last_notified_status IS
  'Laatste status waarvoor een klant-notificatie is verstuurd via notify-customer-stop-status. NULL = nog niets verstuurd.';
