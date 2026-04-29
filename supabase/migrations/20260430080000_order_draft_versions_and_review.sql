ALTER TABLE public.order_drafts
  ADD COLUMN IF NOT EXISTS draft_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS validation_engine_version TEXT NOT NULL DEFAULT 'order-readiness-v1',
  ADD COLUMN IF NOT EXISTS pricing_engine_version TEXT NOT NULL DEFAULT 'pricing-v2-2026-04',
  ADD COLUMN IF NOT EXISTS cancelled_reason TEXT,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE public.order_drafts
  DROP CONSTRAINT IF EXISTS order_drafts_status_check;

ALTER TABLE public.order_drafts
  ADD CONSTRAINT order_drafts_status_check
    CHECK (status IN ('DRAFT', 'PENDING', 'NEEDS_REVIEW', 'PLANNED', 'CANCELLED', 'ON_HOLD'));

ALTER TABLE public.order_drafts
  DROP CONSTRAINT IF EXISTS order_drafts_ready_requires_no_blockers_check;

ALTER TABLE public.order_drafts
  ADD CONSTRAINT order_drafts_ready_requires_no_blockers_check
    CHECK (
      status IN ('DRAFT', 'NEEDS_REVIEW', 'CANCELLED', 'ON_HOLD')
      OR jsonb_array_length(COALESCE(validation_result->'blockers', '[]'::jsonb)) = 0
    );

ALTER TABLE public.order_drafts
  DROP CONSTRAINT IF EXISTS order_drafts_cancelled_reason_check;

ALTER TABLE public.order_drafts
  ADD CONSTRAINT order_drafts_cancelled_reason_check
    CHECK (
      status <> 'CANCELLED'
      OR length(trim(COALESCE(cancelled_reason, ''))) > 0
    );

CREATE INDEX IF NOT EXISTS idx_order_drafts_archived_at
  ON public.order_drafts (tenant_id, archived_at)
  WHERE archived_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.order_drafts_version_and_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  snapshot_changed BOOLEAN;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  snapshot_changed :=
    NEW.payload IS DISTINCT FROM OLD.payload
    OR NEW.validation_result IS DISTINCT FROM OLD.validation_result
    OR NEW.manual_overrides IS DISTINCT FROM OLD.manual_overrides
    OR NEW.committed_shipment_id IS DISTINCT FROM OLD.committed_shipment_id
    OR NEW.committed_at IS DISTINCT FROM OLD.committed_at
    OR NEW.validation_engine_version IS DISTINCT FROM OLD.validation_engine_version
    OR NEW.pricing_engine_version IS DISTINCT FROM OLD.pricing_engine_version;

  IF OLD.committed_shipment_id IS NOT NULL AND snapshot_changed THEN
    RAISE EXCEPTION
      'Committed order draft snapshot is immutable. Archive, cancel, or create a new review instead.';
  END IF;

  IF OLD.committed_shipment_id IS NULL AND snapshot_changed THEN
    NEW.draft_version := COALESCE(OLD.draft_version, 1) + 1;
  ELSE
    NEW.draft_version := COALESCE(OLD.draft_version, NEW.draft_version, 1);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_drafts_version_and_immutability ON public.order_drafts;
CREATE TRIGGER trg_order_drafts_version_and_immutability
  BEFORE UPDATE ON public.order_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.order_drafts_version_and_immutability();

COMMENT ON COLUMN public.order_drafts.draft_version IS
  'Monotone versie van dezelfde draft. Wordt verhoogd bij autosave/snapshot-wijziging zolang de draft niet gecommit is.';

COMMENT ON COLUMN public.order_drafts.validation_engine_version IS
  'Versie van de readiness-validatie waarmee validation_result is gemaakt.';

COMMENT ON COLUMN public.order_drafts.pricing_engine_version IS
  'Versie van de tariefmotor waarmee pricing in de draft/snapshot is bepaald.';

COMMENT ON COLUMN public.order_drafts.cancelled_reason IS
  'Verplichte reden wanneer de draft/order-draft lifecycle naar CANCELLED gaat.';

COMMENT ON COLUMN public.order_drafts.archived_at IS
  'Soft archive timestamp. Draft blijft auditbaar en wordt niet hard verwijderd.';

CREATE OR REPLACE FUNCTION public.validate_order_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF OLD.status IN ('DELIVERED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Cannot change status from % - terminal state', OLD.status;
  END IF;
  IF NEW.status = 'CANCELLED' THEN RETURN NEW; END IF;
  IF (OLD.status = 'DRAFT' AND NEW.status = 'PENDING') OR
     (OLD.status = 'PENDING' AND NEW.status = 'NEEDS_REVIEW') OR
     (OLD.status = 'NEEDS_REVIEW' AND NEW.status = 'PENDING') OR
     (OLD.status = 'PENDING' AND NEW.status = 'PLANNED') OR
     (OLD.status = 'PLANNED' AND NEW.status = 'IN_TRANSIT') OR
     (OLD.status = 'IN_TRANSIT' AND NEW.status = 'DELIVERED') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Invalid status transition: % -> %', OLD.status, NEW.status;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_pending_order_needs_review()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'PENDING'
     AND NEW.status = 'PENDING'
     AND (
       NEW.pickup_address IS DISTINCT FROM OLD.pickup_address
       OR NEW.delivery_address IS DISTINCT FROM OLD.delivery_address
       OR NEW.quantity IS DISTINCT FROM OLD.quantity
       OR NEW.unit IS DISTINCT FROM OLD.unit
       OR NEW.weight_kg IS DISTINCT FROM OLD.weight_kg
       OR NEW.transport_type IS DISTINCT FROM OLD.transport_type
       OR NEW.time_window_start IS DISTINCT FROM OLD.time_window_start
       OR NEW.time_window_end IS DISTINCT FROM OLD.time_window_end
     ) THEN
    NEW.status := 'NEEDS_REVIEW';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_pending_order_needs_review ON public.orders;
CREATE TRIGGER trg_mark_pending_order_needs_review
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.mark_pending_order_needs_review();

COMMENT ON FUNCTION public.mark_pending_order_needs_review() IS
  'Zet een PENDING order automatisch naar NEEDS_REVIEW wanneer uitvoerbaarheid-kritische ordervelden wijzigen.';

CREATE OR REPLACE FUNCTION public.mark_pending_shipment_needs_review()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'PENDING'
     AND NEW.status = 'PENDING'
     AND (
       NEW.origin_address IS DISTINCT FROM OLD.origin_address
       OR NEW.destination_address IS DISTINCT FROM OLD.destination_address
       OR NEW.vehicle_type IS DISTINCT FROM OLD.vehicle_type
       OR NEW.cargo IS DISTINCT FROM OLD.cargo
       OR NEW.pmt IS DISTINCT FROM OLD.pmt
       OR NEW.price_total_cents IS DISTINCT FROM OLD.price_total_cents
       OR NEW.pricing IS DISTINCT FROM OLD.pricing
     ) THEN
    NEW.status := 'NEEDS_REVIEW';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_pending_shipment_needs_review ON public.shipments;
CREATE TRIGGER trg_mark_pending_shipment_needs_review
  BEFORE UPDATE ON public.shipments
  FOR EACH ROW
  EXECUTE FUNCTION public.mark_pending_shipment_needs_review();

COMMENT ON FUNCTION public.mark_pending_shipment_needs_review() IS
  'Zet een PENDING shipment automatisch naar NEEDS_REVIEW wanneer route-, lading-, PMT- of pricing-kritische velden wijzigen.';
