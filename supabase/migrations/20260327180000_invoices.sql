-- Invoices table
CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  invoice_number text NOT NULL, -- "FAC-2026-0001"
  client_id uuid NOT NULL REFERENCES clients(id),
  client_name text NOT NULL, -- denormalized for PDF
  client_address text,
  client_btw_number text,
  client_kvk_number text,
  status text NOT NULL DEFAULT 'concept', -- concept, verzonden, betaald, vervallen
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date, -- calculated from client.payment_terms
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  btw_percentage numeric(5,2) NOT NULL DEFAULT 21.00,
  btw_amount numeric(10,2) NOT NULL DEFAULT 0,
  total numeric(10,2) NOT NULL DEFAULT 0,
  notes text,
  pdf_url text, -- Supabase storage URL
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, invoice_number)
);

-- Invoice line items
CREATE TABLE invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id), -- optional link to order
  description text NOT NULL,
  quantity numeric(10,2) NOT NULL DEFAULT 1,
  unit text DEFAULT 'stuk', -- stuk, km, pallet, rit, uur
  unit_price numeric(10,2) NOT NULL,
  total numeric(10,2) NOT NULL, -- quantity * unit_price
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Add invoice_id to orders for linking
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES invoices(id);

-- Indexes
CREATE INDEX idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX idx_invoices_tenant_status ON invoices(tenant_id, status);
CREATE INDEX idx_invoices_client ON invoices(client_id);
CREATE INDEX idx_invoice_lines_invoice ON invoice_lines(invoice_id);
CREATE INDEX idx_orders_invoice ON orders(invoice_id);

-- RLS
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON invoices
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "Tenant isolation via invoice" ON invoice_lines
  FOR ALL TO authenticated
  USING (invoice_id IN (SELECT id FROM invoices WHERE tenant_id = current_tenant_id()))
  WITH CHECK (invoice_id IN (SELECT id FROM invoices WHERE tenant_id = current_tenant_id()));

-- Auto-generate invoice number function
CREATE OR REPLACE FUNCTION generate_invoice_number(p_tenant_id uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  next_num integer;
  year_str text;
BEGIN
  year_str := to_char(CURRENT_DATE, 'YYYY');
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(invoice_number FROM 'FAC-\d{4}-(\d+)') AS integer)
  ), 0) + 1
  INTO next_num
  FROM invoices
  WHERE tenant_id = p_tenant_id
    AND invoice_number LIKE 'FAC-' || year_str || '-%';
  RETURN 'FAC-' || year_str || '-' || LPAD(next_num::text, 4, '0');
END;
$$;
