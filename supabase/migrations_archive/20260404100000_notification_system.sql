-- ============================================================
-- Feature 6: Proactieve Klantnotificaties — Schema
-- Tables: notification_templates, notification_log
-- Alters: orders (recipient fields + notification prefs)
-- ============================================================

-- ─── 1. notification_templates ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  trigger_event TEXT NOT NULL CHECK (trigger_event IN (
    'ORDER_CONFIRMED', 'TRIP_STARTED', 'ETA_CHANGED',
    'DRIVER_ARRIVED', 'DELIVERED', 'EXCEPTION'
  )),
  channel TEXT NOT NULL CHECK (channel IN ('EMAIL', 'SMS')),
  subject_template TEXT,  -- nullable for SMS
  body_template TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, trigger_event, channel)
);

ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_templates_tenant_select" ON public.notification_templates
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "notification_templates_tenant_insert" ON public.notification_templates
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "notification_templates_tenant_update" ON public.notification_templates
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "notification_templates_tenant_delete" ON public.notification_templates
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "notification_templates_service_role" ON public.notification_templates
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_notification_templates_tenant ON public.notification_templates(tenant_id);
CREATE INDEX idx_notification_templates_trigger ON public.notification_templates(tenant_id, trigger_event, channel);

-- ─── 2. notification_log ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.notification_templates(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  trip_id UUID REFERENCES public.trips(id) ON DELETE SET NULL,
  recipient_email TEXT,
  recipient_phone TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('EMAIL', 'SMS')),
  trigger_event TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN (
    'QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'BOUNCED'
  )),
  subject TEXT,
  body TEXT,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_log_tenant_select" ON public.notification_log
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "notification_log_tenant_insert" ON public.notification_log
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "notification_log_service_role" ON public.notification_log
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_notification_log_tenant ON public.notification_log(tenant_id);
CREATE INDEX idx_notification_log_order ON public.notification_log(order_id);
CREATE INDEX idx_notification_log_trip ON public.notification_log(trip_id);
CREATE INDEX idx_notification_log_status ON public.notification_log(status);

-- ─── 3. ALTER orders — recipient fields ───────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS recipient_name TEXT,
  ADD COLUMN IF NOT EXISTS recipient_email TEXT,
  ADD COLUMN IF NOT EXISTS recipient_phone TEXT,
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB NOT NULL DEFAULT '{"email": true, "sms": false}';

CREATE INDEX idx_orders_recipient_email ON public.orders(recipient_email) WHERE recipient_email IS NOT NULL;

-- ─── 4. Seed default templates for existing tenants ───────────
-- This inserts default Dutch templates for all tenants that don't have any yet.
INSERT INTO public.notification_templates (tenant_id, trigger_event, channel, subject_template, body_template)
SELECT t.id, ev.trigger_event, ev.channel, ev.subject_template, ev.body_template
FROM public.tenants t
CROSS JOIN (VALUES
  ('ORDER_CONFIRMED', 'EMAIL',
   'Bevestiging order #{{order_number}} — {{company_name}}',
   'Beste {{client_name}},

Uw transportorder #{{order_number}} is bevestigd.

Ophalen: {{pickup_address}}
Leveren: {{delivery_address}}

Volg uw zending: {{track_url}}

Met vriendelijke groet,
{{company_name}}'),
  ('TRIP_STARTED', 'EMAIL',
   'Uw zending #{{order_number}} is onderweg — {{company_name}}',
   'Beste {{client_name}},

Uw zending #{{order_number}} is onderweg naar {{delivery_address}}.
Chauffeur: {{driver_name}}
Verwachte aankomst: {{eta}}

Volg live: {{track_url}}

Met vriendelijke groet,
{{company_name}}'),
  ('TRIP_STARTED', 'SMS',
   NULL,
   '{{company_name}}: Zending #{{order_number}} is onderweg. ETA: {{eta}}. Volg: {{track_url}}'),
  ('ETA_CHANGED', 'EMAIL',
   'Gewijzigde ETA voor zending #{{order_number}} — {{company_name}}',
   'Beste {{client_name}},

De verwachte aankomsttijd voor zending #{{order_number}} is gewijzigd naar {{eta}}.

Volg live: {{track_url}}

Met vriendelijke groet,
{{company_name}}'),
  ('ETA_CHANGED', 'SMS',
   NULL,
   '{{company_name}}: ETA zending #{{order_number}} gewijzigd naar {{eta}}. Volg: {{track_url}}'),
  ('DRIVER_ARRIVED', 'SMS',
   NULL,
   '{{company_name}}: Chauffeur {{driver_name}} is gearriveerd bij {{delivery_address}} voor zending #{{order_number}}.'),
  ('DELIVERED', 'EMAIL',
   'Zending #{{order_number}} afgeleverd — {{company_name}}',
   'Beste {{client_name}},

Uw zending #{{order_number}} is succesvol afgeleverd op {{delivery_address}}.

Bekijk het afleveringsbewijs (POD) en meer details: {{track_url}}

Met vriendelijke groet,
{{company_name}}'),
  ('EXCEPTION', 'EMAIL',
   'Probleem met zending #{{order_number}} — {{company_name}}',
   'Beste {{client_name}},

Er is een probleem opgetreden met uw zending #{{order_number}}.

Ons team neemt zo spoedig mogelijk contact met u op. U kunt de status volgen via: {{track_url}}

Met vriendelijke groet,
{{company_name}}'),
  ('EXCEPTION', 'SMS',
   NULL,
   '{{company_name}}: Probleem met zending #{{order_number}}. Wij nemen contact op. Status: {{track_url}}')
) AS ev(trigger_event, channel, subject_template, body_template)
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_templates nt WHERE nt.tenant_id = t.id
);
