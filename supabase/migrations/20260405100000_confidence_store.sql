-- ============================================================
-- Plan A: Confidence Store & Decision Engine
-- Creates decision_log and confidence_scores tables with RLS.
-- ============================================================

-- ─── decision_log ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.decision_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  decision_type TEXT NOT NULL CHECK (decision_type IN (
    'ORDER_INTAKE', 'PLANNING', 'DISPATCH', 'PRICING', 'INVOICING', 'CONSOLIDATION'
  )),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('order', 'trip', 'invoice')),
  entity_id UUID NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  proposed_action JSONB NOT NULL DEFAULT '{}',
  actual_action JSONB,
  input_confidence NUMERIC(5,2) CHECK (input_confidence >= 0 AND input_confidence <= 100),
  model_confidence NUMERIC(5,2) CHECK (model_confidence >= 0 AND model_confidence <= 100),
  outcome_confidence NUMERIC(5,2) CHECK (outcome_confidence >= 0 AND outcome_confidence <= 100),
  resolution TEXT CHECK (resolution IN (
    'APPROVED', 'MODIFIED', 'REJECTED', 'AUTO_EXECUTED', 'PENDING'
  )) DEFAULT 'PENDING',
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX idx_decision_log_tenant ON public.decision_log(tenant_id);
CREATE INDEX idx_decision_log_entity ON public.decision_log(entity_type, entity_id);
CREATE INDEX idx_decision_log_type_client ON public.decision_log(tenant_id, decision_type, client_id);
CREATE INDEX idx_decision_log_created ON public.decision_log(tenant_id, created_at DESC);

-- RLS
ALTER TABLE public.decision_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for decision_log"
  ON public.decision_log
  FOR ALL
  USING (tenant_id IN (
    SELECT tm.tenant_id FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid()
  ))
  WITH CHECK (tenant_id IN (
    SELECT tm.tenant_id FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid()
  ));

-- ─── confidence_scores ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.confidence_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  decision_type TEXT NOT NULL CHECK (decision_type IN (
    'ORDER_INTAKE', 'PLANNING', 'DISPATCH', 'PRICING', 'INVOICING', 'CONSOLIDATION'
  )),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  current_score NUMERIC(5,2) NOT NULL DEFAULT 50.00,
  total_decisions INTEGER NOT NULL DEFAULT 0,
  approved_count INTEGER NOT NULL DEFAULT 0,
  modified_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  trend TEXT NOT NULL DEFAULT 'STABLE' CHECK (trend IN ('RISING', 'STABLE', 'FALLING')),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique indexes handling NULL client_id
CREATE UNIQUE INDEX idx_confidence_scores_tenant_type_null_client
  ON public.confidence_scores(tenant_id, decision_type)
  WHERE client_id IS NULL;

CREATE UNIQUE INDEX idx_confidence_scores_tenant_type_client
  ON public.confidence_scores(tenant_id, decision_type, client_id)
  WHERE client_id IS NOT NULL;

CREATE INDEX idx_confidence_scores_tenant ON public.confidence_scores(tenant_id);

-- RLS
ALTER TABLE public.confidence_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for confidence_scores"
  ON public.confidence_scores
  FOR ALL
  USING (tenant_id IN (
    SELECT tm.tenant_id FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid()
  ))
  WITH CHECK (tenant_id IN (
    SELECT tm.tenant_id FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid()
  ));
