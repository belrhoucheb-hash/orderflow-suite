-- Compliance Sprint: API, integrations & NIS2 operations foundation.
--
-- Adds API-token lifecycle controls: owner, mandatory expiry, review due date,
-- rotation requirement and append-only lifecycle evidence.

ALTER TABLE public.api_tokens
  ADD COLUMN IF NOT EXISTS owner_user_id UUID,
  ADD COLUMN IF NOT EXISTS rotation_required_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_reviewed_by UUID,
  ADD COLUMN IF NOT EXISTS risk_level TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS usage_anomaly_count INTEGER NOT NULL DEFAULT 0;

UPDATE public.api_tokens
SET
  owner_user_id = COALESCE(
    owner_user_id,
    created_by,
    (
      SELECT tm.user_id
      FROM public.tenant_members tm
      WHERE tm.tenant_id = api_tokens.tenant_id
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
      ORDER BY CASE WHEN tm.role = 'owner' THEN 0 ELSE 1 END, tm.created_at
      LIMIT 1
    )
  ),
  expires_at = COALESCE(expires_at, created_at + interval '365 days'),
  review_due_at = COALESCE(review_due_at, created_at + interval '90 days'),
  rotation_required_at = COALESCE(rotation_required_at, created_at + interval '365 days')
WHERE owner_user_id IS NULL
   OR expires_at IS NULL
   OR review_due_at IS NULL
   OR rotation_required_at IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.api_tokens WHERE owner_user_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot enforce API token owner: existing tokens without tenant owner/admin remain';
  END IF;
END $$;

