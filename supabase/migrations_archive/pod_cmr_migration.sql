-- ============================================================
-- Migration: Proof of Delivery (PoD) + CMR/Vrachtbrief columns
-- Run this in the Supabase SQL Editor
-- ============================================================

-- ─── 1. PoD Columns on orders ──────────────────────────────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pod_signature_url TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pod_photos JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pod_signed_by TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pod_signed_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pod_notes TEXT;

COMMENT ON COLUMN public.orders.pod_signature_url IS 'URL to the saved signature PNG in Supabase Storage';
COMMENT ON COLUMN public.orders.pod_photos IS 'JSON array of photo URLs uploaded as proof of delivery';
COMMENT ON COLUMN public.orders.pod_signed_by IS 'Name of the person who signed for receipt';
COMMENT ON COLUMN public.orders.pod_signed_at IS 'Timestamp when the PoD was signed';
COMMENT ON COLUMN public.orders.pod_notes IS 'Delivery notes (damage, deviations, etc.)';

-- ─── 2. CMR Columns on orders ──────────────────────────────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cmr_number TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cmr_generated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.orders.cmr_number IS 'Unique CMR waybill number (e.g. RC-CMR-2026-0001)';
COMMENT ON COLUMN public.orders.cmr_generated_at IS 'Timestamp when CMR document was generated';

-- Index for CMR lookup
CREATE INDEX IF NOT EXISTS idx_orders_cmr_number ON public.orders(cmr_number) WHERE cmr_number IS NOT NULL;

-- ─── 3. Storage bucket for PoD files ───────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('pod-files', 'pod-files', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access for pod-files
CREATE POLICY "Public read access for pod files"
ON storage.objects FOR SELECT
USING (bucket_id = 'pod-files');

-- Authenticated upload for pod-files
CREATE POLICY "Authenticated users can upload pod files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'pod-files');

-- Authenticated update for pod-files
CREATE POLICY "Authenticated users can update pod files"
ON storage.objects FOR UPDATE
USING (bucket_id = 'pod-files');

-- Authenticated delete for pod-files
CREATE POLICY "Authenticated users can delete pod files"
ON storage.objects FOR DELETE
USING (bucket_id = 'pod-files');
