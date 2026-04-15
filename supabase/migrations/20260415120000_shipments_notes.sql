-- ──────────────────────────────────────────────────────────────────────────
-- §23 Shipment-level notes — één notitie voor alle legs
--
-- Probleem: `orders.notes` staat per leg. Een zending met 2 legs dwong de
-- planner hetzelfde memo tweemaal te typen (en uit sync te laten lopen).
--
-- Oplossing: `shipments.notes` als single source of truth op zending-niveau.
-- Leg-notes blijven bestaan voor leg-specifieke opmerkingen; UI toont beide.
-- `notes_updated_at` geeft planners zicht op hoe vers de notitie is.
-- ──────────────────────────────────────────────────────────────────────────

-- ─── 1. Kolommen ─────────────────────────────────────────────────────────
ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS notes_updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ─── 2. Trigger: bump notes_updated_at bij echte inhoudswijziging ─────────
CREATE OR REPLACE FUNCTION public.trg_shipments_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.notes IS DISTINCT FROM OLD.notes THEN
    NEW.notes_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_shipments_notes_updated_at ON public.shipments;
CREATE TRIGGER trg_shipments_notes_updated_at
  BEFORE UPDATE ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.trg_shipments_notes_updated_at();
