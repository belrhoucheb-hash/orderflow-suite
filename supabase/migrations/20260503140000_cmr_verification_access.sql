-- Compliance Sprint: CMR/eCMR verification access.
--
-- Adds a limited verification token and RPC for public/authority verification
-- without exposing the full transport dossier.

ALTER TABLE public.cmr_documents
  ADD COLUMN IF NOT EXISTS verification_token UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS verification_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS verification_view_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cmr_documents_verification_token
  ON public.cmr_documents (verification_token);

CREATE INDEX IF NOT EXISTS idx_cmr_documents_verification_enabled
  ON public.cmr_documents (tenant_id, verification_enabled, last_verified_at DESC);

COMMENT ON COLUMN public.cmr_documents.verification_token IS
  'Opaque token for limited CMR integrity verification links and QR codes.';

COMMENT ON COLUMN public.cmr_documents.verification_enabled IS
  'When false, public/authority verification for this CMR is disabled.';

CREATE OR REPLACE FUNCTION public.verify_cmr_document(
  p_verification_token UUID,
  p_expected_hash TEXT DEFAULT NULL,
  p_source TEXT DEFAULT 'verification-endpoint',
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_document public.cmr_documents%ROWTYPE;
  v_order_number INTEGER;
  v_hash_matches BOOLEAN;
BEGIN
  SELECT *
  INTO v_document
  FROM public.cmr_documents
  WHERE verification_token = p_verification_token
    AND verification_enabled = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valid', false,
      'status', 'not_found'
    );
  END IF;

  SELECT order_number
  INTO v_order_number
  FROM public.orders
  WHERE id = v_document.order_id
    AND tenant_id = v_document.tenant_id;

  v_hash_matches := p_expected_hash IS NULL OR lower(p_expected_hash) = v_document.document_hash;

  UPDATE public.cmr_documents
  SET
    verification_view_count = verification_view_count + 1,
    last_verified_at = now(),
    updated_at = now()
  WHERE id = v_document.id;

  INSERT INTO public.cmr_events (
    tenant_id,
    document_id,
    order_id,
    event_type,
    actor_id,
    metadata
  ) VALUES (
    v_document.tenant_id,
    v_document.id,
    v_document.order_id,
    'verified',
    NULL,
    jsonb_build_object(
      'source', COALESCE(p_source, 'verification-endpoint'),
      'hash_supplied', p_expected_hash IS NOT NULL,
      'hash_matches', v_hash_matches
    ) || COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN jsonb_build_object(
    'valid', true,
    'status', CASE WHEN v_hash_matches THEN 'verified' ELSE 'hash_mismatch' END,
    'hash_matches', v_hash_matches,
    'cmr_number', v_document.cmr_number,
    'order_number', v_order_number,
    'document_hash', v_document.document_hash,
    'current_version', v_document.current_version,
    'finalized_at', v_document.finalized_at,
    'verification_view_count', v_document.verification_view_count + 1
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_cmr_document(UUID, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_cmr_document(UUID, TEXT, TEXT, JSONB) TO service_role;

COMMENT ON FUNCTION public.verify_cmr_document(UUID, TEXT, TEXT, JSONB) IS
  'Limited CMR verification RPC for service-role Edge Functions. Returns no full dossier or personal data.';
