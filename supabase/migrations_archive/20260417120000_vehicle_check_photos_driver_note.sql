-- REQ-21.4: chauffeur kan AI-beschrijving corrigeren voor submit.
-- Originele ai_description blijft ongewijzigd (audit trail).
-- driver_note bevat de eventuele correctie van de chauffeur.
ALTER TABLE vehicle_check_photos
  ADD COLUMN IF NOT EXISTS driver_note TEXT;

COMMENT ON COLUMN vehicle_check_photos.driver_note
  IS 'Optionele correctie/aanvulling door de chauffeur op de AI-beschrijving.';
