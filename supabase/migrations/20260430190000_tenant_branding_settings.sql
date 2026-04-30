ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS branding_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.tenants.branding_settings IS
  'Uitbreidbare tenant-branding zoals logo-varianten, documentgegevens en portal-copy.';

