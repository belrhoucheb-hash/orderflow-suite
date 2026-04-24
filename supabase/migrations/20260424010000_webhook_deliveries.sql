-- Webhook deliveries + attempts: de outbox.
--
-- Elke emit schrijft één rij per matchende subscription in
-- webhook_deliveries (status=PENDING). De dispatcher edge function
-- picked ze op (next_attempt_at <= now), doet een POST met HMAC-headers,
-- en schrijft elke poging als rij in webhook_delivery_attempts.
--
-- Retry-schema (exponential backoff): 1m, 5m, 30m, 2u, 12u, dan DEAD.
-- Max 6 attempts.
--
-- De functie emit_webhook_event(tenant_id, event_type, payload) is de
-- enige manier om nieuwe deliveries aan te maken. Wordt aangeroepen
-- vanuit edge functions (pipeline-trigger, financial-trigger, enz.).

-- ─── webhook_deliveries ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID         NOT NULL,
  subscription_id    UUID         NOT NULL REFERENCES public.webhook_subscriptions(id) ON DELETE CASCADE,
  event_type         TEXT         NOT NULL,
  event_id           UUID         NOT NULL DEFAULT gen_random_uuid(),
  payload            JSONB        NOT NULL,
  status             TEXT         NOT NULL DEFAULT 'PENDING',
  attempt_count      INTEGER      NOT NULL DEFAULT 0,
  next_attempt_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_attempt_at    TIMESTAMPTZ,
  delivered_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT webhook_deliveries_status_chk
    CHECK (status IN ('PENDING', 'DELIVERED', 'FAILED', 'DEAD'))
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending
  ON public.webhook_deliveries (next_attempt_at)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_tenant_created
  ON public.webhook_deliveries (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_subscription
  ON public.webhook_deliveries (subscription_id, created_at DESC);

COMMENT ON TABLE public.webhook_deliveries IS
  'Outbox voor outbound webhooks. Eén rij per subscription per event. Dispatcher werkt PENDING af met retry/backoff.';

-- ─── webhook_delivery_attempts ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.webhook_delivery_attempts (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id    UUID         NOT NULL REFERENCES public.webhook_deliveries(id) ON DELETE CASCADE,
  tenant_id      UUID         NOT NULL,
  attempt_number INTEGER      NOT NULL,
  status_code    INTEGER,
  response_body  TEXT,
  error_message  TEXT,
  duration_ms    INTEGER,
  attempted_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_attempts_delivery
  ON public.webhook_delivery_attempts (delivery_id, attempt_number);

CREATE INDEX IF NOT EXISTS idx_webhook_attempts_tenant
  ON public.webhook_delivery_attempts (tenant_id, attempted_at DESC);

COMMENT ON TABLE public.webhook_delivery_attempts IS
  'Één rij per HTTP-poging. response_body is getrunceerd tot 2KB, zonder headers, zodat secrets niet lekken.';

-- ─── RLS ────────────────────────────────────────────────────────────
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_delivery_attempts ENABLE ROW LEVEL SECURITY;

-- Tenant-admin mag lezen, dispatcher (service_role) mag alles.
DROP POLICY IF EXISTS "Webhook deliveries: tenant admin select" ON public.webhook_deliveries;
CREATE POLICY "Webhook deliveries: tenant admin select"
  ON public.webhook_deliveries
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = webhook_deliveries.tenant_id
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

-- UPDATE alleen voor admin en alleen om replay te triggeren
-- (next_attempt_at + status PENDING). We geven volledige UPDATE vrij en
-- vertrouwen de UI + dispatcher om daar netjes mee om te gaan; meer
-- granulariteit zou een stored proc vereisen.
DROP POLICY IF EXISTS "Webhook deliveries: tenant admin replay" ON public.webhook_deliveries;
CREATE POLICY "Webhook deliveries: tenant admin replay"
  ON public.webhook_deliveries
  FOR UPDATE TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = webhook_deliveries.tenant_id
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "Webhook deliveries: service_role full" ON public.webhook_deliveries;
CREATE POLICY "Webhook deliveries: service_role full"
  ON public.webhook_deliveries
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Webhook attempts: tenant admin select" ON public.webhook_delivery_attempts;
CREATE POLICY "Webhook attempts: tenant admin select"
  ON public.webhook_delivery_attempts
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = webhook_delivery_attempts.tenant_id
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "Webhook attempts: service_role full" ON public.webhook_delivery_attempts;
CREATE POLICY "Webhook attempts: service_role full"
  ON public.webhook_delivery_attempts
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- Geen INSERT/DELETE voor authenticated: alleen dispatcher schrijft,
-- replay gaat via UPDATE van bestaande delivery-rij.

GRANT SELECT, UPDATE ON public.webhook_deliveries TO authenticated;
GRANT SELECT ON public.webhook_delivery_attempts TO authenticated;
GRANT ALL ON public.webhook_deliveries TO service_role;
GRANT ALL ON public.webhook_delivery_attempts TO service_role;

-- ─── emit_webhook_event ────────────────────────────────────────────
-- Schrijft per matchende actieve subscription een delivery in de outbox.
-- SECURITY DEFINER zodat DB-triggers of RPCs vanuit service-role context
-- dit mogen aanroepen zonder RLS-check op subscriptions-tabel.
CREATE OR REPLACE FUNCTION public.emit_webhook_event(
  p_tenant_id UUID,
  p_event_type TEXT,
  p_payload JSONB
)
RETURNS INTEGER AS $$
DECLARE
  inserted_count INTEGER := 0;
  sub RECORD;
BEGIN
  IF p_tenant_id IS NULL OR p_event_type IS NULL OR p_event_type = '' THEN
    RETURN 0;
  END IF;

  FOR sub IN
    SELECT id
    FROM public.webhook_subscriptions
    WHERE tenant_id = p_tenant_id
      AND is_active = TRUE
      AND p_event_type = ANY (events)
  LOOP
    INSERT INTO public.webhook_deliveries
      (tenant_id, subscription_id, event_type, payload, status, next_attempt_at)
    VALUES
      (p_tenant_id, sub.id, p_event_type, COALESCE(p_payload, '{}'::jsonb),
       'PENDING', NOW());
    inserted_count := inserted_count + 1;
  END LOOP;

  RETURN inserted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.emit_webhook_event(UUID, TEXT, JSONB) IS
  'Publiceert een event naar alle actieve subscriptions van de tenant die op event_type matchen. Returnt het aantal geschreven delivery-rijen.';

REVOKE ALL ON FUNCTION public.emit_webhook_event(UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.emit_webhook_event(UUID, TEXT, JSONB) TO service_role;

-- --- ROLLBACK -------------------------------------------------------
-- DROP FUNCTION IF EXISTS public.emit_webhook_event(UUID, TEXT, JSONB);
-- DROP POLICY IF EXISTS "Webhook attempts: service_role full" ON public.webhook_delivery_attempts;
-- DROP POLICY IF EXISTS "Webhook attempts: tenant admin select" ON public.webhook_delivery_attempts;
-- DROP POLICY IF EXISTS "Webhook deliveries: service_role full" ON public.webhook_deliveries;
-- DROP POLICY IF EXISTS "Webhook deliveries: tenant admin replay" ON public.webhook_deliveries;
-- DROP POLICY IF EXISTS "Webhook deliveries: tenant admin select" ON public.webhook_deliveries;
-- DROP TABLE IF EXISTS public.webhook_delivery_attempts;
-- DROP TABLE IF EXISTS public.webhook_deliveries;
