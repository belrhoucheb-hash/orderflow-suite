-- ============================================================
-- Feature 2: Geavanceerde Tariefmodellen
-- Creates rate_cards, rate_rules, surcharges tables
-- ============================================================

-- ─── 1. Rate Cards ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rate_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  valid_from DATE,
  valid_until DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  currency TEXT NOT NULL DEFAULT 'EUR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rate_cards IS 'Tariff card per client (NULL client_id = default tariff for tenant)';
COMMENT ON COLUMN public.rate_cards.client_id IS 'NULL means this is the default rate card for the tenant';

-- ─── 2. Rate Rules ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rate_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_card_id UUID NOT NULL REFERENCES public.rate_cards(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL CHECK (rule_type IN (
    'PER_KM', 'PER_UUR', 'PER_STOP', 'PER_PALLET', 'PER_KG',
    'VAST_BEDRAG', 'ZONE_TARIEF', 'STAFFEL'
  )),
  transport_type TEXT,
  amount NUMERIC(12,4) NOT NULL,
  min_amount NUMERIC(12,4),
  conditions JSONB DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rate_rules IS 'Individual tariff rules within a rate card';
COMMENT ON COLUMN public.rate_rules.conditions IS 'JSONB for tier/zone conditions, e.g. {"weight_from":0,"weight_to":500} or {"from_zone":"NL","to_zone":"DE"}';

-- ─── 3. Surcharges ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.surcharges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  surcharge_type TEXT NOT NULL CHECK (surcharge_type IN (
    'PERCENTAGE', 'VAST_BEDRAG', 'PER_KM', 'PER_KG'
  )),
  amount NUMERIC(12,4) NOT NULL,
  applies_to JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.surcharges IS 'Surcharges (diesel, weekend, ADR, cooling, wait time)';
COMMENT ON COLUMN public.surcharges.applies_to IS 'Conditions for applying surcharge, e.g. {"requirements":["ADR"]}, {"day_of_week":[5,6]}, {"waiting_time_above_min":30}';

-- ─── 4. Indices ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rate_cards_tenant ON public.rate_cards(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_rate_cards_client ON public.rate_cards(client_id, is_active);
CREATE INDEX IF NOT EXISTS idx_rate_rules_card ON public.rate_rules(rate_card_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_surcharges_tenant ON public.surcharges(tenant_id, is_active);

-- ─── 5. RLS ────────────────────────────────────────────────
ALTER TABLE public.rate_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surcharges ENABLE ROW LEVEL SECURITY;

-- rate_cards: tenant isolation
CREATE POLICY "rate_cards_tenant_select" ON public.rate_cards
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "rate_cards_tenant_insert" ON public.rate_cards
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());
CREATE POLICY "rate_cards_tenant_update" ON public.rate_cards
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "rate_cards_tenant_delete" ON public.rate_cards
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "rate_cards_service_role" ON public.rate_cards
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- rate_rules: access through rate_card's tenant
CREATE POLICY "rate_rules_tenant_select" ON public.rate_rules
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.rate_cards rc WHERE rc.id = rate_card_id
      AND rc.tenant_id = public.get_user_tenant_id())
  );
CREATE POLICY "rate_rules_tenant_insert" ON public.rate_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.rate_cards rc WHERE rc.id = rate_card_id
      AND rc.tenant_id = public.get_user_tenant_id())
  );
CREATE POLICY "rate_rules_tenant_update" ON public.rate_rules
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.rate_cards rc WHERE rc.id = rate_card_id
      AND rc.tenant_id = public.get_user_tenant_id())
  );
CREATE POLICY "rate_rules_tenant_delete" ON public.rate_rules
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.rate_cards rc WHERE rc.id = rate_card_id
      AND rc.tenant_id = public.get_user_tenant_id())
  );
CREATE POLICY "rate_rules_service_role" ON public.rate_rules
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- surcharges: tenant isolation
CREATE POLICY "surcharges_tenant_select" ON public.surcharges
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "surcharges_tenant_insert" ON public.surcharges
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());
CREATE POLICY "surcharges_tenant_update" ON public.surcharges
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "surcharges_tenant_delete" ON public.surcharges
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "surcharges_service_role" ON public.surcharges
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─── updated_at triggers ──────────────────────────────────────
CREATE TRIGGER update_rate_cards_updated_at
  BEFORE UPDATE ON public.rate_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_surcharges_updated_at
  BEFORE UPDATE ON public.surcharges
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
