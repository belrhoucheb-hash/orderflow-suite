-- ──────────────────────────────────────────────────────────────────────────
-- §26 Tenant warehouses — configureerbare hub-adressen per tenant
--
-- Vervangt de hardcoded EXPORT_DELIVERY_MARKERS en IMPORT_PICKUP_MARKERS
-- in trajectRouter.ts. Elke tenant kan eigen warehouses instellen met een
-- type (OPS, EXPORT, IMPORT) zodat inferAfdeling dynamisch werkt.
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tenant_warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  warehouse_type TEXT NOT NULL CHECK (warehouse_type IN ('OPS', 'EXPORT', 'IMPORT')),
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_warehouses_tenant
  ON public.tenant_warehouses(tenant_id);

ALTER TABLE public.tenant_warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for warehouses"
  ON public.tenant_warehouses FOR ALL
  USING (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()));

CREATE POLICY "Service role full access on warehouses"
  ON public.tenant_warehouses FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');