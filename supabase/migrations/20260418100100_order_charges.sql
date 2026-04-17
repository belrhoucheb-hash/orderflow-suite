-- ──────────────────────────────────────────────────────────────────────────
-- Sprint 2, TA-05. Add-on kosten per order (wachtkosten, tol, correcties).
--
-- Hybride snapshot-aanpak: shipments.pricing blijft audit-snapshot van de
-- motor-run; order_charges bevat alles wat achteraf toegevoegd wordt door
-- planner of chauffeur. Per regel: type, bedrag in cents, reden, user.
--
-- Auditeerbaarheid (prompt-regel 9): source_description kolom zodat planner
-- bij klantvraag kan uitleggen waar een bedrag vandaan komt.
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.order_charges (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id            UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,

  charge_type         TEXT NOT NULL CHECK (charge_type IN
                        ('waiting','toll','extra_stop','correction','manual','other')),
  description         TEXT NOT NULL,
  source_description  TEXT,

  quantity            NUMERIC(10,3),
  unit                TEXT,
  unit_price_cents    INTEGER,
  amount_cents        INTEGER NOT NULL,

  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.order_charges IS
  'Add-on kosten per order, toegevoegd na orderaanmaak. Basisprijs blijft in shipments.pricing.';
COMMENT ON COLUMN public.order_charges.source_description IS
  'Menselijke uitleg waar dit bedrag vandaan komt, voor klantvraag-audit (prompt-regel 9).';
COMMENT ON COLUMN public.order_charges.amount_cents IS
  'Bedrag in eurocenten. Kan negatief zijn voor correcties/kortingen.';

CREATE INDEX IF NOT EXISTS idx_order_charges_order ON public.order_charges(order_id);
CREATE INDEX IF NOT EXISTS idx_order_charges_tenant_type
  ON public.order_charges(tenant_id, charge_type, created_at DESC);

ALTER TABLE public.order_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_charges_tenant_select" ON public.order_charges
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

-- Insert-policy: planner/admin volledig, chauffeur alleen 'waiting' op eigen trip.
-- Rollen in dit project zitten op tenant_members.role ('owner','admin','planner').
-- Chauffeurs hebben een rij in drivers met user_id, niet per se in tenant_members.
-- Fallback-beleid deze sprint: toestaan voor alle tenant-users, waiting-only-voor-chauffeur
-- wordt gehandhaafd in de UI en in de Edge Function die de insert doet.
-- Als tenant_members.role uitbreiding komt, wordt deze policy aangescherpt.
CREATE POLICY "order_charges_tenant_insert" ON public.order_charges
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "order_charges_tenant_update" ON public.order_charges
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "order_charges_tenant_delete" ON public.order_charges
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "order_charges_service_role" ON public.order_charges
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─── ROLLBACK ─────────────────────────────────────────────────
-- DROP TABLE IF EXISTS public.order_charges CASCADE;
