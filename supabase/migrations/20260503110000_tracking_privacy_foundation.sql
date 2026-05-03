-- Compliance Sprint: AVG/GPS tracking privacy foundation.
--
-- Adds purpose registry and access logging for live/historical tracking.
-- UI and hook instrumentation can call log_tracking_access whenever a user
-- opens a map, history view, export or customer tracking screen.

CREATE TABLE IF NOT EXISTS public.tracking_purposes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  lawful_basis TEXT NOT NULL DEFAULT 'legitimate_interest',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  CONSTRAINT tracking_purposes_lawful_basis_chk CHECK (
    lawful_basis IN ('legal_obligation', 'contract', 'legitimate_interest', 'consent')
  )
);

CREATE INDEX IF NOT EXISTS idx_tracking_purposes_tenant
  ON public.tracking_purposes (tenant_id, is_active);

DROP TRIGGER IF EXISTS update_tracking_purposes_updated_at ON public.tracking_purposes;
CREATE TRIGGER update_tracking_purposes_updated_at
  BEFORE UPDATE ON public.tracking_purposes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tracking_purposes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tracking_purposes tenant read" ON public.tracking_purposes;
CREATE POLICY "tracking_purposes tenant read"
  ON public.tracking_purposes
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS "tracking_purposes tenant admin write" ON public.tracking_purposes;
CREATE POLICY "tracking_purposes tenant admin write"
  ON public.tracking_purposes
  FOR ALL TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = tracking_purposes.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  )
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = tracking_purposes.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "tracking_purposes service role" ON public.tracking_purposes;
CREATE POLICY "tracking_purposes service role"
  ON public.tracking_purposes
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON public.tracking_purposes TO authenticated;
GRANT ALL ON public.tracking_purposes TO service_role;

COMMENT ON TABLE public.tracking_purposes IS
  'Tenant-level purpose registry for GPS tracking under AVG/GDPR accountability.';

CREATE TABLE IF NOT EXISTS public.tracking_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  trip_id UUID REFERENCES public.trips(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  purpose_code TEXT NOT NULL,
  access_type TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'app',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tracking_access_log_access_type_chk CHECK (
    access_type IN ('live_view', 'history_view', 'export', 'customer_share', 'system_report')
  )
);

CREATE INDEX IF NOT EXISTS idx_tracking_access_log_tenant_created
  ON public.tracking_access_log (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tracking_access_log_driver_created
  ON public.tracking_access_log (driver_id, created_at DESC)
  WHERE driver_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tracking_access_log_vehicle_created
  ON public.tracking_access_log (vehicle_id, created_at DESC)
  WHERE vehicle_id IS NOT NULL;

ALTER TABLE public.tracking_access_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tracking_access_log tenant admin read" ON public.tracking_access_log;
CREATE POLICY "tracking_access_log tenant admin read"
  ON public.tracking_access_log
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = tracking_access_log.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "tracking_access_log tenant insert" ON public.tracking_access_log;
CREATE POLICY "tracking_access_log tenant insert"
  ON public.tracking_access_log
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND user_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "tracking_access_log service role" ON public.tracking_access_log;
CREATE POLICY "tracking_access_log service role"
  ON public.tracking_access_log
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT ON public.tracking_access_log TO authenticated;
GRANT ALL ON public.tracking_access_log TO service_role;

COMMENT ON TABLE public.tracking_access_log IS
  'Audit log for every access to live or historical GPS tracking data.';

CREATE OR REPLACE FUNCTION public.seed_default_tracking_purposes(p_tenant_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.tracking_purposes (
    tenant_id,
    code,
    label,
    description,
    lawful_basis
  ) VALUES
    (p_tenant_id, 'route_execution', 'Route-uitvoering', 'Live uitvoering van actieve ritten en stops.', 'legitimate_interest'),
    (p_tenant_id, 'customer_eta', 'Klant ETA', 'ETA en statusinformatie voor klantcommunicatie.', 'contract'),
    (p_tenant_id, 'safety_incident', 'Veiligheid/incident', 'Onderzoek bij vertraging, schade, incident of calamiteit.', 'legitimate_interest'),
    (p_tenant_id, 'asset_recovery', 'Voertuigbeveiliging', 'Lokaliseren van voertuig bij vermissing of diefstal.', 'legitimate_interest')
  ON CONFLICT (tenant_id, code) DO UPDATE
  SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    lawful_basis = EXCLUDED.lawful_basis,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.seed_default_tracking_purposes(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_default_tracking_purposes(UUID) TO service_role;

DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    PERFORM public.seed_default_tracking_purposes(t.id);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.log_tracking_access(
  p_purpose_code TEXT,
  p_access_type TEXT,
  p_driver_id UUID DEFAULT NULL,
  p_vehicle_id UUID DEFAULT NULL,
  p_trip_id UUID DEFAULT NULL,
  p_order_id UUID DEFAULT NULL,
  p_source TEXT DEFAULT 'app',
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID := public.current_tenant_id();
  v_user_id UUID := auth.uid();
  v_log_id UUID;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Missing tenant context';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tracking_purposes tp
    WHERE tp.tenant_id = v_tenant_id
      AND tp.code = p_purpose_code
      AND tp.is_active = true
  ) THEN
    RAISE EXCEPTION 'Unknown or inactive tracking purpose: %', p_purpose_code;
  END IF;

  INSERT INTO public.tracking_access_log (
    tenant_id,
    user_id,
    driver_id,
    vehicle_id,
    trip_id,
    order_id,
    purpose_code,
    access_type,
    source,
    metadata
  ) VALUES (
    v_tenant_id,
    v_user_id,
    p_driver_id,
    p_vehicle_id,
    p_trip_id,
    p_order_id,
    p_purpose_code,
    p_access_type,
    COALESCE(p_source, 'app'),
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_tracking_access(
  TEXT,
  TEXT,
  UUID,
  UUID,
  UUID,
  UUID,
  TEXT,
  JSONB
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.log_tracking_access(
  TEXT,
  TEXT,
  UUID,
  UUID,
  UUID,
  UUID,
  TEXT,
  JSONB
) TO authenticated, service_role;

COMMENT ON FUNCTION public.log_tracking_access(TEXT, TEXT, UUID, UUID, UUID, UUID, TEXT, JSONB) IS
  'Writes an AVG/GDPR audit entry when a user accesses live or historical tracking data.';
