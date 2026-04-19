-- ============================================================
-- REQ-21.7: Vehicle damage notificatie naar fleet-manager
--
-- 1. fleet_manager_email kolom op tenants
-- 2. CHECK constraint uitbreiden met VEHICLE_DAMAGE
-- 3. Template seeden per tenant
-- 4. notify_new_damage trigger vervangen: roept dispatch_notification
--    aan via pg_net zodat send-notification edge function het oppikt
-- ============================================================

-- ─── 1. fleet_manager_email op tenants ──────────────────────────
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS fleet_manager_email TEXT;

COMMENT ON COLUMN public.tenants.fleet_manager_email
  IS 'E-mailadres van de planner/fleet-manager. Ontvangt damage-meldingen.';

-- ─── 2. CHECK constraint uitbreiden ─────────────────────────────
-- Drop de bestaande constraint en maak een nieuwe met VEHICLE_DAMAGE.
ALTER TABLE public.notification_templates
  DROP CONSTRAINT IF EXISTS notification_templates_trigger_event_check;

ALTER TABLE public.notification_templates
  ADD CONSTRAINT notification_templates_trigger_event_check
  CHECK (trigger_event IN (
    'ORDER_CONFIRMED', 'TRIP_STARTED', 'ETA_CHANGED',
    'DRIVER_ARRIVED', 'DELIVERED', 'EXCEPTION',
    'VEHICLE_DAMAGE'
  ));

-- ─── 3. Template seeden per tenant ──────────────────────────────
INSERT INTO public.notification_templates
  (tenant_id, trigger_event, channel, subject_template, body_template, is_active)
SELECT
  t.id,
  'VEHICLE_DAMAGE',
  'EMAIL',
  'Nieuwe schade op voertuig {{vehicle_code}}',
  'Er is schade geconstateerd bij een voertuigcheck.

Voertuig: {{vehicle_code}}
Zijde: {{side}}
Ernst: {{severity}}
Omschrijving: {{description}}

Toegeschreven chauffeur: {{attributed_driver_name}}
Damage-event ID: {{damage_id}}

Bekijk de details: {{check_url}}

Dit bericht is automatisch verstuurd door {{company_name}}.',
  true
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_templates nt
  WHERE nt.tenant_id = t.id
    AND nt.trigger_event = 'VEHICLE_DAMAGE'
    AND nt.channel = 'EMAIL'
);

-- ─── 4. Trigger vervangen: gebruik dispatch_notification + extra_variables ──
-- De bestaande notify_new_damage schreef rechtstreeks in notification_log.
-- Nu roepen we send-notification aan via pg_net, net als de andere triggers,
-- maar met extra_variables voor de damage-specifieke placeholders.

CREATE OR REPLACE FUNCTION public.notify_new_damage()
RETURNS TRIGGER AS $$
DECLARE
  v_driver_name TEXT;
  v_vehicle_code TEXT;
  v_url TEXT;
  v_service_key TEXT;
  v_check_url TEXT;
  v_public_url TEXT;
BEGIN
  SELECT name INTO v_driver_name
    FROM public.drivers
    WHERE id = NEW.attributed_to_driver_id;

  SELECT code INTO v_vehicle_code
    FROM public.vehicles
    WHERE id = NEW.vehicle_id;

  v_url := current_setting('app.settings.supabase_url', true);
  v_service_key := current_setting('app.settings.supabase_service_role_key', true);

  IF v_url IS NULL OR v_service_key IS NULL THEN
    RAISE NOTICE 'Vehicle damage notification skipped: app.settings not configured';
    RETURN NEW;
  END IF;

  v_public_url := current_setting('app.settings.public_site_url', true);
  IF v_public_url IS NULL THEN
    v_public_url := replace(v_url, '.supabase.co', '.app');
  END IF;
  v_check_url := v_public_url || '/voertuigcheck/' || NEW.discovered_in_check_id::text;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/send-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object(
      'trigger_event', 'VEHICLE_DAMAGE',
      'tenant_id', NEW.tenant_id::text,
      'extra_variables', jsonb_build_object(
        'vehicle_code', COALESCE(v_vehicle_code, NEW.vehicle_id::text),
        'side', NEW.side,
        'severity', NEW.severity,
        'description', COALESCE(NEW.description, ''),
        'attributed_driver_name', COALESCE(v_driver_name, 'Onbekend'),
        'damage_id', NEW.id::text,
        'check_url', v_check_url
      )
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger zelf hoeft niet opnieuw aangemaakt; de functie is vervangen via CREATE OR REPLACE.
