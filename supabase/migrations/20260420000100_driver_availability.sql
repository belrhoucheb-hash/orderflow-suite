-- ══════════════════════════════════════════════════════════════════════════
-- Sprint 3, CP-05 / CP-07. Driver availability per dag.
--
-- Spiegel van vehicle_availability op chauffeur-zijde. Planner zet hier
-- wie er werkt, verlof heeft, ziek is, of rust. Auto-plan-engine (CP-03)
-- filtert hier op voor de pool van beschikbare chauffeurs.
--
-- UNIQUE(tenant_id, driver_id, date) zodat upsert via dagsetup-UI
-- idempotent is. Geen status-rij = default 'werkt' in de UI.
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.driver_availability (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  driver_id       UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'werkt'
                    CHECK (status IN ('werkt','verlof','ziek','rust','afwezig')),
  hours_available INTEGER,
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, driver_id, date)
);

COMMENT ON TABLE public.driver_availability IS
  'Per-dag beschikbaarheid per chauffeur. Bron voor auto-plan pool en CP-07 kalender.';
COMMENT ON COLUMN public.driver_availability.hours_available IS
  'Optioneel. NULL betekent volledige werkdag. Vult contracturen-bewaking (CP-06).';
COMMENT ON COLUMN public.driver_availability.reason IS
  'Vrije toelichting bij verlof, ziekte of afwezigheid.';

CREATE INDEX IF NOT EXISTS idx_driver_availability_tenant_date
  ON public.driver_availability (tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_driver_availability_driver_date
  ON public.driver_availability (driver_id, date);

ALTER TABLE public.driver_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "driver_availability_tenant_select" ON public.driver_availability
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "driver_availability_tenant_insert" ON public.driver_availability
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "driver_availability_tenant_update" ON public.driver_availability
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "driver_availability_tenant_delete" ON public.driver_availability
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "driver_availability_service_role" ON public.driver_availability
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_driver_availability_updated_at ON public.driver_availability;
CREATE TRIGGER update_driver_availability_updated_at
  BEFORE UPDATE ON public.driver_availability
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ─── ROLLBACK ─────────────────────────────────────────────────
-- DROP TABLE IF EXISTS public.driver_availability CASCADE;