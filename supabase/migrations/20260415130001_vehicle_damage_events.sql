-- ──────────────────────────────────────────────────────────────────────────
-- Schadehistorie + baseline-seeding voor voertuigcheck
--
-- Wanneer een nieuwe check minor/blocking severity vindt = nieuwe schade
-- tov. de baseline-check. De chauffeur die tijdens de baseline reed heeft
-- het niet gemeld → wordt aangemerkt als attributed_driver. Planner krijgt
-- notification.
-- ──────────────────────────────────────────────────────────────────────────

-- ─── 1. Baseline-seeding markers op vehicle_checks ───────────────────────
ALTER TABLE public.vehicle_checks
  ADD COLUMN IF NOT EXISTS is_baseline_seed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS baseline_check_id UUID REFERENCES public.vehicle_checks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC;

-- Seed-checks: driver_id mag NULL zijn (admin/systeem heeft gemaakt).
ALTER TABLE public.vehicle_checks
  ALTER COLUMN driver_id DROP NOT NULL;

COMMENT ON COLUMN public.vehicle_checks.is_baseline_seed IS 'True = admin heeft deze check aangemaakt als eerste baseline voor dit voertuig.';
COMMENT ON COLUMN public.vehicle_checks.baseline_check_id IS 'Welke eerdere OK-check diende als baseline bij het invullen van deze check.';
COMMENT ON COLUMN public.vehicle_checks.ai_confidence IS 'Zekerheid van de AI-analyse (0-1). Onder 0.7 = zachte waarschuwing, geen hard blok.';

-- ─── 2. damage_events ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vehicle_damage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  discovered_in_check_id UUID NOT NULL REFERENCES public.vehicle_checks(id) ON DELETE CASCADE,
  discovered_by_driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  attributed_to_check_id UUID REFERENCES public.vehicle_checks(id) ON DELETE SET NULL,
  attributed_to_driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  side TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('minor','blocking')),
  description TEXT,
  photo_path TEXT,
  ai_confidence NUMERIC,
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN','ACKNOWLEDGED','DISPUTED','REPAIRED')),
  acknowledged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  repair_notes TEXT,
  repaired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_damage_tenant_vehicle
  ON public.vehicle_damage_events(tenant_id, vehicle_id);
CREATE INDEX IF NOT EXISTS idx_damage_status
  ON public.vehicle_damage_events(status);
CREATE INDEX IF NOT EXISTS idx_damage_attributed_driver
  ON public.vehicle_damage_events(attributed_to_driver_id);

ALTER TABLE public.vehicle_damage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for damage_events"
  ON public.vehicle_damage_events FOR ALL
  USING (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()));

CREATE POLICY "Service role full access on damage_events"
  ON public.vehicle_damage_events FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.vehicle_damage_events IS 'Schadehistorie per voertuig. Attributed aan vorige chauffeur als baseline geen melding had.';
COMMENT ON COLUMN public.vehicle_damage_events.attributed_to_driver_id IS 'Chauffeur die de baseline-check reed — vermoedelijk veroorzaker als schade bij diens check niet gemeld werd.';

-- ─── 3. Notificatie-helper: plannners informeren bij nieuwe schade ───────
-- Schrijft naar notification_log (bestaande tabel). Wordt gelezen door
-- NotificationCenter in de planner-UI.
CREATE OR REPLACE FUNCTION public.notify_new_damage()
RETURNS TRIGGER AS $$
DECLARE
  prev_driver_name TEXT;
  vehicle_code TEXT;
BEGIN
  SELECT name INTO prev_driver_name FROM public.drivers WHERE id = NEW.attributed_to_driver_id;
  SELECT code INTO vehicle_code FROM public.vehicles WHERE id = NEW.vehicle_id;

  -- Best-effort insert; als notification_log niet bestaat, faalt de functie
  -- stil zodat de check-submit zelf niet breekt.
  BEGIN
    INSERT INTO public.notification_log (
      tenant_id, channel, trigger_event, status, subject, body, created_at
    ) VALUES (
      NEW.tenant_id,
      'EMAIL',
      'vehicle_damage',
      'QUEUED',
      'Nieuwe schade op voertuig ' || COALESCE(vehicle_code, NEW.vehicle_id::text) ||
        ' (' || NEW.severity || ')',
      CASE
        WHEN prev_driver_name IS NOT NULL THEN
          'Ontdekt bij check. Mogelijk veroorzaakt door ' || prev_driver_name ||
          ' tijdens vorige dienst — niet gemeld bij einde rit. Zijde: ' || NEW.side ||
          '. Damage-event id: ' || NEW.id::text
        ELSE
          'Ontdekt bij check. Geen baseline-chauffeur bekend (eerste check of seed). ' ||
          'Zijde: ' || NEW.side || '. Damage-event id: ' || NEW.id::text
      END,
      now()
    );
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    -- notification_log niet aanwezig/schema anders → skip, niet fataal.
    NULL;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_new_damage ON public.vehicle_damage_events;
CREATE TRIGGER trg_notify_new_damage
  AFTER INSERT ON public.vehicle_damage_events
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_damage();
