-- ============================================================
-- Portal: Add missing columns + seed a test portal user
-- ============================================================

-- ─── 1. Add missing columns on orders used by portal ────────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS reference TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_client ON public.orders(client_id);

-- ─── 2. Seed a test portal user ────────────────────────────
-- Since we cannot insert into auth.users from a migration safely,
-- we use a DO block that:
--   1. Picks the first client for the demo tenant
--   2. Inserts a portal user record if one doesn't already exist
--      (using any existing auth user from tenant_members as the portal user)

DO $$
DECLARE
  v_tenant_id UUID := '00000000-0000-0000-0000-000000000001';
  v_client_id UUID;
  v_user_id UUID;
BEGIN
  -- Pick the first client
  SELECT id INTO v_client_id
  FROM public.clients
  WHERE tenant_id = v_tenant_id
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_client_id IS NULL THEN
    RAISE NOTICE 'No clients found for tenant — skipping portal seed';
    RETURN;
  END IF;

  -- Pick the first tenant member as the portal test user
  SELECT user_id INTO v_user_id
  FROM public.tenant_members
  WHERE tenant_id = v_tenant_id
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'No tenant members found — skipping portal seed';
    RETURN;
  END IF;

  -- Insert portal user if not already present
  INSERT INTO public.client_portal_users (
    tenant_id, client_id, user_id, portal_role, is_active
  )
  VALUES (
    v_tenant_id, v_client_id, v_user_id, 'admin', true
  )
  ON CONFLICT (tenant_id, client_id, user_id) DO NOTHING;

  RAISE NOTICE 'Portal seed: user_id=%, client_id=%, tenant_id=%',
    v_user_id, v_client_id, v_tenant_id;
END;
$$;
