-- Compliance Sprint: Fiscal & Invoice Archive foundation.
--
-- Adds immutable invoice archive snapshots, fiscal locks and an append-only
-- event trail. This supports Dutch fiscal retention without changing the
-- existing invoice UI flow yet.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS fiscal_locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fiscal_lock_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fiscal_archive_id UUID,
  ADD COLUMN IF NOT EXISTS original_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS correction_reason TEXT;

COMMENT ON COLUMN public.invoices.fiscal_locked_at IS
  'Timestamp from which the invoice is considered fiscally locked/archived.';

COMMENT ON COLUMN public.invoices.fiscal_lock_expires_at IS
  'Minimum fiscal retention date. Default archive RPC uses 7 years.';

COMMENT ON COLUMN public.invoices.original_invoice_id IS
  'References the original invoice when this invoice is a correction/credit note.';

CREATE TABLE IF NOT EXISTS public.invoice_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  invoice_number TEXT NOT NULL,
  archive_status TEXT NOT NULL DEFAULT 'locked',
  document_hash TEXT NOT NULL,
  source_snapshot JSONB NOT NULL,
  pdf_url TEXT,
  archived_by UUID,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  fiscal_lock_expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 years'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, invoice_id),
  UNIQUE (tenant_id, invoice_number),
  CONSTRAINT invoice_archive_status_chk CHECK (
    archive_status IN ('locked', 'superseded', 'voided')
  ),
  CONSTRAINT invoice_archive_hash_chk CHECK (document_hash ~ '^[a-f0-9]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_invoice_archive_tenant_archived
  ON public.invoice_archive (tenant_id, archived_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoice_archive_lock_expiry
  ON public.invoice_archive (tenant_id, fiscal_lock_expires_at);

ALTER TABLE public.invoice_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_archive tenant admin read" ON public.invoice_archive;
CREATE POLICY "invoice_archive tenant admin read"
  ON public.invoice_archive
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = invoice_archive.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "invoice_archive service role" ON public.invoice_archive;
CREATE POLICY "invoice_archive service role"
  ON public.invoice_archive
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON public.invoice_archive TO authenticated;
GRANT ALL ON public.invoice_archive TO service_role;

COMMENT ON TABLE public.invoice_archive IS
  'Immutable fiscal archive snapshot for invoices, including hash and 7-year retention lock.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invoices_fiscal_archive_id_fkey'
      AND conrelid = 'public.invoices'::regclass
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_fiscal_archive_id_fkey
      FOREIGN KEY (fiscal_archive_id)
      REFERENCES public.invoice_archive(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.invoice_archive_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  archive_id UUID REFERENCES public.invoice_archive(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_id UUID,
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT invoice_archive_events_type_chk CHECK (
    event_type IN ('archived', 'viewed', 'exported', 'correction_linked', 'lock_blocked')
  )
);

CREATE INDEX IF NOT EXISTS idx_invoice_archive_events_invoice_created
  ON public.invoice_archive_events (invoice_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoice_archive_events_archive_created
  ON public.invoice_archive_events (archive_id, created_at DESC);

ALTER TABLE public.invoice_archive_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_archive_events tenant admin read" ON public.invoice_archive_events;
CREATE POLICY "invoice_archive_events tenant admin read"
  ON public.invoice_archive_events
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = invoice_archive_events.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "invoice_archive_events tenant insert" ON public.invoice_archive_events;
CREATE POLICY "invoice_archive_events tenant insert"
  ON public.invoice_archive_events
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND actor_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "invoice_archive_events service role" ON public.invoice_archive_events;
CREATE POLICY "invoice_archive_events service role"
  ON public.invoice_archive_events
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT ON public.invoice_archive_events TO authenticated;
GRANT ALL ON public.invoice_archive_events TO service_role;

COMMENT ON TABLE public.invoice_archive_events IS
  'Append-only audit trail for fiscal invoice archive access, export and correction events.';

CREATE OR REPLACE FUNCTION public.prevent_invoice_archive_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Invoice archive evidence rows are append-only';
END;
$$;

DROP TRIGGER IF EXISTS prevent_invoice_archive_update ON public.invoice_archive;
CREATE TRIGGER prevent_invoice_archive_update
  BEFORE UPDATE OR DELETE ON public.invoice_archive
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_invoice_archive_mutation();

DROP TRIGGER IF EXISTS prevent_invoice_archive_event_update ON public.invoice_archive_events;
CREATE TRIGGER prevent_invoice_archive_event_update
  BEFORE UPDATE OR DELETE ON public.invoice_archive_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_invoice_archive_mutation();

CREATE OR REPLACE FUNCTION public.prevent_locked_invoice_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.fiscal_locked_at IS NOT NULL THEN
    IF NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
      OR NEW.client_id IS DISTINCT FROM OLD.client_id
      OR NEW.client_name IS DISTINCT FROM OLD.client_name
      OR NEW.client_address IS DISTINCT FROM OLD.client_address
      OR NEW.client_btw_number IS DISTINCT FROM OLD.client_btw_number
      OR NEW.client_kvk_number IS DISTINCT FROM OLD.client_kvk_number
      OR NEW.invoice_date IS DISTINCT FROM OLD.invoice_date
      OR NEW.due_date IS DISTINCT FROM OLD.due_date
      OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
      OR NEW.btw_percentage IS DISTINCT FROM OLD.btw_percentage
      OR NEW.btw_amount IS DISTINCT FROM OLD.btw_amount
      OR NEW.total IS DISTINCT FROM OLD.total
      OR NEW.pdf_url IS DISTINCT FROM OLD.pdf_url
    THEN
      RAISE EXCEPTION 'Fiscal locked invoices cannot be changed; create a correction invoice instead';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_locked_invoice_mutation ON public.invoices;
CREATE TRIGGER prevent_locked_invoice_mutation
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_locked_invoice_mutation();

CREATE OR REPLACE FUNCTION public.archive_invoice_snapshot(
  p_invoice_id UUID,
  p_source_snapshot JSONB DEFAULT '{}'::jsonb,
  p_retention_years INTEGER DEFAULT 7
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID := public.current_tenant_id();
  v_invoice public.invoices%ROWTYPE;
  v_archive public.invoice_archive%ROWTYPE;
  v_archive_id UUID;
  v_snapshot JSONB;
  v_hash TEXT;
  v_retention_years INTEGER := GREATEST(COALESCE(p_retention_years, 7), 7);
  v_lock_expires_at TIMESTAMPTZ;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Missing tenant context';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = v_tenant_id
      AND tm.user_id = auth.uid()
      AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text])
  ) THEN
    RAISE EXCEPTION 'Insufficient privileges for invoice archiving';
  END IF;

  SELECT *
  INTO v_invoice
  FROM public.invoices
  WHERE tenant_id = v_tenant_id AND id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found in tenant';
  END IF;

  IF v_invoice.status NOT IN ('verzonden', 'betaald') THEN
    RAISE EXCEPTION 'Only sent or paid invoices can be fiscally archived';
  END IF;

  SELECT *
  INTO v_archive
  FROM public.invoice_archive
  WHERE tenant_id = v_tenant_id AND invoice_id = p_invoice_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'archive_id', v_archive.id,
      'invoice_id', v_archive.invoice_id,
      'invoice_number', v_archive.invoice_number,
      'document_hash', v_archive.document_hash,
      'status', 'already_archived',
      'fiscal_lock_expires_at', v_archive.fiscal_lock_expires_at
    );
  END IF;

  v_lock_expires_at := now() + make_interval(years => v_retention_years);
  v_snapshot := jsonb_build_object(
    'invoice', jsonb_build_object(
      'id', v_invoice.id,
      'invoice_number', v_invoice.invoice_number,
      'client_id', v_invoice.client_id,
      'client_name', v_invoice.client_name,
      'client_address', v_invoice.client_address,
      'client_btw_number', v_invoice.client_btw_number,
      'client_kvk_number', v_invoice.client_kvk_number,
      'status', v_invoice.status,
      'invoice_date', v_invoice.invoice_date,
      'due_date', v_invoice.due_date,
      'subtotal', v_invoice.subtotal,
      'btw_percentage', v_invoice.btw_percentage,
      'btw_amount', v_invoice.btw_amount,
      'total', v_invoice.total,
      'notes', v_invoice.notes,
      'pdf_url', v_invoice.pdf_url,
      'created_at', v_invoice.created_at,
      'updated_at', v_invoice.updated_at
    ),
    'archived_at', now(),
    'retention_years', v_retention_years,
    'source_snapshot', COALESCE(p_source_snapshot, '{}'::jsonb)
  );

  v_hash := encode(digest(v_snapshot::text, 'sha256'), 'hex');

  INSERT INTO public.invoice_archive (
    tenant_id,
    invoice_id,
    invoice_number,
    archive_status,
    document_hash,
    source_snapshot,
    pdf_url,
    archived_by,
    fiscal_lock_expires_at
  ) VALUES (
    v_tenant_id,
    p_invoice_id,
    v_invoice.invoice_number,
    'locked',
    v_hash,
    v_snapshot,
    v_invoice.pdf_url,
    auth.uid(),
    v_lock_expires_at
  )
  RETURNING id INTO v_archive_id;

  UPDATE public.invoices
  SET
    fiscal_locked_at = now(),
    fiscal_lock_expires_at = v_lock_expires_at,
    fiscal_archive_id = v_archive_id,
    updated_at = now()
  WHERE tenant_id = v_tenant_id AND id = p_invoice_id;

  INSERT INTO public.invoice_archive_events (
    tenant_id,
    archive_id,
    invoice_id,
    event_type,
    actor_id,
    note,
    metadata
  ) VALUES (
    v_tenant_id,
    v_archive_id,
    p_invoice_id,
    'archived',
    auth.uid(),
    'Invoice fiscally archived and locked',
    jsonb_build_object(
      'document_hash', v_hash,
      'retention_years', v_retention_years,
      'fiscal_lock_expires_at', v_lock_expires_at
    )
  );

  RETURN jsonb_build_object(
    'archive_id', v_archive_id,
    'invoice_id', p_invoice_id,
    'invoice_number', v_invoice.invoice_number,
    'document_hash', v_hash,
    'status', 'archived',
    'fiscal_lock_expires_at', v_lock_expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.archive_invoice_snapshot(UUID, JSONB, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_invoice_snapshot(UUID, JSONB, INTEGER) TO authenticated, service_role;

COMMENT ON FUNCTION public.archive_invoice_snapshot(UUID, JSONB, INTEGER) IS
  'Creates immutable fiscal invoice archive snapshot with SHA-256 hash and minimum 7-year lock.';

CREATE OR REPLACE FUNCTION public.log_invoice_archive_access(
  p_archive_id UUID,
  p_event_type TEXT DEFAULT 'viewed',
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID := public.current_tenant_id();
  v_archive public.invoice_archive%ROWTYPE;
  v_event_id UUID;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Missing tenant context';
  END IF;

  SELECT *
  INTO v_archive
  FROM public.invoice_archive
  WHERE tenant_id = v_tenant_id AND id = p_archive_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice archive not found in tenant';
  END IF;

  INSERT INTO public.invoice_archive_events (
    tenant_id,
    archive_id,
    invoice_id,
    event_type,
    actor_id,
    metadata
  ) VALUES (
    v_tenant_id,
    p_archive_id,
    v_archive.invoice_id,
    p_event_type,
    auth.uid(),
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_invoice_archive_access(UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_invoice_archive_access(UUID, TEXT, JSONB) TO authenticated, service_role;

COMMENT ON FUNCTION public.log_invoice_archive_access(UUID, TEXT, JSONB) IS
  'Writes append-only evidence when archived invoice data is viewed or exported.';
