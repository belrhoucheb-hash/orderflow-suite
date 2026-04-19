-- ──────────────────────────────────────────────────────────────────────────
-- §22 Info-tracking — "incompleet maar planbaar"
--
-- Probleem: dossier compleet ≠ dossier planbaar. Orders zonder laadref etc.
-- werden ofwel vastgehouden (→ dedicated rit) of ingepland zonder dat iemand
-- de klant achter z'n broek zat (→ chauffeur zonder ref op laadadres).
--
-- Oplossing: parallelle dimensie `info_status` (COMPLETE/AWAITING_INFO/OVERDUE),
-- afgeleid uit openstaande `order_info_requests`. Blokkeert inplannen NIET.
-- DRAFT-guard (dept_id verplicht) blijft ongewijzigd.
-- ──────────────────────────────────────────────────────────────────────────

-- ─── 1. orders.info_status ───────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS info_status TEXT NOT NULL DEFAULT 'COMPLETE'
    CHECK (info_status IN ('COMPLETE', 'AWAITING_INFO', 'OVERDUE'));

CREATE INDEX IF NOT EXISTS idx_orders_info_status
  ON public.orders(tenant_id, info_status)
  WHERE info_status <> 'COMPLETE';

-- ─── 2. order_info_requests ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_info_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,

  -- Welke info nog ontbreekt (vrij label zodat we flexibel zijn):
  -- 'laadreferentie' | 'losreferentie' | 'mrn' | 'contact_person'
  -- | 'pickup_time_window' | 'delivery_time_window' | ...
  field_name TEXT NOT NULL,
  field_label TEXT,          -- human-readable label voor UI/mail

  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'FULFILLED', 'OVERDUE', 'CANCELLED')),

  -- Wie beloofde te leveren
  promised_by_contact_id UUID,   -- optioneel FK; laten we losjes (geen hard FK om migratie-volgorde te vermijden)
  promised_by_name TEXT,
  promised_by_email TEXT,

  promised_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expected_by TIMESTAMPTZ,       -- default T-4u vóór pickup (UI rekent uit)

  fulfilled_at TIMESTAMPTZ,
  fulfilled_value TEXT,
  fulfilled_source TEXT,         -- 'inbox_reply' | 'manual' | 'portal'

  reminder_sent_at TIMESTAMPTZ[] NOT NULL DEFAULT '{}',
  escalated_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_info_requests_order
  ON public.order_info_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_order_info_requests_tenant_status
  ON public.order_info_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_order_info_requests_expected_by
  ON public.order_info_requests(expected_by)
  WHERE status = 'PENDING';

-- Eén open request per (order, field) — voorkomt dubbele rappellijst
CREATE UNIQUE INDEX IF NOT EXISTS ux_order_info_requests_open_field
  ON public.order_info_requests(order_id, field_name)
  WHERE status = 'PENDING';

-- ─── 3. RLS ──────────────────────────────────────────────────────────────
ALTER TABLE public.order_info_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for order_info_requests"
  ON public.order_info_requests FOR ALL
  USING (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()));

CREATE POLICY "Service role full access on order_info_requests"
  ON public.order_info_requests FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ─── 4. Afgeleide info_status op orders ──────────────────────────────────
-- Wordt bijgewerkt bij elke INSERT/UPDATE/DELETE op order_info_requests.
CREATE OR REPLACE FUNCTION public.recompute_order_info_status(p_order_id UUID)
RETURNS VOID AS $$
DECLARE
  v_pending INT;
  v_overdue INT;
  v_new_status TEXT;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE status = 'PENDING'),
    COUNT(*) FILTER (WHERE status = 'PENDING' AND expected_by IS NOT NULL AND expected_by < now())
    + COUNT(*) FILTER (WHERE status = 'OVERDUE')
  INTO v_pending, v_overdue
  FROM public.order_info_requests
  WHERE order_id = p_order_id;

  IF v_pending = 0 THEN
    v_new_status := 'COMPLETE';
  ELSIF v_overdue > 0 THEN
    v_new_status := 'OVERDUE';
  ELSE
    v_new_status := 'AWAITING_INFO';
  END IF;

  UPDATE public.orders
     SET info_status = v_new_status,
         updated_at  = now()
   WHERE id = p_order_id
     AND info_status IS DISTINCT FROM v_new_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.trg_order_info_requests_sync()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_order_info_status(OLD.order_id);
    RETURN OLD;
  ELSE
    NEW.updated_at := now();
    PERFORM public.recompute_order_info_status(NEW.order_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_info_requests_sync ON public.order_info_requests;
CREATE TRIGGER trg_order_info_requests_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.order_info_requests
  FOR EACH ROW EXECUTE FUNCTION public.trg_order_info_requests_sync();

-- ─── 5. Periodieke overdue-sweep ─────────────────────────────────────────
-- PENDING-requests waarvan expected_by voorbij is → markeer OVERDUE +
-- recompute info_status op bijhorende order. Wordt gecrond door de
-- edge-function `check-info-requests` (15 min) of fallback via pg_cron.
CREATE OR REPLACE FUNCTION public.sweep_overdue_info_requests()
RETURNS INT AS $$
DECLARE
  v_count INT := 0;
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, order_id
      FROM public.order_info_requests
     WHERE status = 'PENDING'
       AND expected_by IS NOT NULL
       AND expected_by < now()
  LOOP
    UPDATE public.order_info_requests
       SET status = 'OVERDUE',
           escalated_at = COALESCE(escalated_at, now())
     WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
