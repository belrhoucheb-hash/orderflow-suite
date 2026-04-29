CREATE TABLE IF NOT EXISTS public.order_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation_result JSONB NOT NULL DEFAULT '{"blockers":[],"warnings":[],"infos":[]}'::jsonb,
  manual_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  committed_shipment_id UUID REFERENCES public.shipments(id) ON DELETE SET NULL,
  committed_at TIMESTAMPTZ,
  status_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT order_drafts_status_check
    CHECK (status IN ('DRAFT', 'PENDING', 'PLANNED', 'CANCELLED', 'ON_HOLD')),
  CONSTRAINT order_drafts_ready_requires_no_blockers_check
    CHECK (
      status = 'DRAFT'
      OR jsonb_array_length(COALESCE(validation_result->'blockers', '[]'::jsonb)) = 0
    )
);

CREATE INDEX IF NOT EXISTS idx_order_drafts_tenant_status
  ON public.order_drafts (tenant_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_drafts_created_by
  ON public.order_drafts (created_by, updated_at DESC);

DROP TRIGGER IF EXISTS trg_order_drafts_updated_at ON public.order_drafts;
CREATE TRIGGER trg_order_drafts_updated_at
  BEFORE UPDATE ON public.order_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE FUNCTION public.order_drafts_status_changed_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_drafts_status_changed_at ON public.order_drafts;
CREATE TRIGGER trg_order_drafts_status_changed_at
  BEFORE INSERT OR UPDATE OF status ON public.order_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.order_drafts_status_changed_at();

ALTER TABLE public.order_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation: order_drafts SELECT" ON public.order_drafts;
CREATE POLICY "Tenant isolation: order_drafts SELECT"
  ON public.order_drafts
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "Tenant isolation: order_drafts INSERT" ON public.order_drafts;
CREATE POLICY "Tenant isolation: order_drafts INSERT"
  ON public.order_drafts
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "Tenant isolation: order_drafts UPDATE" ON public.order_drafts;
CREATE POLICY "Tenant isolation: order_drafts UPDATE"
  ON public.order_drafts
  FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "Tenant isolation: order_drafts DELETE" ON public.order_drafts;
CREATE POLICY "Tenant isolation: order_drafts DELETE"
  ON public.order_drafts
  FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id());

GRANT ALL ON TABLE public.order_drafts TO authenticated;
GRANT ALL ON TABLE public.order_drafts TO service_role;

COMMENT ON TABLE public.order_drafts IS
  'Server-side idempotente draft voor de Nieuwe order wizard. De definitieve orders ontstaan pas bij gereedmelden.';

COMMENT ON COLUMN public.order_drafts.validation_result IS
  'Snapshot van de centrale orderDraft-readiness engine: blockers, warnings, infos en score.';
