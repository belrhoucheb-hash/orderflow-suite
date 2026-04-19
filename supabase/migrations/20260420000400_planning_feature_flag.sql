-- ══════════════════════════════════════════════════════════════════════════
-- Sprint 3, CP-02 / CP-03 (V8). Feature-flag voor Planbord v2.
--
-- Pattern identiek aan sprint-2 tariefmotor-flag. tenant_settings category
-- 'planning' met JSON { v2_enabled, cluster_granularity }. Default-uit,
-- tenant activeert handmatig. Parallelle route /planning-v2 leest deze vlag.
--
-- Idempotent via ON CONFLICT DO NOTHING. Bestaande config blijft ongemoeid.
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_planning_v2_enabled(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (settings->>'v2_enabled')::boolean
     FROM public.tenant_settings
     WHERE tenant_id = p_tenant_id AND category = 'planning'
     LIMIT 1),
    false
  );
$$;

COMMENT ON FUNCTION public.is_planning_v2_enabled(UUID) IS
  'Leest tenant_settings.planning.v2_enabled. Default false zodat Planbord v1 blijft draaien.';

CREATE OR REPLACE FUNCTION public.get_planning_cluster_granularity(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT settings->>'cluster_granularity'
     FROM public.tenant_settings
     WHERE tenant_id = p_tenant_id AND category = 'planning'
     LIMIT 1),
    'PC2'
  );
$$;

COMMENT ON FUNCTION public.get_planning_cluster_granularity(UUID) IS
  'Leest tenant_settings.planning.cluster_granularity. Default PC2 (2-cijferig postcode-prefix).';

GRANT EXECUTE ON FUNCTION public.is_planning_v2_enabled(UUID)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_planning_cluster_granularity(UUID) TO authenticated, service_role;

-- Seed default planning-config voor alle bestaande tenants. v2 uit, PC2 clustering.
INSERT INTO public.tenant_settings (tenant_id, category, settings)
SELECT id, 'planning', '{"v2_enabled": false, "cluster_granularity": "PC2"}'::jsonb
FROM public.tenants
ON CONFLICT (tenant_id, category) DO NOTHING;

-- ─── ROLLBACK ─────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.is_planning_v2_enabled(UUID);
-- DROP FUNCTION IF EXISTS public.get_planning_cluster_granularity(UUID);
-- DELETE FROM public.tenant_settings WHERE category = 'planning';