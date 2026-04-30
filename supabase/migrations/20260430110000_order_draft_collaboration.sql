ALTER TABLE public.order_drafts
  ADD COLUMN IF NOT EXISTS commit_idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS abandoned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS time_to_complete_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS analytics JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.order_drafts
  DROP CONSTRAINT IF EXISTS order_drafts_status_check;

ALTER TABLE public.order_drafts
  ADD CONSTRAINT order_drafts_status_check
    CHECK (status IN ('DRAFT', 'PENDING', 'NEEDS_REVIEW', 'PLANNED', 'CANCELLED', 'ON_HOLD', 'ABANDONED'));

ALTER TABLE public.order_drafts
  DROP CONSTRAINT IF EXISTS order_drafts_ready_requires_no_blockers_check;

ALTER TABLE public.order_drafts
  ADD CONSTRAINT order_drafts_ready_requires_no_blockers_check
    CHECK (
      status IN ('DRAFT', 'NEEDS_REVIEW', 'CANCELLED', 'ON_HOLD', 'ABANDONED')
      OR jsonb_array_length(COALESCE(validation_result->'blockers', '[]'::jsonb)) = 0
    );

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_drafts_commit_idempotency_key
  ON public.order_drafts (tenant_id, commit_idempotency_key)
  WHERE commit_idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_drafts_last_activity
  ON public.order_drafts (tenant_id, last_activity_at)
  WHERE status = 'DRAFT' AND archived_at IS NULL;

CREATE OR REPLACE FUNCTION public.touch_order_draft_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.last_activity_at := now();
    IF NEW.status = 'PENDING' AND OLD.status <> 'PENDING' THEN
      NEW.completed_at := COALESCE(NEW.completed_at, now());
      NEW.time_to_complete_seconds := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - OLD.created_at)))::integer);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_order_draft_activity ON public.order_drafts;
CREATE TRIGGER trg_touch_order_draft_activity
  BEFORE UPDATE ON public.order_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_order_draft_activity();

CREATE OR REPLACE FUNCTION public.archive_abandoned_order_drafts(
  p_before TIMESTAMPTZ DEFAULT now() - interval '30 days'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected INTEGER;
BEGIN
  UPDATE public.order_drafts
     SET status = 'ABANDONED',
         archived_at = COALESCE(archived_at, now()),
         abandoned_at = COALESCE(abandoned_at, now())
   WHERE status = 'DRAFT'
     AND committed_shipment_id IS NULL
     AND archived_at IS NULL
     AND last_activity_at < p_before;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

COMMENT ON COLUMN public.order_drafts.commit_idempotency_key IS
  'Stabiele key voor gereedmelden/retry-flows. Uniek per tenant zodra gevuld.';

COMMENT ON COLUMN public.order_drafts.last_activity_at IS
  'Laatste autosave of lifecycle-actie op deze draft. Basis voor optimistic locking en cleanup.';

COMMENT ON COLUMN public.order_drafts.analytics IS
  'Compacte observability snapshot, zoals wizard-stap, readiness score en aantallen blockers/warnings.';

COMMENT ON FUNCTION public.archive_abandoned_order_drafts(TIMESTAMPTZ) IS
  'Soft-archive oude niet-gecommitte DRAFTS als ABANDONED zonder audit/history te verliezen.';
