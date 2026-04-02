-- Tenant settings table for persisting integration/notification/SMS settings
CREATE TABLE IF NOT EXISTS public.tenant_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  category text NOT NULL, -- 'integrations', 'notifications', 'sms', 'general'
  settings jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, category)
);

ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON tenant_settings
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
