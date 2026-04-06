-- ============================================================
-- Confidence Store: AI Decision Tracking & Learning Metrics
-- Stores every AI decision with its confidence and eventual outcome
-- ============================================================

-- ─── ai_decisions ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_decisions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  decision_type TEXT NOT NULL, -- 'order_extraction', 'planning_assignment', 'dispatch_auto', 'invoice_auto'
  entity_id UUID, -- order_id, trip_id, invoice_id etc.
  entity_type TEXT, -- 'order', 'trip', 'invoice'
  confidence_score NUMERIC(5,2) NOT NULL, -- 0-100
  field_confidences JSONB DEFAULT '{}', -- per-field scores
  ai_suggestion JSONB NOT NULL, -- what the AI suggested
  final_values JSONB, -- what was actually used (after human corrections)
  was_auto_approved BOOLEAN DEFAULT false,
  was_corrected BOOLEAN DEFAULT false,
  correction_summary JSONB, -- which fields were changed
  outcome TEXT, -- 'accepted', 'corrected', 'rejected'
  processing_time_ms INTEGER,
  model_version TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_decisions_tenant ON public.ai_decisions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_type ON public.ai_decisions(decision_type);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_created ON public.ai_decisions(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_confidence ON public.ai_decisions(confidence_score);

-- Enable RLS
ALTER TABLE public.ai_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.ai_decisions FOR ALL USING (
  tenant_id IN (
    SELECT tm.tenant_id FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid()
  )
);

-- ─── confidence_metrics ────────────────────────────────────

-- Aggregated learning metrics per client per tenant
CREATE TABLE IF NOT EXISTS public.confidence_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id UUID, -- optional, for per-client tracking
  decision_type TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_decisions INTEGER DEFAULT 0,
  auto_approved_count INTEGER DEFAULT 0,
  corrected_count INTEGER DEFAULT 0,
  rejected_count INTEGER DEFAULT 0,
  avg_confidence NUMERIC(5,2),
  avg_correction_delta NUMERIC(5,2), -- how much corrections deviate
  automation_rate NUMERIC(5,2), -- % auto-approved
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, client_id, decision_type, period_start)
);

ALTER TABLE public.confidence_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.confidence_metrics FOR ALL USING (
  tenant_id IN (
    SELECT tm.tenant_id FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid()
  )
);
