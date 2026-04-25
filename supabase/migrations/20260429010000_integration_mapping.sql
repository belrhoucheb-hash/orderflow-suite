-- Integration mapping: per-tenant overrides voor de drie velden die
-- echt verschillen per klant.
--
-- v1 keys:
--   default_grootboek      , grootboeknummer voor verkoopboeking
--   btw_grootboek          , grootboeknummer voor BTW-tegenboeking
--   debtor_number_start    , vanaf welk debiteurnummer nieuwe klanten beginnen
--
-- Opzettelijk geen JSON-blob: één rij per (tenant, provider, key) maakt
-- audit en validatie eenvoudiger en sluit aan op de veld-mapping-editor
-- in v2.

CREATE TABLE IF NOT EXISTS public.integration_mapping (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL,
  provider    TEXT         NOT NULL,
  key         TEXT         NOT NULL,
  value       TEXT         NOT NULL,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by  UUID,
  CONSTRAINT integration_mapping_uniq
    UNIQUE (tenant_id, provider, key)
);

CREATE INDEX IF NOT EXISTS idx_integration_mapping_tenant_provider
  ON public.integration_mapping (tenant_id, provider);

COMMENT ON TABLE public.integration_mapping IS
  'Per-tenant mapping-overrides voor connectoren. Eén rij per (tenant, provider, key).';

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_integration_mapping_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS integration_mapping_touch_updated_at ON public.integration_mapping;
CREATE TRIGGER integration_mapping_touch_updated_at
  BEFORE UPDATE ON public.integration_mapping
  FOR EACH ROW EXECUTE FUNCTION public.touch_integration_mapping_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────────
ALTER TABLE public.integration_mapping ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "integration_mapping: tenant admin select" ON public.integration_mapping;
CREATE POLICY "integration_mapping: tenant admin select"
  ON public.integration_mapping
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = integration_mapping.tenant_id
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "integration_mapping: tenant admin upsert" ON public.integration_mapping;
CREATE POLICY "integration_mapping: tenant admin upsert"
  ON public.integration_mapping
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = integration_mapping.tenant_id
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "integration_mapping: tenant admin update" ON public.integration_mapping;
CREATE POLICY "integration_mapping: tenant admin update"
  ON public.integration_mapping
  FOR UPDATE TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = integration_mapping.tenant_id
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "integration_mapping: service_role full" ON public.integration_mapping;
CREATE POLICY "integration_mapping: service_role full"
  ON public.integration_mapping
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

GRANT SELECT, INSERT, UPDATE ON public.integration_mapping TO authenticated;
GRANT ALL ON public.integration_mapping TO service_role;

-- --- ROLLBACK -------------------------------------------------------
-- DROP POLICY IF EXISTS "integration_mapping: service_role full" ON public.integration_mapping;
-- DROP POLICY IF EXISTS "integration_mapping: tenant admin update" ON public.integration_mapping;
-- DROP POLICY IF EXISTS "integration_mapping: tenant admin upsert" ON public.integration_mapping;
-- DROP POLICY IF EXISTS "integration_mapping: tenant admin select" ON public.integration_mapping;
-- DROP TRIGGER IF EXISTS integration_mapping_touch_updated_at ON public.integration_mapping;
-- DROP FUNCTION IF EXISTS public.touch_integration_mapping_updated_at();
-- DROP INDEX IF EXISTS idx_integration_mapping_tenant_provider;
-- DROP TABLE IF EXISTS public.integration_mapping;
