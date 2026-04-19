-- Audit log table for tracking all changes
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_fields text[],
  user_id uuid REFERENCES auth.users(id),
  user_email text,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_table ON public.audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_log_record ON public.audit_log(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON public.audit_log(user_id);

-- Auto-audit trigger for orders table
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _user_id uuid;
  _user_email text;
  _changed text[];
  _key text;
BEGIN
  _user_id := auth.uid();
  SELECT email INTO _user_email FROM auth.users WHERE id = _user_id;

  IF TG_OP = 'UPDATE' THEN
    -- Find changed fields
    FOR _key IN SELECT jsonb_object_keys(to_jsonb(NEW)) LOOP
      IF to_jsonb(NEW) -> _key IS DISTINCT FROM to_jsonb(OLD) -> _key THEN
        _changed := array_append(_changed, _key);
      END IF;
    END LOOP;

    INSERT INTO public.audit_log (table_name, record_id, action, old_data, new_data, changed_fields, user_id, user_email)
    VALUES (TG_TABLE_NAME, OLD.id::text, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), _changed, _user_id, _user_email);
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (table_name, record_id, action, new_data, user_id, user_email)
    VALUES (TG_TABLE_NAME, NEW.id::text, 'INSERT', to_jsonb(NEW), _user_id, _user_email);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (table_name, record_id, action, old_data, user_id, user_email)
    VALUES (TG_TABLE_NAME, OLD.id::text, 'DELETE', to_jsonb(OLD), _user_id, _user_email);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Attach triggers to critical tables
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_orders') THEN
    CREATE TRIGGER audit_orders AFTER INSERT OR UPDATE OR DELETE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_clients') THEN
    CREATE TRIGGER audit_clients AFTER INSERT OR UPDATE OR DELETE ON public.clients
    FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_vehicles') THEN
    CREATE TRIGGER audit_vehicles AFTER INSERT OR UPDATE OR DELETE ON public.vehicles
    FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();
  END IF;
END;
$$;

-- Webhook subscriptions table
CREATE TABLE IF NOT EXISTS public.webhook_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id),
  url text NOT NULL,
  events text[] NOT NULL DEFAULT '{}',
  secret text,
  is_active boolean DEFAULT true,
  last_triggered_at timestamptz,
  failure_count int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Driver GPS positions table
CREATE TABLE IF NOT EXISTS public.driver_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy double precision,
  speed double precision,
  heading double precision,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_positions_driver ON public.driver_positions(driver_id, recorded_at DESC);

-- Driver time entries table
CREATE TABLE IF NOT EXISTS public.driver_time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('clock_in', 'clock_out', 'break_start', 'break_end', 'drive_start', 'drive_end')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  latitude double precision,
  longitude double precision,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_driver_time_driver ON public.driver_time_entries(driver_id, recorded_at DESC);
