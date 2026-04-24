-- Webhook subscriptions: upgrade van bestaande skelet-tabel uit de baseline.
--
-- De baseline-migratie (20260419000000) creëerde al een lege webhook_subscriptions
-- met kolommen (id, tenant_id, url, events, secret, is_active, last_triggered_at,
-- failure_count, created_at) en een losse RLS-policy. Geen code gebruikt de tabel;
-- hij was een skelet voor toekomst. Deze migratie maakt er een echte outbound-
-- webhook subscription van: extra metadata, strakkere RLS (admin-only),
-- CHECK-constraints, updated_at-trigger.

-- ─── Extra kolommen ─────────────────────────────────────────────────
ALTER TABLE public.webhook_subscriptions
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_failure_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by UUID;

-- tenant_id mag niet meer nullable zijn voor nieuwe rijen. Bestaande
-- rijen zijn er niet (skelet is nooit gebruikt), dus NOT NULL is veilig.
-- Geen forceren van backfill-default.
UPDATE public.webhook_subscriptions SET name = 'Webhook ' || substr(id::text, 1, 8) WHERE name IS NULL;
UPDATE public.webhook_subscriptions SET secret = encode(gen_random_bytes(32), 'base64') WHERE secret IS NULL;

ALTER TABLE public.webhook_subscriptions
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN secret SET NOT NULL,
  ALTER COLUMN tenant_id SET NOT NULL;

-- ─── CHECK-constraints (NOT VALID om oude rijen niet te blokkeren, dan VALIDATE) ─
ALTER TABLE public.webhook_subscriptions
  DROP CONSTRAINT IF EXISTS webhook_subscriptions_url_https_chk;
ALTER TABLE public.webhook_subscriptions
  ADD CONSTRAINT webhook_subscriptions_url_https_chk CHECK (url ~* '^https://') NOT VALID;

ALTER TABLE public.webhook_subscriptions
  DROP CONSTRAINT IF EXISTS webhook_subscriptions_events_nonempty_chk;
ALTER TABLE public.webhook_subscriptions
  ADD CONSTRAINT webhook_subscriptions_events_nonempty_chk CHECK (array_length(events, 1) >= 1) NOT VALID;

ALTER TABLE public.webhook_subscriptions
  DROP CONSTRAINT IF EXISTS webhook_subscriptions_secret_len_chk;
ALTER TABLE public.webhook_subscriptions
  ADD CONSTRAINT webhook_subscriptions_secret_len_chk CHECK (length(secret) >= 32) NOT VALID;

-- Valideer; als er slechte data is breekt dit, maar we verwachten geen data.
ALTER TABLE public.webhook_subscriptions VALIDATE CONSTRAINT webhook_subscriptions_url_https_chk;
ALTER TABLE public.webhook_subscriptions VALIDATE CONSTRAINT webhook_subscriptions_events_nonempty_chk;
ALTER TABLE public.webhook_subscriptions VALIDATE CONSTRAINT webhook_subscriptions_secret_len_chk;

-- ─── Indices ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_tenant
  ON public.webhook_subscriptions (tenant_id, is_active);

CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_events
  ON public.webhook_subscriptions USING GIN (events);

COMMENT ON TABLE public.webhook_subscriptions IS
  'Outbound webhook-abonnementen per tenant. Elke rij = één target-URL die een set events ontvangt, HMAC-SHA256 gesigned met secret.';

COMMENT ON COLUMN public.webhook_subscriptions.secret IS
  'Shared secret voor HMAC-SHA256 signing. Wordt eenmaal getoond bij aanmaak, daarna alleen server-side gebruikt.';

COMMENT ON COLUMN public.webhook_subscriptions.events IS
  'Lijst van event-types waar deze subscription op matcht, bijv. {order.created,invoice.paid}. Exacte match, geen wildcards in v1.';

COMMENT ON COLUMN public.webhook_subscriptions.failure_count IS
  'Opeenvolgende mislukte deliveries sinds laatste success. Reset naar 0 bij 2xx response.';

