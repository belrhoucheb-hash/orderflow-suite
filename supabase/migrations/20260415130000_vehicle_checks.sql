-- ──────────────────────────────────────────────────────────────────────────
-- Pre-trip voertuigcheck — hard gate met AI-schade-detectie
--
-- Chauffeur kan pas orders zien/starten nadat voertuigcheck OK is.
-- Foto's worden per zijde vergeleken met de laatste OK-check (baseline);
-- Gemini markeert verschillen als minor of blocking.
-- ──────────────────────────────────────────────────────────────────────────

-- ─── 1. vehicle_checks ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vehicle_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  signature_url TEXT,
  ai_summary TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','OK','DAMAGE_FOUND','RELEASED')),
  released_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  released_at TIMESTAMPTZ,
  release_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_checks_tenant ON public.vehicle_checks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_checks_driver_vehicle_date
  ON public.vehicle_checks(driver_id, vehicle_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_checks_status ON public.vehicle_checks(status);

ALTER TABLE public.vehicle_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for vehicle_checks"
  ON public.vehicle_checks FOR ALL
  USING (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()));

CREATE POLICY "Service role full access on vehicle_checks"
  ON public.vehicle_checks FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ─── 2. vehicle_check_photos ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vehicle_check_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id UUID NOT NULL REFERENCES public.vehicle_checks(id) ON DELETE CASCADE,
  side TEXT NOT NULL
    CHECK (side IN ('front','rear','left','right','interior_front','interior_cargo')),
  storage_path TEXT NOT NULL,
  ai_description TEXT,
  ai_diff TEXT,
  severity TEXT NOT NULL DEFAULT 'none'
    CHECK (severity IN ('none','minor','blocking')),
  baseline_photo_id UUID REFERENCES public.vehicle_check_photos(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_check_photos_check ON public.vehicle_check_photos(check_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_check_photos_side ON public.vehicle_check_photos(side);

ALTER TABLE public.vehicle_check_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for vehicle_check_photos"
  ON public.vehicle_check_photos FOR ALL
  USING (check_id IN (
    SELECT vc.id FROM public.vehicle_checks vc
    WHERE vc.tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid())
  ))
  WITH CHECK (check_id IN (
    SELECT vc.id FROM public.vehicle_checks vc
    WHERE vc.tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid())
  ));

CREATE POLICY "Service role full access on vehicle_check_photos"
  ON public.vehicle_check_photos FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ─── 3. Storage bucket voor foto's ───────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('vehicle-checks', 'vehicle-checks', false)
ON CONFLICT (id) DO NOTHING;

-- Alleen leden van dezelfde tenant mogen foto's uit hun eigen checks zien.
-- Storage path conventie: {tenant_id}/{check_id}/{side}.jpg
CREATE POLICY "Tenant read on vehicle-checks bucket"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'vehicle-checks'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Tenant insert on vehicle-checks bucket"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'vehicle-checks'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()
    )
  );

-- ─── 4. Helper: actieve gate-check voor (driver, vehicle, vandaag) ───────
-- Gate is open als er voor vandaag een check bestaat met status OK of
-- RELEASED (= admin/planner heeft DAMAGE_FOUND vrijgegeven).
CREATE OR REPLACE FUNCTION public.driver_gate_passed(
  p_driver_id UUID,
  p_vehicle_id UUID
) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vehicle_checks
    WHERE driver_id = p_driver_id
      AND vehicle_id = p_vehicle_id
      AND status IN ('OK','RELEASED')
      AND completed_at >= date_trunc('day', now())
  );
$$ LANGUAGE sql STABLE;

-- ─── 5. Comments ─────────────────────────────────────────────────────────
COMMENT ON TABLE public.vehicle_checks IS 'Pre-trip voertuigcheck per chauffeur/voertuig/dag. Gate vóór orderlijst.';
COMMENT ON TABLE public.vehicle_check_photos IS 'Foto''s per zijde + AI-beschrijving + diff vs vorige OK-check.';
COMMENT ON COLUMN public.vehicle_checks.status IS 'PENDING tijdens invullen, OK na submit zonder blocking, DAMAGE_FOUND bij blocking severity, RELEASED na handmatige vrijgave door planner.';
COMMENT ON FUNCTION public.driver_gate_passed IS 'True als chauffeur vandaag een geldige (OK/RELEASED) check heeft voor dit voertuig.';
