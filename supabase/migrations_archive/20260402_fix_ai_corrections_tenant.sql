-- Add tenant_id to ai_corrections for multi-tenant isolation
ALTER TABLE public.ai_corrections
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

-- Index for tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_ai_corrections_tenant
  ON public.ai_corrections(tenant_id);

-- Enable RLS
ALTER TABLE public.ai_corrections ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy
CREATE POLICY "tenant_isolation" ON public.ai_corrections
  FOR ALL
  USING (
    tenant_id IS NULL OR
    tenant_id = COALESCE(
      (auth.jwt()->'app_metadata'->>'tenant_id')::uuid,
      (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() LIMIT 1)
    )
  );
