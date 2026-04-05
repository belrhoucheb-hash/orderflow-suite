-- Plan C: Client address book for learned address aliases
-- Each client can have shorthand aliases that map to full addresses

CREATE TABLE IF NOT EXISTS client_address_book (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  resolved_address TEXT NOT NULL,
  resolved_lat NUMERIC,
  resolved_lng NUMERIC,
  usage_count INTEGER NOT NULL DEFAULT 1,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_id, alias)
);

-- Index for lookups by tenant + client
CREATE INDEX idx_client_address_book_tenant_client
  ON client_address_book (tenant_id, client_id);

-- Index for alias text search (case-insensitive)
CREATE INDEX idx_client_address_book_alias_lower
  ON client_address_book (tenant_id, client_id, lower(alias));

-- RLS
ALTER TABLE client_address_book ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for client_address_book"
  ON client_address_book
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tm.tenant_id FROM tenant_members tm
      WHERE tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tm.tenant_id FROM tenant_members tm
      WHERE tm.user_id = auth.uid()
    )
  );

-- Service role bypass for Edge Functions
CREATE POLICY "Service role full access on client_address_book"
  ON client_address_book
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
