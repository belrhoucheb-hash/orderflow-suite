-- Voeg een optionele kolom toe waarin we het storage-pad van de gegenereerde
-- CMR-PDF parkeren. De PDF zelf staat in de private POD-bucket; de URL wordt
-- hier vastgelegd zodat we 'm later kunnen downloaden of doorsturen.
ALTER TABLE "public"."proof_of_delivery"
  ADD COLUMN IF NOT EXISTS "cmr_pdf_url" text NULL;

COMMENT ON COLUMN "public"."proof_of_delivery"."cmr_pdf_url"
  IS 'Storage-pad (bucket pod-files) van de on-device gegenereerde CMR-PDF. NULL als de PDF-generatie niet beschikbaar of mislukt was.';
