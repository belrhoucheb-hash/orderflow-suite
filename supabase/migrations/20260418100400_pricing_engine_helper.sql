-- ──────────────────────────────────────────────────────────────────────────
-- Sprint 2. Helper-functies voor feature-flag en config-check.
--
-- tenant_settings is een JSONB key-value store, category = 'pricing'.
-- Standaard bestaat de rij niet, dan geldt engine_enabled = false.
--
-- can_enable_pricing controleert dat de tenant genoeg config heeft
-- (minstens 1 actief vehicle_type en 1 actieve rate_card) voordat de
-- feature-toggle aan mag.
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_pricing_engine_enabled(p_tenant_id UUID)
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT (settings->>'engine_enabled')::boolean
     FROM public.tenant_settings
     WHERE tenant_id = p_tenant_id AND category = 'pricing'
     LIMIT 1),
    false
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.is_pricing_engine_enabled(UUID) IS
  'Tariefmotor per tenant aan/uit. Default false als tenant_settings rij ontbreekt.';

CREATE OR REPLACE FUNCTION public.can_enable_pricing(p_tenant_id UUID)
RETURNS TABLE (
  can_enable          BOOLEAN,
  has_vehicle_types   BOOLEAN,
  has_rate_cards      BOOLEAN,
  reason              TEXT
) AS $$
DECLARE
  v_vt_count INTEGER;
  v_rc_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_vt_count
    FROM public.vehicle_types
    WHERE tenant_id = p_tenant_id AND is_active = true;

  SELECT COUNT(*) INTO v_rc_count
    FROM public.rate_cards
    WHERE tenant_id = p_tenant_id AND is_active = true;

  has_vehicle_types := v_vt_count > 0;
  has_rate_cards    := v_rc_count > 0;
  can_enable        := has_vehicle_types AND has_rate_cards;

  IF can_enable THEN
    reason := 'ok';
  ELSIF NOT has_vehicle_types AND NOT has_rate_cards THEN
    reason := 'Voeg eerst voertuigtypen en minstens een tariefkaart toe.';
  ELSIF NOT has_vehicle_types THEN
    reason := 'Voeg eerst voertuigtypen toe in Stamgegevens.';
  ELSE
    reason := 'Voeg eerst een tariefkaart toe voor minstens een klant.';
  END IF;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.can_enable_pricing(UUID) IS
  'Pre-flight check voor tariefmotor-activering. UI toggle is disabled zolang can_enable = false.';

GRANT EXECUTE ON FUNCTION public.is_pricing_engine_enabled(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_enable_pricing(UUID)        TO authenticated, service_role;

-- ─── ROLLBACK ─────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.can_enable_pricing(UUID);
-- DROP FUNCTION IF EXISTS public.is_pricing_engine_enabled(UUID);