-- ─── updated_at trigger ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_webhook_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS webhook_subscriptions_touch_updated_at ON public.webhook_subscriptions;
CREATE TRIGGER webhook_subscriptions_touch_updated_at
  BEFORE UPDATE ON public.webhook_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_webhook_subscriptions_updated_at();

-- ─── RLS: vervang de losse baseline-policy door admin-only per actie ───
-- De baseline had: FOR ALL USING (tenant_id = get_user_tenant_id()). Plus
-- GRANT ALL aan anon en authenticated. Te los: anon mag helemaal niks,
-- en een gewone tenant-user ook niet (webhooks bevat secrets). Dus:
-- owner/admin in tenant_members mag alles, service_role mag alles, anon
-- mag niks.

DROP POLICY IF EXISTS "webhook_tenant_all" ON public.webhook_subscriptions;

DROP POLICY IF EXISTS "Webhook subs: tenant admin select" ON public.webhook_subscriptions;
CREATE POLICY "Webhook subs: tenant admin select"
  ON public.webhook_subscriptions
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = webhook_subscriptions.tenant_id
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "Webhook subs: tenant admin insert" ON public.webhook_subscriptions;
CREATE POLICY "Webhook subs: tenant admin insert"
  ON public.webhook_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = webhook_subscriptions.tenant_id
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "Webhook subs: tenant admin update" ON public.webhook_subscriptions;
CREATE POLICY "Webhook subs: tenant admin update"
  ON public.webhook_subscriptions
  FOR UPDATE TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = webhook_subscriptions.tenant_id
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "Webhook subs: tenant admin delete" ON public.webhook_subscriptions;
CREATE POLICY "Webhook subs: tenant admin delete"
  ON public.webhook_subscriptions
  FOR DELETE TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = webhook_subscriptions.tenant_id
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "Webhook subs: service_role full" ON public.webhook_subscriptions;
CREATE POLICY "Webhook subs: service_role full"
  ON public.webhook_subscriptions
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- Trek de GRANT ALL aan anon weer in: webhooks bevatten secrets.
REVOKE ALL ON public.webhook_subscriptions FROM anon;

-- --- ROLLBACK -------------------------------------------------------
-- DROP POLICY IF EXISTS "Webhook subs: service_role full" ON public.webhook_subscriptions;
-- DROP POLICY IF EXISTS "Webhook subs: tenant admin delete" ON public.webhook_subscriptions;
-- DROP POLICY IF EXISTS "Webhook subs: tenant admin update" ON public.webhook_subscriptions;
-- DROP POLICY IF EXISTS "Webhook subs: tenant admin insert" ON public.webhook_subscriptions;
-- DROP POLICY IF EXISTS "Webhook subs: tenant admin select" ON public.webhook_subscriptions;
-- DROP TRIGGER IF EXISTS webhook_subscriptions_touch_updated_at ON public.webhook_subscriptions;
-- DROP FUNCTION IF EXISTS public.touch_webhook_subscriptions_updated_at();
-- DROP INDEX IF EXISTS idx_webhook_subscriptions_events;
-- DROP INDEX IF EXISTS idx_webhook_subscriptions_tenant;
-- ALTER TABLE public.webhook_subscriptions DROP CONSTRAINT IF EXISTS webhook_subscriptions_secret_len_chk;
-- ALTER TABLE public.webhook_subscriptions DROP CONSTRAINT IF EXISTS webhook_subscriptions_events_nonempty_chk;
-- ALTER TABLE public.webhook_subscriptions DROP CONSTRAINT IF EXISTS webhook_subscriptions_url_https_chk;
-- ALTER TABLE public.webhook_subscriptions
--   DROP COLUMN IF EXISTS created_by,
--   DROP COLUMN IF EXISTS last_failure_at,
--   DROP COLUMN IF EXISTS last_success_at,
--   DROP COLUMN IF EXISTS updated_at,
--   DROP COLUMN IF EXISTS description,
--   DROP COLUMN IF EXISTS name;
