-- ──────────────────────────────────────────────────────────────────────────
-- §23 Order-notes unread tracker — per gebruiker
--
-- Probleem: notities/referentie op een order worden geüpdatet, maar niemand
-- ziet wie wat al gelezen heeft. Resultaat: dispatchers missen wijzigingen,
-- of openen alles "voor de zekerheid".
--
-- Oplossing: orders.notes_updated_at wordt automatisch bijgehouden via
-- trigger; per (user, order) registreren we read_at. Unread = notes_updated_at
-- > read_at (of geen rij). Geen polling, geen N+1.
-- ──────────────────────────────────────────────────────────────────────────

-- ─── 1. orders.notes_updated_at ──────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS notes_updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ─── 2. Trigger: bump notes_updated_at bij notes/reference change ────────
CREATE OR REPLACE FUNCTION public.trg_orders_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.notes IS DISTINCT FROM OLD.notes
     OR NEW.reference IS DISTINCT FROM OLD.reference THEN
    NEW.notes_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_notes_updated_at ON public.orders;
CREATE TRIGGER trg_orders_notes_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_orders_notes_updated_at();

-- ─── 3. order_note_reads ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_note_reads (
  user_id   UUID NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
  order_id  UUID NOT NULL REFERENCES public.orders(id)   ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id)  ON DELETE CASCADE,
  read_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_order_note_reads_order
  ON public.order_note_reads(order_id);
CREATE INDEX IF NOT EXISTS idx_order_note_reads_user_read_at
  ON public.order_note_reads(user_id, read_at DESC);

-- ─── 4. RLS ──────────────────────────────────────────────────────────────
ALTER TABLE public.order_note_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read/write own note-reads"
  ON public.order_note_reads FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid())
  );

CREATE POLICY "Service role full access"
  ON public.order_note_reads FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