ALTER TABLE public.api_tokens
  ALTER COLUMN owner_user_id SET NOT NULL,
  ALTER COLUMN expires_at SET NOT NULL,
  ALTER COLUMN review_due_at SET NOT NULL,
  ALTER COLUMN rotation_required_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'api_tokens_owner_user_id_fkey'
      AND conrelid = 'public.api_tokens'::regclass
  ) THEN
    ALTER TABLE public.api_tokens
      ADD CONSTRAINT api_tokens_owner_user_id_fkey
      FOREIGN KEY (owner_user_id)
      REFERENCES auth.users(id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'api_tokens_last_reviewed_by_fkey'
      AND conrelid = 'public.api_tokens'::regclass
  ) THEN
    ALTER TABLE public.api_tokens
      ADD CONSTRAINT api_tokens_last_reviewed_by_fkey
      FOREIGN KEY (last_reviewed_by)
      REFERENCES auth.users(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'api_tokens_risk_level_chk'
      AND conrelid = 'public.api_tokens'::regclass
  ) THEN
    ALTER TABLE public.api_tokens
      ADD CONSTRAINT api_tokens_risk_level_chk
      CHECK (risk_level IN ('low', 'standard', 'high', 'critical'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'api_tokens_expiry_window_chk'
      AND conrelid = 'public.api_tokens'::regclass
  ) THEN
    ALTER TABLE public.api_tokens
      ADD CONSTRAINT api_tokens_expiry_window_chk
      CHECK (expires_at <= created_at + interval '366 days');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_api_tokens_lifecycle_due
  ON public.api_tokens (tenant_id, revoked_at, review_due_at, rotation_required_at, expires_at);

CREATE INDEX IF NOT EXISTS idx_api_tokens_owner
  ON public.api_tokens (tenant_id, owner_user_id, revoked_at);

COMMENT ON COLUMN public.api_tokens.owner_user_id IS
  'Named accountable owner for the token. Required for NIS2/API governance.';

COMMENT ON COLUMN public.api_tokens.review_due_at IS
  'Next access review deadline for this token.';

COMMENT ON COLUMN public.api_tokens.rotation_required_at IS
  'Deadline after which this token must be rotated and cannot be accepted by the API gateway.';

CREATE TABLE IF NOT EXISTS public.api_token_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  token_id UUID NOT NULL REFERENCES public.api_tokens(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_id UUID,
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT api_token_events_type_chk CHECK (
    event_type IN ('created', 'reviewed', 'rotation_required', 'rotated', 'revoked', 'anomaly_detected')
  )
);

CREATE INDEX IF NOT EXISTS idx_api_token_events_token_created
  ON public.api_token_events (token_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_token_events_tenant_created
  ON public.api_token_events (tenant_id, created_at DESC);

ALTER TABLE public.api_token_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "api_token_events tenant admin read" ON public.api_token_events;
CREATE POLICY "api_token_events tenant admin read"
  ON public.api_token_events
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = api_token_events.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "api_token_events service role" ON public.api_token_events;
CREATE POLICY "api_token_events service role"
  ON public.api_token_events
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON public.api_token_events TO authenticated;
GRANT ALL ON public.api_token_events TO service_role;

COMMENT ON TABLE public.api_token_events IS
  'Append-only lifecycle evidence for API-token reviews, rotations, revocations and anomalies.';

CREATE OR REPLACE FUNCTION public.record_api_token_review(
  p_token_id UUID,
  p_review_note TEXT DEFAULT NULL,
  p_next_review_days INTEGER DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID := public.current_tenant_id();
  v_next_review_days INTEGER := LEAST(GREATEST(COALESCE(p_next_review_days, 90), 1), 180);
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Missing tenant context';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = v_tenant_id
      AND tm.user_id = auth.uid()
      AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
  ) THEN
    RAISE EXCEPTION 'Insufficient privileges for API token review';
  END IF;

  UPDATE public.api_tokens
  SET
    last_reviewed_at = now(),
    last_reviewed_by = auth.uid(),
    review_due_at = now() + make_interval(days => v_next_review_days)
  WHERE tenant_id = v_tenant_id
    AND id = p_token_id
    AND revoked_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active API token not found in tenant';
  END IF;

  INSERT INTO public.api_token_events (
    tenant_id,
    token_id,
    event_type,
    actor_id,
    note,
    metadata
  ) VALUES (
    v_tenant_id,
    p_token_id,
    'reviewed',
    auth.uid(),
    p_review_note,
    jsonb_build_object('next_review_days', v_next_review_days)
  );

  RETURN jsonb_build_object(
    'token_id', p_token_id,
    'status', 'reviewed',
    'review_due_at', now() + make_interval(days => v_next_review_days)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_api_token_review(UUID, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_api_token_review(UUID, TEXT, INTEGER) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mark_api_token_rotation_required(
  p_token_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID := public.current_tenant_id();
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Missing tenant context';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = v_tenant_id
      AND tm.user_id = auth.uid()
      AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
  ) THEN
    RAISE EXCEPTION 'Insufficient privileges for API token rotation';
  END IF;

  UPDATE public.api_tokens
  SET rotation_required_at = now()
  WHERE tenant_id = v_tenant_id
    AND id = p_token_id
    AND revoked_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active API token not found in tenant';
  END IF;

  INSERT INTO public.api_token_events (
    tenant_id,
    token_id,
    event_type,
    actor_id,
    note,
    metadata
  ) VALUES (
    v_tenant_id,
    p_token_id,
    'rotation_required',
    auth.uid(),
    p_reason,
    jsonb_build_object('required_at', now())
  );

  RETURN jsonb_build_object(
    'token_id', p_token_id,
    'status', 'rotation_required'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_api_token_rotation_required(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_api_token_rotation_required(UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.log_api_token_event_from_gateway(
  p_token_id UUID,
  p_event_type TEXT,
  p_note TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token public.api_tokens%ROWTYPE;
  v_event_id UUID;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'log_api_token_event_from_gateway requires service_role';
  END IF;

  SELECT *
  INTO v_token
  FROM public.api_tokens
  WHERE id = p_token_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'API token not found';
  END IF;

  INSERT INTO public.api_token_events (
    tenant_id,
    token_id,
    event_type,
    actor_id,
    note,
    metadata
  ) VALUES (
    v_token.tenant_id,
    p_token_id,
    p_event_type,
    NULL,
    p_note,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_api_token_event_from_gateway(UUID, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_api_token_event_from_gateway(UUID, TEXT, TEXT, JSONB) TO service_role;
