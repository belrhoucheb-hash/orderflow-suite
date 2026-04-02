-- ============================================================
-- Migration: Invoices tables + Order status transition trigger
-- Date: 2026-03-29
-- ============================================================

-- ─── 0. ENSURE handle_updated_at EXISTS ─────────────────────

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ─── 1. INVOICES TABLE ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.invoices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id),
  invoice_number text NOT NULL,
  client_id     uuid REFERENCES public.clients(id),
  client_name   text,
  client_address text,
  client_btw_number text,
  client_kvk_number text,
  status        text NOT NULL DEFAULT 'concept'
                  CHECK (status IN ('concept', 'verzonden', 'betaald', 'vervallen')),
  invoice_date  date NOT NULL DEFAULT CURRENT_DATE,
  due_date      date,
  subtotal      numeric(10,2) NOT NULL DEFAULT 0,
  btw_percentage numeric(5,2) NOT NULL DEFAULT 21.00,
  btw_amount    numeric(10,2) NOT NULL DEFAULT 0,
  total         numeric(10,2) NOT NULL DEFAULT 0,
  notes         text,
  pdf_url       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, invoice_number)
);

-- Auto-update updated_at
CREATE TRIGGER set_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ─── 2. INVOICE LINES TABLE ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.invoice_lines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  order_id    uuid REFERENCES public.orders(id),
  description text NOT NULL,
  quantity    numeric(10,2) NOT NULL DEFAULT 1,
  unit        text NOT NULL DEFAULT 'stuk',
  unit_price  numeric(10,2) NOT NULL DEFAULT 0,
  total       numeric(10,2) NOT NULL DEFAULT 0,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── 3. INVOICE NUMBER GENERATOR ───────────────────────────

CREATE OR REPLACE FUNCTION public.generate_invoice_number(p_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  next_seq integer;
  year_str text;
BEGIN
  year_str := to_char(CURRENT_DATE, 'YYYY');

  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(invoice_number, '-', 3) AS integer)
  ), 0) + 1
  INTO next_seq
  FROM public.invoices
  WHERE tenant_id = p_tenant_id
    AND invoice_number LIKE 'FAC-' || year_str || '-%';

  RETURN 'FAC-' || year_str || '-' || LPAD(next_seq::text, 4, '0');
END;
$$;

-- ─── 4. ADD invoice_id FK ON ORDERS (if not exists) ────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'invoice_id'
  ) THEN
    ALTER TABLE public.orders
      ADD COLUMN invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;
  END IF;
END;
$$;

-- ─── 5. RLS POLICIES FOR INVOICES ──────────────────────────

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;

-- Invoices: tenant isolation
CREATE POLICY "Tenant isolation: invoices SELECT"
  ON public.invoices FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Tenant isolation: invoices INSERT"
  ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Tenant isolation: invoices UPDATE"
  ON public.invoices FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Tenant isolation: invoices DELETE"
  ON public.invoices FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "Service role: invoices"
  ON public.invoices FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Invoice lines: access via invoice's tenant
CREATE POLICY "Tenant isolation: invoice_lines SELECT"
  ON public.invoice_lines FOR SELECT TO authenticated
  USING (invoice_id IN (
    SELECT id FROM public.invoices WHERE tenant_id = (SELECT public.current_tenant_id())
  ));

CREATE POLICY "Tenant isolation: invoice_lines INSERT"
  ON public.invoice_lines FOR INSERT TO authenticated
  WITH CHECK (invoice_id IN (
    SELECT id FROM public.invoices WHERE tenant_id = (SELECT public.current_tenant_id())
  ));

CREATE POLICY "Tenant isolation: invoice_lines UPDATE"
  ON public.invoice_lines FOR UPDATE TO authenticated
  USING (invoice_id IN (
    SELECT id FROM public.invoices WHERE tenant_id = (SELECT public.current_tenant_id())
  ));

CREATE POLICY "Tenant isolation: invoice_lines DELETE"
  ON public.invoice_lines FOR DELETE TO authenticated
  USING (invoice_id IN (
    SELECT id FROM public.invoices WHERE tenant_id = (SELECT public.current_tenant_id())
  ));

CREATE POLICY "Service role: invoice_lines"
  ON public.invoice_lines FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─── 6. INDEXES ────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_invoices_tenant
  ON public.invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_status
  ON public.invoices(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_client
  ON public.invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice
  ON public.invoice_lines(invoice_id);

-- ─── 7. ORDER STATUS TRANSITION TRIGGER ────────────────────
-- Valid transitions:
--   DRAFT    → PENDING, CANCELLED
--   PENDING  → PLANNED, CANCELLED
--   PLANNED  → IN_TRANSIT, CANCELLED
--   IN_TRANSIT → DELIVERED, CANCELLED
--   DELIVERED → (none, terminal)
--   CANCELLED → (none, terminal)

CREATE OR REPLACE FUNCTION public.validate_order_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Allow if status hasn't changed
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Terminal states: no further transitions allowed
  IF OLD.status IN ('DELIVERED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Cannot change status from % — it is a terminal state', OLD.status;
  END IF;

  -- Any active state → CANCELLED is always allowed
  IF NEW.status = 'CANCELLED' THEN
    RETURN NEW;
  END IF;

  -- Validate specific transitions
  IF (OLD.status = 'DRAFT'      AND NEW.status = 'PENDING')    OR
     (OLD.status = 'PENDING'    AND NEW.status = 'PLANNED')    OR
     (OLD.status = 'PLANNED'    AND NEW.status = 'IN_TRANSIT') OR
     (OLD.status = 'IN_TRANSIT' AND NEW.status = 'DELIVERED')  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid status transition: % → %', OLD.status, NEW.status;
END;
$$;

-- Drop trigger if it already exists (idempotent)
DROP TRIGGER IF EXISTS enforce_order_status_transition ON public.orders;

CREATE TRIGGER enforce_order_status_transition
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_order_status_transition();
