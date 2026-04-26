-- Hardening voor API-tokens en webhook-dispatch.
--
-- 1. API-tokens krijgen server-side scope-validatie zodat client-portal
--    users geen extra scopes via directe Supabase-calls kunnen injecteren.
-- 2. Test-webhooks krijgen een gerichte RPC die exact één subscription
--    target, in plaats van tenant-brede fan-out via emit_webhook_event.
-- 3. Webhook-deliveries worden atomisch geclaimd via een SECURITY DEFINER
--    functie zodat parallelle dispatcher-runs geen dubbele POSTs uitsturen.

-- ─── API token scope-validatie ───────────────────────────────────────

ALTER TABLE public.api_tokens
  DROP CONSTRAINT IF EXISTS api_tokens_scopes_allowed_chk;
ALTER TABLE public.api_tokens
  ADD CONSTRAINT api_tokens_scopes_allowed_chk
  CHECK (
    scopes <@ ARRAY[
      'orders:read',
      'orders:write',
      'trips:read',
      'invoices:read',
      'clients:read'
    ]::TEXT[]
  ) NOT VALID;

ALTER TABLE public.api_tokens
  DROP CONSTRAINT IF EXISTS api_tokens_client_scope_chk;
ALTER TABLE public.api_tokens
  ADD CONSTRAINT api_tokens_client_scope_chk
  CHECK (
    client_id IS NULL
    OR NOT (scopes && ARRAY['trips:read']::TEXT[])
  ) NOT VALID;

ALTER TABLE public.api_tokens
  VALIDATE CONSTRAINT api_tokens_scopes_allowed_chk;
ALTER TABLE public.api_tokens
  VALIDATE CONSTRAINT api_tokens_client_scope_chk;

COMMENT ON CONSTRAINT api_tokens_scopes_allowed_chk ON public.api_tokens IS
  'Scopes moeten binnen de expliciete whitelist blijven; nieuwe scopes vereisen een bewuste migratie.';

COMMENT ON CONSTRAINT api_tokens_client_scope_chk ON public.api_tokens IS
  'Klant-tokens mogen geen tenant-brede scopes zoals trips:read dragen.';

-- ─── Webhook delivery claiming ───────────────────────────────────────

ALTER TABLE public.webhook_deliveries
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;

DROP INDEX IF EXISTS idx_webhook_deliveries_processing;
CREATE INDEX idx_webhook_deliveries_processing
  ON public.webhook_deliveries (processing_started_at)
  WHERE status = 'PROCESSING';

ALTER TABLE public.webhook_deliveries
  DROP CONSTRAINT IF EXISTS webhook_deliveries_status_chk;
ALTER TABLE public.webhook_deliveries
  ADD CONSTRAINT webhook_deliveries_status_chk
  CHECK (status IN ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED', 'DEAD'));

CREATE OR REPLACE FUNCTION public.claim_pending_webhook_deliveries(
  p_specific_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_stale_after_seconds INTEGER DEFAULT 900
)
RETURNS TABLE (
  id UUID,
  tenant_id UUID,
  subscription_id UUID,
  event_type TEXT,
  event_id UUID,
  payload JSONB,
  attempt_count INTEGER
) AS $$
DECLARE
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_stale_after INTEGER := GREATEST(COALESCE(p_stale_after_seconds, 900), 30);
BEGIN
  -- Herstel vastgelopen claims zodat een crash niet permanent blokkeert.
  UPDATE public.webhook_deliveries
  SET
    status = 'PENDING',
    processing_started_at = NULL
  WHERE status = 'PROCESSING'
    AND processing_started_at IS NOT NULL
    AND processing_started_at <= NOW() - make_interval(secs => v_stale_after);

  RETURN QUERY
  WITH candidates AS (
    SELECT wd.id
    FROM public.webhook_deliveries wd
    WHERE wd.status = 'PENDING'
      AND wd.next_attempt_at <= NOW()
      AND (p_specific_id IS NULL OR wd.id = p_specific_id)
    ORDER BY wd.next_attempt_at ASC, wd.created_at ASC
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.webhook_deliveries wd
  SET
    status = 'PROCESSING',
    processing_started_at = NOW()
  FROM candidates c
  WHERE wd.id = c.id
  RETURNING
    wd.id,
    wd.tenant_id,
    wd.subscription_id,
    wd.event_type,
    wd.event_id,
    wd.payload,
    wd.attempt_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.claim_pending_webhook_deliveries(UUID, INTEGER, INTEGER) IS
  'Claimt atomisch een batch pending webhook-deliveries voor de dispatcher en markeert ze als PROCESSING.';

REVOKE ALL ON FUNCTION public.claim_pending_webhook_deliveries(UUID, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_pending_webhook_deliveries(UUID, INTEGER, INTEGER) TO service_role;

-- ─── Gerichte test-webhook ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enqueue_test_webhook_delivery(
  p_subscription_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_subscription RECORD;
  v_allowed BOOLEAN;
  v_delivery_id UUID;
BEGIN
  SELECT id, tenant_id, name
  INTO v_subscription
  FROM public.webhook_subscriptions
  WHERE id = p_subscription_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Webhook subscription niet gevonden';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_members tm
    WHERE tm.user_id = (SELECT auth.uid())
      AND tm.tenant_id = v_subscription.tenant_id
      AND tm.role = ANY (ARRAY['owner'::TEXT, 'admin'::TEXT])
  ) INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Niet bevoegd om deze webhook te testen';
  END IF;

  INSERT INTO public.webhook_deliveries (
    tenant_id,
    subscription_id,
    event_type,
    payload,
    status,
    next_attempt_at
  )
  VALUES (
    v_subscription.tenant_id,
    v_subscription.id,
    'webhook.test',
    jsonb_build_object(
      'message', 'Test-event vanuit OrderFlow Settings',
      'subscription_id', v_subscription.id,
      'subscription_name', v_subscription.name,
      'occurred_at', NOW()
    ),
    'PENDING',
    NOW()
  )
  RETURNING id INTO v_delivery_id;

  RETURN v_delivery_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.enqueue_test_webhook_delivery(UUID) IS
  'Plant exact één test-delivery in voor de gekozen webhook subscription.';

REVOKE ALL ON FUNCTION public.enqueue_test_webhook_delivery(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_test_webhook_delivery(UUID) TO authenticated;

