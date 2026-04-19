


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."app_role" AS ENUM (
    'admin',
    'medewerker'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_shipment_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.shipment_number IS NULL THEN
    SELECT COALESCE(MAX(shipment_number), 0) + 1
      INTO NEW.shipment_number
      FROM public.shipments
      WHERE tenant_id = NEW.tenant_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."assign_shipment_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_trigger_func"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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


ALTER FUNCTION "public"."audit_trigger_func"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_tenant_inbox_secret"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'vault'
    AS $$
BEGIN
  IF OLD.password_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = OLD.password_secret_id;
  END IF;
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."cleanup_tenant_inbox_secret"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_tenant_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT public.get_user_tenant_id();
$$;


ALTER FUNCTION "public"."current_tenant_id"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."current_tenant_id"() IS 'Returns tenant_id from JWT app_metadata. Used by RLS policies. Wrapped in SELECT for caching.';



CREATE OR REPLACE FUNCTION "public"."dispatch_notification"("p_trigger_event" "text", "p_tenant_id" "uuid", "p_order_id" "uuid" DEFAULT NULL::"uuid", "p_trip_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_url TEXT;
  v_service_key TEXT;
BEGIN
  -- Supabase project URL from config (set in vault or env)
  v_url := current_setting('app.settings.supabase_url', true);
  v_service_key := current_setting('app.settings.supabase_service_role_key', true);

  -- Fallback: skip if not configured (dev environment)
  IF v_url IS NULL OR v_service_key IS NULL THEN
    RAISE NOTICE 'Notification dispatch skipped: app.settings not configured';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/send-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object(
      'trigger_event', p_trigger_event,
      'tenant_id', p_tenant_id::text,
      'order_id', p_order_id::text,
      'trip_id', p_trip_id::text
    )
  );
END;
$$;


ALTER FUNCTION "public"."dispatch_notification"("p_trigger_event" "text", "p_tenant_id" "uuid", "p_order_id" "uuid", "p_trip_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."driver_gate_passed"("p_driver_id" "uuid", "p_vehicle_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vehicle_checks
    WHERE driver_id = p_driver_id
      AND vehicle_id = p_vehicle_id
      AND status IN ('OK','RELEASED')
      AND completed_at >= date_trunc('day', now())
  );
$$;


ALTER FUNCTION "public"."driver_gate_passed"("p_driver_id" "uuid", "p_vehicle_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."driver_gate_passed"("p_driver_id" "uuid", "p_vehicle_id" "uuid") IS 'True als chauffeur vandaag een geldige (OK/RELEASED) check heeft voor dit voertuig.';



CREATE OR REPLACE FUNCTION "public"."enforce_department_on_transition"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Alleen controleren op status-wijziging weg van DRAFT, of op insert non-DRAFT.
  IF (TG_OP = 'INSERT' AND NEW.status <> 'DRAFT' AND NEW.department_id IS NULL)
     OR (TG_OP = 'UPDATE' AND OLD.status = 'DRAFT' AND NEW.status <> 'DRAFT' AND NEW.department_id IS NULL) THEN
    RAISE EXCEPTION 'Order kan niet uit DRAFT zonder afdeling gekoppeld (department_id). Order_id=%', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_department_on_transition"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_tenant_inbox_password"("p_inbox_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'vault'
    AS $$
DECLARE
  v_secret_id uuid;
  v_password text;
BEGIN
  SELECT password_secret_id INTO v_secret_id
    FROM public.tenant_inboxes WHERE id = p_inbox_id;

  IF v_secret_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO v_password
    FROM vault.decrypted_secrets WHERE id = v_secret_id;

  RETURN v_password;
END;
$$;


ALTER FUNCTION "public"."get_tenant_inbox_password"("p_inbox_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_tenant_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::json->'app_metadata'->>'tenant_id')::uuid,
    (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid
  );
$$;


ALTER FUNCTION "public"."get_user_tenant_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _tenant_id uuid;
BEGIN
  -- Create profile
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'display_name', NEW.email));

  -- Assign default role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'medewerker');

  -- Check if tenant_id was passed in user metadata (e.g. invite flow)
  _tenant_id := (NEW.raw_user_meta_data ->> 'tenant_id')::uuid;

  IF _tenant_id IS NOT NULL THEN
    -- Add as member of specified tenant
    INSERT INTO public.tenant_members (tenant_id, user_id, role)
    VALUES (_tenant_id, NEW.id, 'planner')
    ON CONFLICT (tenant_id, user_id) DO NOTHING;

    -- Set tenant_id in app_metadata for JWT
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('tenant_id', _tenant_id)
    WHERE id = NEW.id;

    -- Update profile with tenant
    UPDATE public.profiles SET tenant_id = _tenant_id WHERE user_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;


ALTER FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_rate_limit"("p_key" "text", "p_limit" integer, "p_window_seconds" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_bucket timestamptz;
  v_count int;
BEGIN
  -- Bucket = begin van het huidige venster
  v_bucket := date_trunc('second', now())
            - (extract(epoch FROM now())::int % p_window_seconds) * interval '1 second';

  INSERT INTO public.rate_limit_counters (key, window_start, count)
    VALUES (p_key, v_bucket, 1)
    ON CONFLICT (key, window_start)
    DO UPDATE SET count = rate_limit_counters.count + 1
    RETURNING count INTO v_count;

  -- Opruimen: oude buckets voor deze key (ouder dan 1 uur)
  DELETE FROM public.rate_limit_counters
    WHERE key = p_key AND window_start < now() - interval '1 hour';

  RETURN v_count <= p_limit;
END;
$$;


ALTER FUNCTION "public"."increment_rate_limit"("p_key" "text", "p_limit" integer, "p_window_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."info_tracking_tick"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  r RECORD;
  o RECORD;
BEGIN
  -- 1. Overdue sweep
  PERFORM public.sweep_overdue_info_requests();

  -- 2. Escaleer nieuwe OVERDUE's naar planner-notification (dedup)
  FOR r IN
    SELECT ir.id, ir.order_id, ir.tenant_id, ir.field_name, ir.field_label
      FROM public.order_info_requests ir
     WHERE ir.status = 'OVERDUE'
       AND NOT EXISTS (
         SELECT 1
           FROM public.notifications n
          WHERE n.order_id = ir.order_id
            AND n.type = 'info_escalation'
            AND (n.metadata->>'info_request_id') = ir.id::text
       )
  LOOP
    SELECT order_number, client_name INTO o
      FROM public.orders WHERE id = r.order_id;

    INSERT INTO public.notifications (
      tenant_id, type, title, message, icon, order_id, is_read, metadata
    ) VALUES (
      r.tenant_id,
      'info_escalation',
      'Info verlopen — #' || COALESCE(o.order_number::text, '?'),
      COALESCE(r.field_label, r.field_name)
        || ' nog niet ontvangen van '
        || COALESCE(o.client_name, 'klant') || '.',
      'alert-triangle',
      r.order_id,
      false,
      jsonb_build_object(
        'info_request_id', r.id::text,
        'field_name', r.field_name,
        'source', 'info_tracking_cron'
      )
    );
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."info_tracking_tick"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_new_damage"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."notify_new_damage"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prune_vehicle_check_photos"("days_threshold" integer DEFAULT 180) RETURNS TABLE("deleted_count" integer, "deleted_bytes_estimate" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'storage'
    AS $$
DECLARE
  v_deleted_count INT := 0;
  v_bytes_estimate BIGINT := 0;
  v_photo RECORD;
  v_bucket CONSTANT TEXT := 'vehicle-checks';
BEGIN
  IF days_threshold IS NULL OR days_threshold < 1 THEN
    RAISE EXCEPTION 'days_threshold moet minimaal 1 zijn, kreeg %', days_threshold;
  END IF;

  FOR v_photo IN
    SELECT p.id AS photo_id, p.storage_path
    FROM public.vehicle_check_photos p
    JOIN public.vehicle_checks c ON c.id = p.check_id
    WHERE c.status = 'OK'
      AND c.is_baseline_seed = false
      AND c.completed_at IS NOT NULL
      AND c.completed_at < now() - make_interval(days => days_threshold)
      AND NOT EXISTS (
        SELECT 1 FROM public.vehicle_checks c2
        WHERE c2.baseline_check_id = c.id
      )
  LOOP
    -- Schatting bytes via storage.objects metadata indien aanwezig.
    BEGIN
      SELECT COALESCE((metadata->>'size')::BIGINT, 0)
      INTO v_bytes_estimate
      FROM storage.objects
      WHERE bucket_id = v_bucket AND name = v_photo.storage_path;
    EXCEPTION WHEN OTHERS THEN
      v_bytes_estimate := 0;
    END;

    -- Verwijder object in storage.
    DELETE FROM storage.objects
    WHERE bucket_id = v_bucket AND name = v_photo.storage_path;

    -- Verwijder metadata-rij.
    DELETE FROM public.vehicle_check_photos WHERE id = v_photo.photo_id;

    v_deleted_count := v_deleted_count + 1;
  END LOOP;

  deleted_count := v_deleted_count;
  deleted_bytes_estimate := v_bytes_estimate;
  RETURN NEXT;
END;
$$;


ALTER FUNCTION "public"."prune_vehicle_check_photos"("days_threshold" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."prune_vehicle_check_photos"("days_threshold" integer) IS 'Verwijdert foto''s van OK-checks ouder dan N dagen. DAMAGE_FOUND, RELEASED en baseline-seed blijven behouden. Retourneert aantal verwijderde foto''s.';



CREATE OR REPLACE FUNCTION "public"."recompute_order_info_status"("p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."recompute_order_info_status"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seed_default_cost_types"("p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.cost_types (tenant_id, name, category, calculation_method, default_rate)
  VALUES
    (p_tenant_id, 'Brandstof', 'BRANDSTOF', 'PER_KM', NULL),
    (p_tenant_id, 'Tolkosten', 'TOL', 'HANDMATIG', NULL),
    (p_tenant_id, 'Chauffeurkosten', 'CHAUFFEUR', 'PER_UUR', NULL),
    (p_tenant_id, 'Voertuigkosten (vast)', 'VOERTUIG', 'PER_RIT', NULL),
    (p_tenant_id, 'Wachtgeld', 'CHAUFFEUR', 'PER_UUR', NULL),
    (p_tenant_id, 'Overige kosten', 'OVERIG', 'HANDMATIG', NULL)
  ON CONFLICT DO NOTHING;
END;
$$;


ALTER FUNCTION "public"."seed_default_cost_types"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seed_tenant_defaults"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Departments
  INSERT INTO public.departments (tenant_id, code, name, color)
  VALUES (NEW.id, 'OPS', 'Operations', '#3b82f6')
  ON CONFLICT (tenant_id, code) DO NOTHING;

  INSERT INTO public.departments (tenant_id, code, name, color)
  VALUES (NEW.id, 'EXPORT', 'Export', '#f59e0b')
  ON CONFLICT (tenant_id, code) DO NOTHING;

  -- Traject rules
  INSERT INTO public.traject_rules (tenant_id, name, priority, match_conditions, legs_template)
  VALUES
    (NEW.id,
     'Naar RCS Export hub → split Operations + Export',
     10,
     '{"delivery_address_contains": ["RCS Export", "RCS Hub", "RCS_EXPORT", "Royalty Cargo Export"]}'::jsonb,
     '[{"sequence":1,"from":"pickup","to":"hub","department_code":"OPS","leg_role":"OPS_PICKUP"},
       {"sequence":2,"from":"hub","to":"delivery","department_code":"EXPORT","leg_role":"EXPORT_LEG"}]'::jsonb),
    (NEW.id,
     'Vanuit RCS hub → single Export leg',
     20,
     '{"pickup_address_contains": ["RCS Export", "RCS Hub"]}'::jsonb,
     '[{"sequence":1,"from":"pickup","to":"delivery","department_code":"EXPORT","leg_role":"SINGLE"}]'::jsonb),
    (NEW.id,
     'Binnenlands → single Operations leg',
     1000,
     '{"default": true}'::jsonb,
     '[{"sequence":1,"from":"pickup","to":"delivery","department_code":"OPS","leg_role":"SINGLE"}]'::jsonb);

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."seed_tenant_defaults"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_tenant_inbox_password"("p_inbox_id" "uuid", "p_password" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'vault'
    AS $$
DECLARE
  v_existing_secret_id uuid;
  v_new_secret_id uuid;
  v_secret_name text;
BEGIN
  IF p_password IS NULL OR length(p_password) = 0 THEN
    RAISE EXCEPTION 'Password mag niet leeg zijn';
  END IF;

  SELECT password_secret_id INTO v_existing_secret_id
    FROM public.tenant_inboxes WHERE id = p_inbox_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant_inbox % bestaat niet', p_inbox_id;
  END IF;

  v_secret_name := 'tenant_inbox_' || p_inbox_id::text;

  IF v_existing_secret_id IS NOT NULL THEN
    -- Update in place, behoudt secret_id
    PERFORM vault.update_secret(v_existing_secret_id, p_password, v_secret_name, 'IMAP wachtwoord');
  ELSE
    -- Nieuw, link id in tenant_inboxes
    v_new_secret_id := vault.create_secret(p_password, v_secret_name, 'IMAP wachtwoord');
    UPDATE public.tenant_inboxes
       SET password_secret_id = v_new_secret_id
     WHERE id = p_inbox_id;
  END IF;
END;
$$;


ALTER FUNCTION "public"."set_tenant_inbox_password"("p_inbox_id" "uuid", "p_password" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sweep_overdue_info_requests"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."sweep_overdue_info_requests"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_notify_delivered"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.dispatch_status = 'VOLTOOID' AND (OLD.dispatch_status IS DISTINCT FROM 'VOLTOOID') AND NEW.tenant_id IS NOT NULL THEN
    PERFORM public.dispatch_notification('DELIVERED', NEW.tenant_id, NULL, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_notify_delivered"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_notify_driver_arrived"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  IF NEW.stop_status = 'AANGEKOMEN' AND (OLD.stop_status IS DISTINCT FROM 'AANGEKOMEN') THEN
    SELECT tenant_id INTO v_tenant_id FROM public.trips WHERE id = NEW.trip_id;
    IF v_tenant_id IS NOT NULL THEN
      PERFORM public.dispatch_notification('DRIVER_ARRIVED', v_tenant_id, NEW.order_id, NEW.trip_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_notify_driver_arrived"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_notify_exception"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.status = 'CANCELLED' AND (OLD.status IS DISTINCT FROM 'CANCELLED') AND NEW.tenant_id IS NOT NULL THEN
    PERFORM public.dispatch_notification('EXCEPTION', NEW.tenant_id, NEW.id, NULL);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_notify_exception"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_notify_order_confirmed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.status = 'PENDING' AND (OLD.status IS DISTINCT FROM 'PENDING') AND NEW.tenant_id IS NOT NULL THEN
    PERFORM public.dispatch_notification('ORDER_CONFIRMED', NEW.tenant_id, NEW.id, NULL);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_notify_order_confirmed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_notify_trip_started"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.dispatch_status = 'ACTIEF' AND (OLD.dispatch_status IS DISTINCT FROM 'ACTIEF') AND NEW.tenant_id IS NOT NULL THEN
    PERFORM public.dispatch_notification('TRIP_STARTED', NEW.tenant_id, NULL, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_notify_trip_started"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_order_info_requests_sync"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."trg_order_info_requests_sync"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_orders_notes_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.notes IS DISTINCT FROM OLD.notes
     OR NEW.reference IS DISTINCT FROM OLD.reference THEN
    NEW.notes_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_orders_notes_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_shipments_notes_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.notes IS DISTINCT FROM OLD.notes THEN
    NEW.notes_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_shipments_notes_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_has_tenant_access"("p_tenant_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_members tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."user_has_tenant_access"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_order_status_transition"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF OLD.status IN ('DELIVERED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Cannot change status from % — terminal state', OLD.status;
  END IF;
  IF NEW.status = 'CANCELLED' THEN RETURN NEW; END IF;
  IF (OLD.status = 'DRAFT' AND NEW.status = 'PENDING') OR
     (OLD.status = 'PENDING' AND NEW.status = 'PLANNED') OR
     (OLD.status = 'PLANNED' AND NEW.status = 'IN_TRANSIT') OR
     (OLD.status = 'IN_TRANSIT' AND NEW.status = 'DELIVERED') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Invalid status transition: % → %', OLD.status, NEW.status;
END; $$;


ALTER FUNCTION "public"."validate_order_status_transition"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."activity_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "changes" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."activity_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_corrections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "text",
    "client_name" "text",
    "field_name" "text" NOT NULL,
    "ai_value" "text",
    "corrected_value" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tenant_id" "uuid"
);


ALTER TABLE "public"."ai_corrections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_decisions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "decision_type" "text" NOT NULL,
    "entity_id" "uuid",
    "entity_type" "text",
    "confidence_score" numeric(5,2) NOT NULL,
    "field_confidences" "jsonb" DEFAULT '{}'::"jsonb",
    "ai_suggestion" "jsonb" NOT NULL,
    "final_values" "jsonb",
    "was_auto_approved" boolean DEFAULT false,
    "was_corrected" boolean DEFAULT false,
    "correction_summary" "jsonb",
    "outcome" "text",
    "processing_time_ms" integer,
    "model_version" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "resolved_at" timestamp with time zone
);


ALTER TABLE "public"."ai_decisions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_usage_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "function_name" "text" NOT NULL,
    "model" "text" DEFAULT 'gemini-2.5-flash'::"text" NOT NULL,
    "input_tokens" integer,
    "output_tokens" integer,
    "cost_estimate" numeric(10,6),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_usage_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."anomalies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "category" "text" NOT NULL,
    "type" "text" NOT NULL,
    "severity" "text" DEFAULT 'warning'::"text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "suggested_action" "text",
    "auto_resolvable" boolean DEFAULT false,
    "auto_resolved" boolean DEFAULT false,
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "detected_at" timestamp with time zone DEFAULT "now"(),
    "data" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."anomalies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "table_name" "text" NOT NULL,
    "record_id" "text" NOT NULL,
    "action" "text" NOT NULL,
    "old_data" "jsonb",
    "new_data" "jsonb",
    "changed_fields" "text"[],
    "user_id" "uuid",
    "user_email" "text",
    "ip_address" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tenant_id" "uuid",
    CONSTRAINT "audit_log_action_check" CHECK (("action" = ANY (ARRAY['INSERT'::"text", 'UPDATE'::"text", 'DELETE'::"text"])))
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "role" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "client_contacts_role_check" CHECK (("role" = ANY (ARRAY['primary'::"text", 'backup'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."client_contacts" OWNER TO "postgres";


COMMENT ON TABLE "public"."client_contacts" IS 'Contactpersonen per klant. Max één actieve primary en één actieve backup per client_id, afgedwongen via partial unique indexes.';



CREATE TABLE IF NOT EXISTS "public"."client_extraction_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "client_email" "text" NOT NULL,
    "field_mappings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "success_count" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."client_extraction_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "address" "text" NOT NULL,
    "zipcode" "text",
    "city" "text",
    "country" "text" DEFAULT 'NL'::"text",
    "location_type" "text" DEFAULT 'pickup'::"text" NOT NULL,
    "time_window_start" "text",
    "time_window_end" "text",
    "max_vehicle_length" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tenant_id" "uuid" NOT NULL
);


ALTER TABLE "public"."client_locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_portal_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "portal_role" "text" DEFAULT 'viewer'::"text" NOT NULL,
    "invited_by" "uuid",
    "invited_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_login_at" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "client_portal_users_portal_role_check" CHECK (("portal_role" = ANY (ARRAY['viewer'::"text", 'editor'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."client_portal_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_rates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "rate_type" "text" NOT NULL,
    "description" "text",
    "amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tenant_id" "uuid" NOT NULL
);


ALTER TABLE "public"."client_rates" OWNER TO "postgres";


COMMENT ON TABLE "public"."client_rates" IS 'LEGACY: Migrated to rate_cards + rate_rules. Kept as fallback.';



CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "address" "text",
    "zipcode" "text",
    "city" "text",
    "country" "text" DEFAULT 'NL'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "contact_person" "text",
    "email" "text",
    "phone" "text",
    "kvk_number" "text",
    "btw_number" "text",
    "payment_terms" integer DEFAULT 30,
    "is_active" boolean DEFAULT true,
    "tenant_id" "uuid" NOT NULL,
    "billing_email" "text",
    "billing_same_as_main" boolean DEFAULT true NOT NULL,
    "billing_address" "text",
    "billing_zipcode" "text",
    "billing_city" "text",
    "billing_country" "text",
    "shipping_same_as_main" boolean DEFAULT true NOT NULL,
    "shipping_address" "text",
    "shipping_zipcode" "text",
    "shipping_city" "text",
    "shipping_country" "text"
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


COMMENT ON COLUMN "public"."clients"."billing_email" IS 'Apart factuur-mailadres. Leeg betekent: gebruik clients.email.';



COMMENT ON COLUMN "public"."clients"."billing_same_as_main" IS 'Als true, facturatie gebruikt clients.address; de billing_* velden worden genegeerd.';



COMMENT ON COLUMN "public"."clients"."shipping_same_as_main" IS 'Als true, postzendingen (facturen op papier, docs) gebruiken clients.address.';



CREATE TABLE IF NOT EXISTS "public"."confidence_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "client_id" "uuid",
    "decision_type" "text" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "total_decisions" integer DEFAULT 0,
    "auto_approved_count" integer DEFAULT 0,
    "corrected_count" integer DEFAULT 0,
    "rejected_count" integer DEFAULT 0,
    "avg_confidence" numeric(5,2),
    "avg_correction_delta" numeric(5,2),
    "automation_rate" numeric(5,2),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."confidence_metrics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."consolidation_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "planned_date" "date" NOT NULL,
    "status" "text" DEFAULT 'VOORSTEL'::"text" NOT NULL,
    "vehicle_id" "uuid",
    "total_weight_kg" numeric(10,2),
    "total_pallets" integer,
    "total_distance_km" numeric(10,2),
    "estimated_duration_min" integer,
    "utilization_pct" numeric(5,2),
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "consolidation_groups_status_check" CHECK (("status" = ANY (ARRAY['VOORSTEL'::"text", 'GOEDGEKEURD'::"text", 'INGEPLAND'::"text", 'VERWORPEN'::"text"])))
);


ALTER TABLE "public"."consolidation_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."consolidation_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "stop_sequence" integer,
    "pickup_sequence" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."consolidation_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cost_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "calculation_method" "text" NOT NULL,
    "default_rate" numeric(12,4),
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cost_types_calculation_method_check" CHECK (("calculation_method" = ANY (ARRAY['PER_KM'::"text", 'PER_UUR'::"text", 'PER_RIT'::"text", 'PER_STOP'::"text", 'HANDMATIG'::"text"]))),
    CONSTRAINT "cost_types_category_check" CHECK (("category" = ANY (ARRAY['BRANDSTOF'::"text", 'TOL'::"text", 'CHAUFFEUR'::"text", 'VOERTUIG'::"text", 'OVERIG'::"text"])))
);


ALTER TABLE "public"."cost_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_exceptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "trip_id" "uuid",
    "trip_stop_id" "uuid",
    "order_id" "uuid",
    "exception_type" "text" NOT NULL,
    "severity" "text" DEFAULT 'MEDIUM'::"text" NOT NULL,
    "description" "text" NOT NULL,
    "owner_id" "uuid",
    "status" "text" DEFAULT 'OPEN'::"text" NOT NULL,
    "blocks_billing" boolean DEFAULT false NOT NULL,
    "resolution_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "escalated_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "delivery_exceptions_severity_check" CHECK (("severity" = ANY (ARRAY['LOW'::"text", 'MEDIUM'::"text", 'HIGH'::"text", 'CRITICAL'::"text"]))),
    CONSTRAINT "delivery_exceptions_status_check" CHECK (("status" = ANY (ARRAY['OPEN'::"text", 'IN_PROGRESS'::"text", 'RESOLVED'::"text", 'ESCALATED'::"text"])))
);


ALTER TABLE "public"."delivery_exceptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."departments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."departments" OWNER TO "postgres";


COMMENT ON TABLE "public"."departments" IS 'Afdelingen binnen een tenant (bv. Operations, Export).';



CREATE TABLE IF NOT EXISTS "public"."disruptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "type" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "affected_trip_id" "uuid",
    "affected_order_id" "uuid",
    "affected_vehicle_id" "uuid",
    "description" "text",
    "detected_at" timestamp with time zone DEFAULT "now"(),
    "resolved_at" timestamp with time zone,
    "auto_resolved" boolean DEFAULT false,
    "resolution_summary" "jsonb"
);


ALTER TABLE "public"."disruptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."driver_positions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "driver_id" "uuid" NOT NULL,
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "accuracy" double precision,
    "speed" double precision,
    "heading" double precision,
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tenant_id" "uuid"
);


ALTER TABLE "public"."driver_positions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."driver_time_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "driver_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "latitude" double precision,
    "longitude" double precision,
    "notes" "text",
    "tenant_id" "uuid",
    CONSTRAINT "driver_time_entries_type_check" CHECK (("type" = ANY (ARRAY['clock_in'::"text", 'clock_out'::"text", 'break_start'::"text", 'break_end'::"text", 'drive_start'::"text", 'drive_end'::"text"])))
);


ALTER TABLE "public"."driver_time_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drivers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "license_number" "text",
    "certifications" "text"[] DEFAULT '{}'::"text"[],
    "status" "text" DEFAULT 'beschikbaar'::"text" NOT NULL,
    "current_vehicle_id" "uuid",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "hourly_cost" numeric(10,2),
    "km_allowance" numeric(10,4),
    "failed_pin_attempts" integer DEFAULT 0,
    "pin_locked_until" timestamp with time zone,
    "pin_hash" "text",
    "must_change_pin" boolean DEFAULT true
);


ALTER TABLE "public"."drivers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."earnings_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "phone_number" "text" NOT NULL,
    "platform_connection_id" "uuid",
    "platform" "text" NOT NULL,
    "external_event_id" "text",
    "external_reference" "text",
    "source_type" "text" NOT NULL,
    "gross_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "fee_amount" numeric(10,2) DEFAULT 0,
    "tip_amount" numeric(10,2) DEFAULT 0,
    "net_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text",
    "occurred_at" timestamp with time zone NOT NULL,
    "settled_at" timestamp with time zone,
    "description" "text",
    "raw_payload_json" "jsonb",
    "import_batch_id" "uuid",
    "sync_job_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."earnings_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoice_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "description" "text" NOT NULL,
    "quantity" numeric(10,2) DEFAULT 1 NOT NULL,
    "unit" "text" DEFAULT 'stuk'::"text" NOT NULL,
    "unit_price" numeric(10,2) DEFAULT 0 NOT NULL,
    "total" numeric(10,2) DEFAULT 0 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."invoice_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "invoice_number" "text" NOT NULL,
    "client_id" "uuid",
    "client_name" "text",
    "client_address" "text",
    "client_btw_number" "text",
    "client_kvk_number" "text",
    "status" "text" DEFAULT 'concept'::"text" NOT NULL,
    "invoice_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "due_date" "date",
    "subtotal" numeric(10,2) DEFAULT 0 NOT NULL,
    "btw_percentage" numeric(5,2) DEFAULT 21.00 NOT NULL,
    "btw_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "total" numeric(10,2) DEFAULT 0 NOT NULL,
    "notes" "text",
    "pdf_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "invoices_status_check" CHECK (("status" = ANY (ARRAY['concept'::"text", 'verzonden'::"text", 'betaald'::"text", 'vervallen'::"text"])))
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loading_units" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "code" "text" NOT NULL,
    "default_weight_kg" numeric,
    "default_dimensions" "text",
    "is_active" boolean DEFAULT true,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."loading_units" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."location_time_windows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_location_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "day_of_week" integer NOT NULL,
    "open_time" time without time zone NOT NULL,
    "close_time" time without time zone NOT NULL,
    "slot_duration_min" integer DEFAULT 30 NOT NULL,
    "max_concurrent_slots" integer DEFAULT 1 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "location_time_windows_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6))),
    CONSTRAINT "valid_time_range" CHECK (("close_time" > "open_time"))
);


ALTER TABLE "public"."location_time_windows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "template_id" "uuid",
    "order_id" "uuid",
    "trip_id" "uuid",
    "recipient_email" "text",
    "recipient_phone" "text",
    "channel" "text" NOT NULL,
    "trigger_event" "text" NOT NULL,
    "status" "text" DEFAULT 'QUEUED'::"text" NOT NULL,
    "subject" "text",
    "body" "text",
    "sent_at" timestamp with time zone,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notification_log_channel_check" CHECK (("channel" = ANY (ARRAY['EMAIL'::"text", 'SMS'::"text"]))),
    CONSTRAINT "notification_log_status_check" CHECK (("status" = ANY (ARRAY['QUEUED'::"text", 'SENT'::"text", 'DELIVERED'::"text", 'FAILED'::"text", 'BOUNCED'::"text"])))
);


ALTER TABLE "public"."notification_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "trigger_event" "text" NOT NULL,
    "channel" "text" NOT NULL,
    "subject_template" "text",
    "body_template" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notification_templates_channel_check" CHECK (("channel" = ANY (ARRAY['EMAIL'::"text", 'SMS'::"text"]))),
    CONSTRAINT "notification_templates_trigger_event_check" CHECK (("trigger_event" = ANY (ARRAY['ORDER_CONFIRMED'::"text", 'TRIP_STARTED'::"text", 'ETA_CHANGED'::"text", 'DRIVER_ARRIVED'::"text", 'DELIVERED'::"text", 'EXCEPTION'::"text", 'VEHICLE_DAMAGE'::"text"])))
);


ALTER TABLE "public"."notification_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" DEFAULT 'info'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "icon" "text" DEFAULT 'bell'::"text",
    "order_id" "uuid",
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid"
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


COMMENT ON COLUMN "public"."notifications"."user_id" IS 'Target user for this notification (NULL = broadcast)';



CREATE TABLE IF NOT EXISTS "public"."order_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "order_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "event_data" "jsonb" DEFAULT '{}'::"jsonb",
    "actor_type" "text" NOT NULL,
    "actor_id" "uuid",
    "confidence_score" numeric(5,2),
    "duration_since_previous_ms" bigint,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."order_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_info_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "field_name" "text" NOT NULL,
    "field_label" "text",
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "promised_by_contact_id" "uuid",
    "promised_by_name" "text",
    "promised_by_email" "text",
    "promised_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expected_by" timestamp with time zone,
    "fulfilled_at" timestamp with time zone,
    "fulfilled_value" "text",
    "fulfilled_source" "text",
    "reminder_sent_at" timestamp with time zone[] DEFAULT '{}'::timestamp with time zone[] NOT NULL,
    "escalated_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "cancelled_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "order_info_requests_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'FULFILLED'::"text", 'OVERDUE'::"text", 'CANCELLED'::"text"])))
);


ALTER TABLE "public"."order_info_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_note_reads" (
    "user_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."order_note_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_number" integer NOT NULL,
    "status" "text" DEFAULT 'DRAFT'::"text" NOT NULL,
    "source_email_from" "text",
    "source_email_subject" "text",
    "source_email_body" "text",
    "confidence_score" integer,
    "transport_type" "text",
    "pickup_address" "text",
    "delivery_address" "text",
    "quantity" integer,
    "unit" "text",
    "weight_kg" integer,
    "is_weight_per_unit" boolean DEFAULT false NOT NULL,
    "dimensions" "text",
    "requirements" "text"[] DEFAULT '{}'::"text"[],
    "client_name" "text",
    "received_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "attachments" "jsonb" DEFAULT '[]'::"jsonb",
    "stop_sequence" integer,
    "internal_note" "text",
    "missing_fields" "text"[] DEFAULT '{}'::"text"[],
    "follow_up_draft" "text",
    "follow_up_sent_at" timestamp with time zone,
    "invoice_ref" "text",
    "barcode" "text",
    "thread_type" "text" DEFAULT 'new'::"text" NOT NULL,
    "parent_order_id" "uuid",
    "changes_detected" "jsonb" DEFAULT '[]'::"jsonb",
    "anomalies" "jsonb" DEFAULT '[]'::"jsonb",
    "tenant_id" "uuid" NOT NULL,
    "time_window_start" "text",
    "time_window_end" "text",
    "driver_id" "uuid",
    "geocoded_pickup_lat" numeric,
    "geocoded_pickup_lng" numeric,
    "geocoded_delivery_lat" numeric,
    "geocoded_delivery_lng" numeric,
    "priority" "text" DEFAULT 'normaal'::"text" NOT NULL,
    "vehicle_id" "uuid",
    "invoice_id" "uuid",
    "warehouse_received_at" timestamp with time zone,
    "pod_signature_url" "text",
    "pod_photos" "jsonb" DEFAULT '[]'::"jsonb",
    "pod_signed_by" "text",
    "pod_signed_at" timestamp with time zone,
    "pod_notes" "text",
    "cmr_number" "text",
    "cmr_generated_at" timestamp with time zone,
    "billing_status" "text" DEFAULT 'NIET_GEREED'::"text",
    "billing_blocked_reason" "text",
    "billing_ready_at" timestamp with time zone,
    "client_id" "uuid",
    "order_type" "text" DEFAULT 'ZENDING'::"text" NOT NULL,
    "return_reason" "text",
    "recipient_name" "text",
    "recipient_email" "text",
    "recipient_phone" "text",
    "notification_preferences" "jsonb" DEFAULT '{"sms": false, "email": true}'::"jsonb" NOT NULL,
    "source" "text" DEFAULT 'INTERN'::"text" NOT NULL,
    "portal_submitted_by" "uuid",
    "portal_submitted_at" timestamp with time zone,
    "notes" "text",
    "reference" "text",
    "shipment_id" "uuid",
    "department_id" "uuid" NOT NULL,
    "leg_number" integer,
    "leg_role" "text",
    "info_status" "text" DEFAULT 'COMPLETE'::"text" NOT NULL,
    "notes_updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "orders_info_status_check" CHECK (("info_status" = ANY (ARRAY['COMPLETE'::"text", 'AWAITING_INFO'::"text", 'OVERDUE'::"text"]))),
    CONSTRAINT "orders_order_type_check" CHECK (("order_type" = ANY (ARRAY['ZENDING'::"text", 'RETOUR'::"text", 'EMBALLAGE_RUIL'::"text"]))),
    CONSTRAINT "orders_return_reason_check" CHECK ((("return_reason" IS NULL) OR ("return_reason" = ANY (ARRAY['BESCHADIGD'::"text", 'VERKEERD'::"text", 'WEIGERING'::"text", 'OVERSCHOT'::"text", 'OVERIG'::"text"])))),
    CONSTRAINT "orders_source_check" CHECK (("source" = ANY (ARRAY['INTERN'::"text", 'EMAIL'::"text", 'PORTAL'::"text", 'EDI'::"text"])))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


COMMENT ON COLUMN "public"."orders"."thread_type" IS 'Type of email thread: new, update, cancellation, confirmation, question';



COMMENT ON COLUMN "public"."orders"."parent_order_id" IS 'Links reply emails to their original order';



COMMENT ON COLUMN "public"."orders"."changes_detected" IS 'Array of {field, old_value, new_value} diffs when thread_type=update';



COMMENT ON COLUMN "public"."orders"."anomalies" IS 'Array of {field, value, avg_value, message} anomaly flags';



COMMENT ON COLUMN "public"."orders"."time_window_start" IS 'Delivery time window start (HH:MM)';



COMMENT ON COLUMN "public"."orders"."time_window_end" IS 'Delivery time window end (HH:MM)';



COMMENT ON COLUMN "public"."orders"."priority" IS 'Order priority: laag, normaal, hoog, spoed';



COMMENT ON COLUMN "public"."orders"."pod_signature_url" IS 'URL to the saved signature PNG in Supabase Storage';



COMMENT ON COLUMN "public"."orders"."pod_photos" IS 'JSON array of photo URLs uploaded as proof of delivery';



COMMENT ON COLUMN "public"."orders"."pod_signed_by" IS 'Name of the person who signed for receipt';



COMMENT ON COLUMN "public"."orders"."pod_signed_at" IS 'Timestamp when the PoD was signed';



COMMENT ON COLUMN "public"."orders"."pod_notes" IS 'Delivery notes (damage, deviations, etc.)';



COMMENT ON COLUMN "public"."orders"."cmr_number" IS 'Unique CMR waybill number (e.g. RC-CMR-2026-0001)';



COMMENT ON COLUMN "public"."orders"."cmr_generated_at" IS 'Timestamp when CMR document was generated';



COMMENT ON COLUMN "public"."orders"."shipment_id" IS 'Moederzending waar deze leg onder valt.';



COMMENT ON COLUMN "public"."orders"."department_id" IS 'Afdeling waar deze order (leg) onder valt. NOT NULL sinds §27. Wordt afgeleid via traject_rules in createShipmentWithLegs; planner kan overrulen in NewOrder.';



COMMENT ON COLUMN "public"."orders"."leg_number" IS 'Volgorde binnen de shipment (1 = eerste leg).';



COMMENT ON COLUMN "public"."orders"."leg_role" IS 'Rol van deze leg in de keten: OPS_PICKUP, EXPORT_LEG, SINGLE, etc.';



CREATE SEQUENCE IF NOT EXISTS "public"."orders_order_number_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."orders_order_number_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."orders_order_number_seq" OWNED BY "public"."orders"."order_number";



CREATE TABLE IF NOT EXISTS "public"."packaging_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "trip_stop_id" "uuid",
    "loading_unit_id" "uuid" NOT NULL,
    "direction" "text" NOT NULL,
    "quantity" integer NOT NULL,
    "recorded_by" "uuid",
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "packaging_movements_direction_check" CHECK (("direction" = ANY (ARRAY['UIT'::"text", 'IN'::"text"]))),
    CONSTRAINT "packaging_movements_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."packaging_movements" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."packaging_balances" AS
 SELECT "pm"."tenant_id",
    "pm"."client_id",
    "pm"."loading_unit_id",
    "lu"."name" AS "loading_unit_name",
    "lu"."code" AS "loading_unit_code",
    "c"."name" AS "client_name",
    "sum"(
        CASE
            WHEN ("pm"."direction" = 'UIT'::"text") THEN "pm"."quantity"
            ELSE (- "pm"."quantity")
        END) AS "balance",
    "count"(*) AS "total_movements",
    "max"("pm"."recorded_at") AS "last_movement_at"
   FROM (("public"."packaging_movements" "pm"
     JOIN "public"."loading_units" "lu" ON (("lu"."id" = "pm"."loading_unit_id")))
     JOIN "public"."clients" "c" ON (("c"."id" = "pm"."client_id")))
  GROUP BY "pm"."tenant_id", "pm"."client_id", "pm"."loading_unit_id", "lu"."name", "lu"."code", "c"."name";


ALTER VIEW "public"."packaging_balances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "display_name" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tenant_id" "uuid"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."proof_of_delivery" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_stop_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "pod_status" "text" DEFAULT 'VERWACHT'::"text" NOT NULL,
    "signature_url" "text",
    "photos" "jsonb" DEFAULT '[]'::"jsonb",
    "recipient_name" "text",
    "received_at" timestamp with time zone,
    "validated_by" "uuid",
    "validated_at" timestamp with time zone,
    "rejection_reason" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "proof_of_delivery_pod_status_check" CHECK (("pod_status" = ANY (ARRAY['NIET_VEREIST'::"text", 'VERWACHT'::"text", 'ONTVANGEN'::"text", 'ONVOLLEDIG'::"text", 'GOEDGEKEURD'::"text", 'AFGEWEZEN'::"text"])))
);


ALTER TABLE "public"."proof_of_delivery" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rate_cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "client_id" "uuid",
    "name" "text" NOT NULL,
    "valid_from" "date",
    "valid_until" "date",
    "is_active" boolean DEFAULT true NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rate_cards" OWNER TO "postgres";


COMMENT ON TABLE "public"."rate_cards" IS 'Tariff card per client (NULL client_id = default tariff for tenant)';



COMMENT ON COLUMN "public"."rate_cards"."client_id" IS 'NULL means this is the default rate card for the tenant';



CREATE TABLE IF NOT EXISTS "public"."rate_limit_counters" (
    "key" "text" NOT NULL,
    "window_start" timestamp with time zone NOT NULL,
    "count" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."rate_limit_counters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rate_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rate_card_id" "uuid" NOT NULL,
    "rule_type" "text" NOT NULL,
    "transport_type" "text",
    "amount" numeric(12,4) NOT NULL,
    "min_amount" numeric(12,4),
    "conditions" "jsonb" DEFAULT '{}'::"jsonb",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "vehicle_type_id" "uuid",
    CONSTRAINT "rate_rules_rule_type_check" CHECK (("rule_type" = ANY (ARRAY['PER_KM'::"text", 'PER_UUR'::"text", 'PER_STOP'::"text", 'PER_PALLET'::"text", 'PER_KG'::"text", 'VAST_BEDRAG'::"text", 'ZONE_TARIEF'::"text", 'STAFFEL'::"text"])))
);


ALTER TABLE "public"."rate_rules" OWNER TO "postgres";


COMMENT ON TABLE "public"."rate_rules" IS 'Individual tariff rules within a rate card';



COMMENT ON COLUMN "public"."rate_rules"."conditions" IS 'JSONB for tier/zone conditions, e.g. {"weight_from":0,"weight_to":500} or {"from_zone":"NL","to_zone":"DE"}';



COMMENT ON COLUMN "public"."rate_rules"."vehicle_type_id" IS 'Optioneel. Als gezet, geldt deze rule alleen voor orders met dit voertuigtype. NULL = alle types.';



CREATE TABLE IF NOT EXISTS "public"."replan_suggestions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "disruption_id" "uuid",
    "description" "text",
    "confidence" numeric(5,2),
    "impact" "jsonb",
    "actions" "jsonb",
    "status" "text" DEFAULT 'pending'::"text",
    "applied_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."replan_suggestions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."requirement_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "code" "text" NOT NULL,
    "category" "text" DEFAULT 'transport'::"text",
    "icon" "text",
    "color" "text",
    "is_active" boolean DEFAULT true,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."requirement_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shipments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "shipment_number" integer,
    "client_id" "uuid",
    "client_name" "text",
    "origin_address" "text",
    "destination_address" "text",
    "status" "text" DEFAULT 'DRAFT'::"text" NOT NULL,
    "traject_rule_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    "notes_updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "price_total_cents" integer,
    "pricing" "jsonb",
    "contact_person" "text",
    "vehicle_type" "text",
    "client_reference" "text",
    "mrn_document" "text",
    "requires_tail_lift" boolean DEFAULT false NOT NULL,
    "pmt" "jsonb",
    "cargo" "jsonb"
);


ALTER TABLE "public"."shipments" OWNER TO "postgres";


COMMENT ON TABLE "public"."shipments" IS 'Moederzending per klantboeking; kan uit 1 of meerdere order-legs bestaan.';



COMMENT ON COLUMN "public"."shipments"."price_total_cents" IS 'Totaal tarief in eurocenten. Bron: pricing.mode (standard|override).';



COMMENT ON COLUMN "public"."shipments"."pricing" IS 'Berekeningsdetails. standard: {mode,vehicle,km,km_rounded,diesel_included,matrix_tariff,per_km,calc_raw,screening_included,screening_fee,min_applied,min_tariff,total}. override: {mode,amount,reason}.';



COMMENT ON COLUMN "public"."shipments"."contact_person" IS 'Contactpersoon bij de klant.';



COMMENT ON COLUMN "public"."shipments"."vehicle_type" IS 'Handmatig gekozen voertuigtype (Vrachtwagen, Bestelbus, etc.).';



COMMENT ON COLUMN "public"."shipments"."client_reference" IS 'PO-nummer of bestelreferentie van de klant.';



COMMENT ON COLUMN "public"."shipments"."mrn_document" IS 'MRN/douane documentnummer voor export-zendingen.';



COMMENT ON COLUMN "public"."shipments"."requires_tail_lift" IS 'Of er een laadklep nodig is bij laden/lossen.';



COMMENT ON COLUMN "public"."shipments"."pmt" IS 'Luchtvracht-beveiliging (PMT). {secure, methode, operator, referentie, datum, locatie, seal, by_customer}.';



COMMENT ON COLUMN "public"."shipments"."cargo" IS 'Per-rij lading-detail. Array van {aantal, eenheid, gewicht, lengte, breedte, hoogte, stapelbaar, adr, omschrijving}.';



CREATE TABLE IF NOT EXISTS "public"."slot_bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "client_location_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "trip_stop_id" "uuid",
    "slot_date" "date" NOT NULL,
    "slot_start" time without time zone NOT NULL,
    "slot_end" time without time zone NOT NULL,
    "status" "text" DEFAULT 'GEBOEKT'::"text" NOT NULL,
    "booked_by" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "slot_bookings_status_check" CHECK (("status" = ANY (ARRAY['GEBOEKT'::"text", 'BEVESTIGD'::"text", 'GEANNULEERD'::"text", 'VERLOPEN'::"text"]))),
    CONSTRAINT "valid_slot_range" CHECK (("slot_end" > "slot_start"))
);


ALTER TABLE "public"."slot_bookings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."surcharges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "surcharge_type" "text" NOT NULL,
    "amount" numeric(12,4) NOT NULL,
    "applies_to" "jsonb" DEFAULT '{}'::"jsonb",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "surcharges_surcharge_type_check" CHECK (("surcharge_type" = ANY (ARRAY['PERCENTAGE'::"text", 'VAST_BEDRAG'::"text", 'PER_KM'::"text", 'PER_KG'::"text"])))
);


ALTER TABLE "public"."surcharges" OWNER TO "postgres";


COMMENT ON TABLE "public"."surcharges" IS 'Surcharges (diesel, weekend, ADR, cooling, wait time)';



COMMENT ON COLUMN "public"."surcharges"."applies_to" IS 'Conditions for applying surcharge, e.g. {"requirements":["ADR"]}, {"day_of_week":[5,6]}, {"waiting_time_above_min":30}';



CREATE TABLE IF NOT EXISTS "public"."tenant_inbox_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "inbox_id" "uuid",
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "detail" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tenant_inbox_audit_action_check" CHECK (("action" = ANY (ARRAY['created'::"text", 'updated'::"text", 'password_changed'::"text", 'activated'::"text", 'deactivated'::"text", 'deleted'::"text", 'tested'::"text"])))
);


ALTER TABLE "public"."tenant_inbox_audit" OWNER TO "postgres";


COMMENT ON TABLE "public"."tenant_inbox_audit" IS 'Audit log voor alle mutaties op tenant_inboxes. Wachtwoord wordt nooit gelogd, alleen action=password_changed.';



CREATE TABLE IF NOT EXISTS "public"."tenant_inboxes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "provider" "text" DEFAULT 'imap'::"text" NOT NULL,
    "host" "text" NOT NULL,
    "port" integer DEFAULT 993 NOT NULL,
    "username" "text" NOT NULL,
    "password_secret_id" "uuid",
    "folder" "text" DEFAULT 'INBOX'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "last_uid" bigint,
    "last_polled_at" timestamp with time zone,
    "last_error" "text",
    "consecutive_failures" integer DEFAULT 0 NOT NULL,
    "next_poll_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tenant_inboxes_port_check" CHECK ((("port" >= 1) AND ("port" <= 65535))),
    CONSTRAINT "tenant_inboxes_provider_check" CHECK (("provider" = 'imap'::"text"))
);


ALTER TABLE "public"."tenant_inboxes" OWNER TO "postgres";


COMMENT ON TABLE "public"."tenant_inboxes" IS 'Per-tenant IMAP inbox configuratie. Wachtwoord via password_secret_id -> vault.secrets.';



COMMENT ON COLUMN "public"."tenant_inboxes"."password_secret_id" IS 'UUID van vault.secrets rij. NULL betekent: nog geen wachtwoord ingesteld (inactief).';



COMMENT ON COLUMN "public"."tenant_inboxes"."next_poll_at" IS 'Backoff: poll-inbox slaat inboxes met next_poll_at > now() over.';



CREATE TABLE IF NOT EXISTS "public"."tenant_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'planner'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tenant_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_warehouses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "address" "text" NOT NULL,
    "warehouse_type" "text" NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tenant_warehouses_warehouse_type_check" CHECK (("warehouse_type" = ANY (ARRAY['OPS'::"text", 'EXPORT'::"text", 'IMPORT'::"text"])))
);


ALTER TABLE "public"."tenant_warehouses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "logo_url" "text",
    "primary_color" "text" DEFAULT '#dc2626'::"text",
    "settings" "jsonb" DEFAULT '{}'::"jsonb",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fleet_manager_email" "text"
);


ALTER TABLE "public"."tenants" OWNER TO "postgres";


COMMENT ON COLUMN "public"."tenants"."fleet_manager_email" IS 'E-mailadres van de planner/fleet-manager. Ontvangt damage-meldingen.';



CREATE TABLE IF NOT EXISTS "public"."traject_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "priority" integer DEFAULT 100 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "match_conditions" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "legs_template" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."traject_rules" OWNER TO "postgres";


COMMENT ON TABLE "public"."traject_rules" IS 'Regels die bepalen hoe een boeking wordt gesplitst in legs per afdeling.';



CREATE TABLE IF NOT EXISTS "public"."trip_costs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "cost_type_id" "uuid" NOT NULL,
    "amount" numeric(12,4) NOT NULL,
    "quantity" numeric(12,4),
    "rate" numeric(12,4),
    "source" "text" DEFAULT 'AUTO'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "trip_costs_source_check" CHECK (("source" = ANY (ARRAY['AUTO'::"text", 'HANDMATIG'::"text", 'IMPORT'::"text"])))
);


ALTER TABLE "public"."trip_costs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trip_stops" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "stop_type" "text" NOT NULL,
    "stop_sequence" integer NOT NULL,
    "stop_status" "text" DEFAULT 'GEPLAND'::"text" NOT NULL,
    "planned_address" "text",
    "planned_time" timestamp with time zone,
    "actual_arrival_time" timestamp with time zone,
    "actual_departure_time" timestamp with time zone,
    "contact_name" "text",
    "contact_phone" "text",
    "instructions" "text",
    "failure_reason" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "planned_window_start" time without time zone,
    "planned_window_end" time without time zone,
    "waiting_time_min" integer,
    "window_status" "text" DEFAULT 'ONBEKEND'::"text",
    CONSTRAINT "trip_stops_stop_status_check" CHECK (("stop_status" = ANY (ARRAY['GEPLAND'::"text", 'ONDERWEG'::"text", 'AANGEKOMEN'::"text", 'LADEN'::"text", 'LOSSEN'::"text", 'AFGELEVERD'::"text", 'MISLUKT'::"text", 'OVERGESLAGEN'::"text"]))),
    CONSTRAINT "trip_stops_stop_type_check" CHECK (("stop_type" = ANY (ARRAY['PICKUP'::"text", 'DELIVERY'::"text", 'DEPOT'::"text"]))),
    CONSTRAINT "trip_stops_window_status_check" CHECK (("window_status" = ANY (ARRAY['ONBEKEND'::"text", 'OP_TIJD'::"text", 'TE_VROEG'::"text", 'TE_LAAT'::"text", 'GEMIST'::"text"])))
);


ALTER TABLE "public"."trip_stops" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trips" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "trip_number" integer NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "driver_id" "uuid",
    "dispatch_status" "text" DEFAULT 'CONCEPT'::"text" NOT NULL,
    "planned_date" "date" NOT NULL,
    "planned_start_time" time without time zone,
    "actual_start_time" timestamp with time zone,
    "actual_end_time" timestamp with time zone,
    "total_distance_km" numeric(10,2),
    "total_duration_min" integer,
    "dispatcher_id" "uuid",
    "dispatched_at" timestamp with time zone,
    "received_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "trips_dispatch_status_check" CHECK (("dispatch_status" = ANY (ARRAY['CONCEPT'::"text", 'VERZENDKLAAR'::"text", 'VERZONDEN'::"text", 'ONTVANGEN'::"text", 'GEACCEPTEERD'::"text", 'GEWEIGERD'::"text", 'ACTIEF'::"text", 'VOLTOOID'::"text", 'AFGEBROKEN'::"text"])))
);


ALTER TABLE "public"."trips" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."trips_trip_number_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."trips_trip_number_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."trips_trip_number_seq" OWNED BY "public"."trips"."trip_number";



CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" NOT NULL
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicle_availability" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "status" "text" DEFAULT 'beschikbaar'::"text" NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tenant_id" "uuid" NOT NULL
);


ALTER TABLE "public"."vehicle_availability" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicle_check_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "check_id" "uuid" NOT NULL,
    "side" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "ai_description" "text",
    "ai_diff" "text",
    "severity" "text" DEFAULT 'none'::"text" NOT NULL,
    "baseline_photo_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "confidence" numeric,
    "driver_note" "text",
    CONSTRAINT "vehicle_check_photos_severity_check" CHECK (("severity" = ANY (ARRAY['none'::"text", 'minor'::"text", 'blocking'::"text"]))),
    CONSTRAINT "vehicle_check_photos_side_check" CHECK (("side" = ANY (ARRAY['front'::"text", 'rear'::"text", 'left'::"text", 'right'::"text", 'interior_front'::"text", 'interior_cargo'::"text", 'dashboard'::"text", 'klep'::"text", 'koelunit'::"text"])))
);


ALTER TABLE "public"."vehicle_check_photos" OWNER TO "postgres";


COMMENT ON TABLE "public"."vehicle_check_photos" IS 'Foto''s per zijde + AI-beschrijving + diff vs vorige OK-check.';



COMMENT ON COLUMN "public"."vehicle_check_photos"."confidence" IS 'Zekerheid van de AI-analyse voor deze foto (0..1). Onder 0.7 tonen als zachte waarschuwing.';



COMMENT ON COLUMN "public"."vehicle_check_photos"."driver_note" IS 'Optionele correctie/aanvulling door de chauffeur op de AI-beschrijving.';



CREATE TABLE IF NOT EXISTS "public"."vehicle_checks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "driver_id" "uuid",
    "vehicle_id" "uuid" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "checklist" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "notes" "text",
    "signature_url" "text",
    "ai_summary" "text",
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "released_by" "uuid",
    "released_at" timestamp with time zone,
    "release_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_baseline_seed" boolean DEFAULT false NOT NULL,
    "baseline_check_id" "uuid",
    "ai_confidence" numeric,
    CONSTRAINT "vehicle_checks_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'OK'::"text", 'DAMAGE_FOUND'::"text", 'RELEASED'::"text"])))
);


ALTER TABLE "public"."vehicle_checks" OWNER TO "postgres";


COMMENT ON TABLE "public"."vehicle_checks" IS 'Pre-trip voertuigcheck per chauffeur/voertuig/dag. Gate vóór orderlijst.';



COMMENT ON COLUMN "public"."vehicle_checks"."status" IS 'PENDING tijdens invullen, OK na submit zonder blocking, DAMAGE_FOUND bij blocking severity, RELEASED na handmatige vrijgave door planner.';



COMMENT ON COLUMN "public"."vehicle_checks"."is_baseline_seed" IS 'True = admin heeft deze check aangemaakt als eerste baseline voor dit voertuig.';



COMMENT ON COLUMN "public"."vehicle_checks"."baseline_check_id" IS 'Welke eerdere OK-check diende als baseline bij het invullen van deze check.';



COMMENT ON COLUMN "public"."vehicle_checks"."ai_confidence" IS 'Zekerheid van de AI-analyse (0-1). Onder 0.7 = zachte waarschuwing, geen hard blok.';



CREATE TABLE IF NOT EXISTS "public"."vehicle_damage_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "discovered_in_check_id" "uuid" NOT NULL,
    "discovered_by_driver_id" "uuid",
    "attributed_to_check_id" "uuid",
    "attributed_to_driver_id" "uuid",
    "side" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "description" "text",
    "photo_path" "text",
    "ai_confidence" numeric,
    "status" "text" DEFAULT 'OPEN'::"text" NOT NULL,
    "acknowledged_by" "uuid",
    "acknowledged_at" timestamp with time zone,
    "repair_notes" "text",
    "repaired_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "vehicle_damage_events_severity_check" CHECK (("severity" = ANY (ARRAY['minor'::"text", 'blocking'::"text"]))),
    CONSTRAINT "vehicle_damage_events_status_check" CHECK (("status" = ANY (ARRAY['OPEN'::"text", 'ACKNOWLEDGED'::"text", 'DISPUTED'::"text", 'REPAIRED'::"text"])))
);


ALTER TABLE "public"."vehicle_damage_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."vehicle_damage_events" IS 'Schadehistorie per voertuig. Attributed aan vorige chauffeur als baseline geen melding had.';



COMMENT ON COLUMN "public"."vehicle_damage_events"."attributed_to_driver_id" IS 'Chauffeur die de baseline-check reed — vermoedelijk veroorzaker als schade bij diens check niet gemeld werd.';



CREATE TABLE IF NOT EXISTS "public"."vehicles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "plate" "text" NOT NULL,
    "type" "text" NOT NULL,
    "capacity_kg" integer DEFAULT 0 NOT NULL,
    "capacity_pallets" integer DEFAULT 0 NOT NULL,
    "features" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "brand" "text",
    "build_year" integer,
    "cargo_length_cm" integer,
    "cargo_width_cm" integer,
    "cargo_height_cm" integer,
    "status" "text" DEFAULT 'beschikbaar'::"text" NOT NULL,
    "assigned_driver" "text",
    "fuel_consumption" numeric,
    "tenant_id" "uuid" NOT NULL
);


ALTER TABLE "public"."vehicles" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vehicle_check_release_audit" WITH ("security_invoker"='true') AS
 SELECT "vc"."id",
    "vc"."tenant_id",
    "vc"."vehicle_id",
    "v"."code" AS "vehicle_code",
    "vc"."driver_id",
    "d"."name" AS "driver_name",
    "vc"."completed_at",
    "vc"."released_at",
    "vc"."released_by",
    "vc"."release_reason",
    ( SELECT ("count"(*))::integer AS "count"
           FROM "public"."vehicle_damage_events" "de"
          WHERE ("de"."discovered_in_check_id" = "vc"."id")) AS "damage_count"
   FROM (("public"."vehicle_checks" "vc"
     LEFT JOIN "public"."vehicles" "v" ON (("v"."id" = "vc"."vehicle_id")))
     LEFT JOIN "public"."drivers" "d" ON (("d"."id" = "vc"."driver_id")))
  WHERE ("vc"."released_at" IS NOT NULL)
  ORDER BY "vc"."released_at" DESC;


ALTER VIEW "public"."vehicle_check_release_audit" OWNER TO "postgres";


COMMENT ON VIEW "public"."vehicle_check_release_audit" IS 'Audit-trail van RELEASED voertuigchecks. security_invoker laat onderliggende RLS gelden, dus alleen checks uit de eigen tenant zijn zichtbaar.';



CREATE TABLE IF NOT EXISTS "public"."vehicle_check_retention_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "days_threshold" integer NOT NULL,
    "deleted_count" integer DEFAULT 0 NOT NULL,
    "deleted_bytes_estimate" bigint DEFAULT 0 NOT NULL,
    "executed_by" "text",
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."vehicle_check_retention_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."vehicle_check_retention_log" IS 'Elke run van prune_vehicle_check_photos schrijft hier een regel. Audit trail.';



CREATE TABLE IF NOT EXISTS "public"."vehicle_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "doc_type" "text" NOT NULL,
    "expiry_date" "date",
    "file_url" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tenant_id" "uuid" NOT NULL
);


ALTER TABLE "public"."vehicle_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicle_fixed_costs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "cost_type_id" "uuid" NOT NULL,
    "monthly_amount" numeric(12,4) NOT NULL,
    "valid_from" "date",
    "valid_until" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."vehicle_fixed_costs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicle_maintenance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "maintenance_type" "text" DEFAULT 'regulier'::"text" NOT NULL,
    "description" "text",
    "mileage_km" integer,
    "scheduled_date" "date",
    "completed_date" "date",
    "cost" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tenant_id" "uuid" NOT NULL
);


ALTER TABLE "public"."vehicle_maintenance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicle_positions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "vehicle_id" "uuid",
    "driver_id" "uuid",
    "trip_id" "uuid",
    "lat" numeric(10,7) NOT NULL,
    "lng" numeric(10,7) NOT NULL,
    "heading" numeric(5,1),
    "speed" numeric(6,2),
    "accuracy" numeric(6,1),
    "recorded_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."vehicle_positions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicle_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "code" "text" NOT NULL,
    "default_capacity_kg" integer,
    "default_capacity_pallets" integer,
    "is_active" boolean DEFAULT true,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."vehicle_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webhook_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "url" "text" NOT NULL,
    "events" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "secret" "text",
    "is_active" boolean DEFAULT true,
    "last_triggered_at" timestamp with time zone,
    "failure_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."webhook_subscriptions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."orders" ALTER COLUMN "order_number" SET DEFAULT "nextval"('"public"."orders_order_number_seq"'::"regclass");



ALTER TABLE ONLY "public"."trips" ALTER COLUMN "trip_number" SET DEFAULT "nextval"('"public"."trips_trip_number_seq"'::"regclass");



ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_corrections"
    ADD CONSTRAINT "ai_corrections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_decisions"
    ADD CONSTRAINT "ai_decisions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_usage_log"
    ADD CONSTRAINT "ai_usage_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."anomalies"
    ADD CONSTRAINT "anomalies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_contacts"
    ADD CONSTRAINT "client_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_extraction_templates"
    ADD CONSTRAINT "client_extraction_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_locations"
    ADD CONSTRAINT "client_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_portal_users"
    ADD CONSTRAINT "client_portal_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_portal_users"
    ADD CONSTRAINT "client_portal_users_tenant_id_client_id_user_id_key" UNIQUE ("tenant_id", "client_id", "user_id");



ALTER TABLE ONLY "public"."client_rates"
    ADD CONSTRAINT "client_rates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."confidence_metrics"
    ADD CONSTRAINT "confidence_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."confidence_metrics"
    ADD CONSTRAINT "confidence_metrics_tenant_id_client_id_decision_type_period_key" UNIQUE ("tenant_id", "client_id", "decision_type", "period_start");



ALTER TABLE ONLY "public"."consolidation_groups"
    ADD CONSTRAINT "consolidation_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consolidation_orders"
    ADD CONSTRAINT "consolidation_orders_group_id_order_id_key" UNIQUE ("group_id", "order_id");



ALTER TABLE ONLY "public"."consolidation_orders"
    ADD CONSTRAINT "consolidation_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cost_types"
    ADD CONSTRAINT "cost_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_exceptions"
    ADD CONSTRAINT "delivery_exceptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."departments"
    ADD CONSTRAINT "departments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."departments"
    ADD CONSTRAINT "departments_tenant_id_code_key" UNIQUE ("tenant_id", "code");



ALTER TABLE ONLY "public"."disruptions"
    ADD CONSTRAINT "disruptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."driver_positions"
    ADD CONSTRAINT "driver_positions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."driver_time_entries"
    ADD CONSTRAINT "driver_time_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drivers"
    ADD CONSTRAINT "drivers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."earnings_events"
    ADD CONSTRAINT "earnings_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."earnings_events"
    ADD CONSTRAINT "earnings_events_platform_external_event_id_key" UNIQUE ("platform", "external_event_id");



ALTER TABLE ONLY "public"."invoice_lines"
    ADD CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_tenant_id_invoice_number_key" UNIQUE ("tenant_id", "invoice_number");



ALTER TABLE ONLY "public"."loading_units"
    ADD CONSTRAINT "loading_units_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loading_units"
    ADD CONSTRAINT "loading_units_tenant_id_code_key" UNIQUE ("tenant_id", "code");



ALTER TABLE ONLY "public"."location_time_windows"
    ADD CONSTRAINT "location_time_windows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_log"
    ADD CONSTRAINT "notification_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_templates"
    ADD CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_templates"
    ADD CONSTRAINT "notification_templates_tenant_id_trigger_event_channel_key" UNIQUE ("tenant_id", "trigger_event", "channel");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_events"
    ADD CONSTRAINT "order_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_info_requests"
    ADD CONSTRAINT "order_info_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_note_reads"
    ADD CONSTRAINT "order_note_reads_pkey" PRIMARY KEY ("user_id", "order_id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."packaging_movements"
    ADD CONSTRAINT "packaging_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."proof_of_delivery"
    ADD CONSTRAINT "proof_of_delivery_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rate_cards"
    ADD CONSTRAINT "rate_cards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rate_limit_counters"
    ADD CONSTRAINT "rate_limit_counters_pkey" PRIMARY KEY ("key", "window_start");



ALTER TABLE ONLY "public"."rate_rules"
    ADD CONSTRAINT "rate_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."replan_suggestions"
    ADD CONSTRAINT "replan_suggestions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."requirement_types"
    ADD CONSTRAINT "requirement_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."requirement_types"
    ADD CONSTRAINT "requirement_types_tenant_id_code_key" UNIQUE ("tenant_id", "code");



ALTER TABLE ONLY "public"."shipments"
    ADD CONSTRAINT "shipments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."slot_bookings"
    ADD CONSTRAINT "slot_bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."surcharges"
    ADD CONSTRAINT "surcharges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_inbox_audit"
    ADD CONSTRAINT "tenant_inbox_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_inboxes"
    ADD CONSTRAINT "tenant_inboxes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_inboxes"
    ADD CONSTRAINT "tenant_inboxes_tenant_id_label_key" UNIQUE ("tenant_id", "label");



ALTER TABLE ONLY "public"."tenant_members"
    ADD CONSTRAINT "tenant_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_members"
    ADD CONSTRAINT "tenant_members_tenant_id_user_id_key" UNIQUE ("tenant_id", "user_id");



ALTER TABLE ONLY "public"."tenant_warehouses"
    ADD CONSTRAINT "tenant_warehouses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."traject_rules"
    ADD CONSTRAINT "traject_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_costs"
    ADD CONSTRAINT "trip_costs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_stops"
    ADD CONSTRAINT "trip_stops_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE ("user_id", "role");



ALTER TABLE ONLY "public"."vehicle_availability"
    ADD CONSTRAINT "vehicle_availability_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle_check_photos"
    ADD CONSTRAINT "vehicle_check_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle_check_retention_log"
    ADD CONSTRAINT "vehicle_check_retention_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle_checks"
    ADD CONSTRAINT "vehicle_checks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle_damage_events"
    ADD CONSTRAINT "vehicle_damage_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle_documents"
    ADD CONSTRAINT "vehicle_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle_fixed_costs"
    ADD CONSTRAINT "vehicle_fixed_costs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle_maintenance"
    ADD CONSTRAINT "vehicle_maintenance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle_positions"
    ADD CONSTRAINT "vehicle_positions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle_types"
    ADD CONSTRAINT "vehicle_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle_types"
    ADD CONSTRAINT "vehicle_types_tenant_id_code_key" UNIQUE ("tenant_id", "code");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhook_subscriptions"
    ADD CONSTRAINT "webhook_subscriptions_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_activity_entity" ON "public"."activity_log" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_activity_tenant" ON "public"."activity_log" USING "btree" ("tenant_id", "created_at" DESC);



CREATE INDEX "idx_ai_corrections_client" ON "public"."ai_corrections" USING "btree" ("client_name");



CREATE INDEX "idx_ai_corrections_created" ON "public"."ai_corrections" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_ai_decisions_confidence" ON "public"."ai_decisions" USING "btree" ("confidence_score");



CREATE INDEX "idx_ai_decisions_created" ON "public"."ai_decisions" USING "btree" ("created_at");



CREATE INDEX "idx_ai_decisions_tenant" ON "public"."ai_decisions" USING "btree" ("tenant_id");



CREATE INDEX "idx_ai_decisions_type" ON "public"."ai_decisions" USING "btree" ("decision_type");



CREATE INDEX "idx_ai_usage_log_tenant" ON "public"."ai_usage_log" USING "btree" ("tenant_id", "created_at" DESC);



CREATE INDEX "idx_anomalies_entity" ON "public"."anomalies" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_anomalies_severity" ON "public"."anomalies" USING "btree" ("severity");



CREATE INDEX "idx_anomalies_tenant" ON "public"."anomalies" USING "btree" ("tenant_id");



CREATE INDEX "idx_anomalies_unresolved" ON "public"."anomalies" USING "btree" ("tenant_id") WHERE ("resolved_at" IS NULL);



CREATE INDEX "idx_audit_log_created" ON "public"."audit_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_audit_log_record" ON "public"."audit_log" USING "btree" ("record_id");



CREATE INDEX "idx_audit_log_table" ON "public"."audit_log" USING "btree" ("table_name");



CREATE INDEX "idx_audit_log_user" ON "public"."audit_log" USING "btree" ("user_id");



CREATE INDEX "idx_client_contacts_tenant_client" ON "public"."client_contacts" USING "btree" ("tenant_id", "client_id");



CREATE INDEX "idx_client_locations_tenant" ON "public"."client_locations" USING "btree" ("tenant_id");



CREATE INDEX "idx_client_portal_users_client" ON "public"."client_portal_users" USING "btree" ("client_id");



CREATE INDEX "idx_client_portal_users_tenant" ON "public"."client_portal_users" USING "btree" ("tenant_id");



CREATE INDEX "idx_client_portal_users_user" ON "public"."client_portal_users" USING "btree" ("user_id");



CREATE INDEX "idx_client_rates_tenant" ON "public"."client_rates" USING "btree" ("tenant_id");



CREATE INDEX "idx_clients_tenant" ON "public"."clients" USING "btree" ("tenant_id");



CREATE INDEX "idx_consolidation_groups_tenant_date" ON "public"."consolidation_groups" USING "btree" ("tenant_id", "planned_date", "status");



CREATE INDEX "idx_consolidation_orders_group" ON "public"."consolidation_orders" USING "btree" ("group_id");



CREATE INDEX "idx_consolidation_orders_order" ON "public"."consolidation_orders" USING "btree" ("order_id");



CREATE INDEX "idx_cost_types_tenant" ON "public"."cost_types" USING "btree" ("tenant_id", "is_active");



CREATE INDEX "idx_damage_attributed_driver" ON "public"."vehicle_damage_events" USING "btree" ("attributed_to_driver_id");



CREATE INDEX "idx_damage_status" ON "public"."vehicle_damage_events" USING "btree" ("status");



CREATE INDEX "idx_damage_tenant_vehicle" ON "public"."vehicle_damage_events" USING "btree" ("tenant_id", "vehicle_id");



CREATE INDEX "idx_departments_tenant" ON "public"."departments" USING "btree" ("tenant_id");



CREATE INDEX "idx_dex_tenant" ON "public"."delivery_exceptions" USING "btree" ("tenant_id", "status");



CREATE INDEX "idx_disruptions_tenant" ON "public"."disruptions" USING "btree" ("tenant_id");



CREATE INDEX "idx_disruptions_type" ON "public"."disruptions" USING "btree" ("type");



CREATE INDEX "idx_driver_positions_driver" ON "public"."driver_positions" USING "btree" ("driver_id", "recorded_at" DESC);



CREATE INDEX "idx_driver_time_driver" ON "public"."driver_time_entries" USING "btree" ("driver_id", "recorded_at" DESC);



CREATE INDEX "idx_drivers_tenant" ON "public"."drivers" USING "btree" ("tenant_id");



CREATE INDEX "idx_drivers_tenant_active" ON "public"."drivers" USING "btree" ("tenant_id", "is_active");



CREATE INDEX "idx_earnings_phone_occurred" ON "public"."earnings_events" USING "btree" ("phone_number", "occurred_at");



CREATE INDEX "idx_invoice_lines_invoice" ON "public"."invoice_lines" USING "btree" ("invoice_id");



CREATE INDEX "idx_invoices_client" ON "public"."invoices" USING "btree" ("client_id");



CREATE INDEX "idx_invoices_tenant" ON "public"."invoices" USING "btree" ("tenant_id");



CREATE INDEX "idx_loading_units_tenant" ON "public"."loading_units" USING "btree" ("tenant_id");



CREATE INDEX "idx_location_time_windows_location" ON "public"."location_time_windows" USING "btree" ("client_location_id", "day_of_week");



CREATE INDEX "idx_notification_log_order" ON "public"."notification_log" USING "btree" ("order_id");



CREATE INDEX "idx_notification_log_status" ON "public"."notification_log" USING "btree" ("status");



CREATE INDEX "idx_notification_log_tenant" ON "public"."notification_log" USING "btree" ("tenant_id");



CREATE INDEX "idx_notification_log_trip" ON "public"."notification_log" USING "btree" ("trip_id");



CREATE INDEX "idx_notification_templates_tenant" ON "public"."notification_templates" USING "btree" ("tenant_id");



CREATE INDEX "idx_notification_templates_trigger" ON "public"."notification_templates" USING "btree" ("tenant_id", "trigger_event", "channel");



CREATE INDEX "idx_notifications_tenant" ON "public"."notifications" USING "btree" ("tenant_id");



CREATE INDEX "idx_notifications_tenant_user" ON "public"."notifications" USING "btree" ("tenant_id", "user_id");



CREATE INDEX "idx_order_events_created" ON "public"."order_events" USING "btree" ("created_at");



CREATE INDEX "idx_order_events_order" ON "public"."order_events" USING "btree" ("order_id");



CREATE INDEX "idx_order_events_tenant" ON "public"."order_events" USING "btree" ("tenant_id");



CREATE INDEX "idx_order_events_type" ON "public"."order_events" USING "btree" ("event_type");



CREATE INDEX "idx_order_info_requests_expected_by" ON "public"."order_info_requests" USING "btree" ("expected_by") WHERE ("status" = 'PENDING'::"text");



CREATE INDEX "idx_order_info_requests_order" ON "public"."order_info_requests" USING "btree" ("order_id");



CREATE INDEX "idx_order_info_requests_tenant_status" ON "public"."order_info_requests" USING "btree" ("tenant_id", "status");



CREATE INDEX "idx_order_note_reads_order" ON "public"."order_note_reads" USING "btree" ("order_id");



CREATE INDEX "idx_order_note_reads_user_read" ON "public"."order_note_reads" USING "btree" ("user_id", "read_at" DESC);



CREATE INDEX "idx_orders_billing" ON "public"."orders" USING "btree" ("billing_status");



CREATE INDEX "idx_orders_client_id" ON "public"."orders" USING "btree" ("client_id");



CREATE INDEX "idx_orders_cmr_number" ON "public"."orders" USING "btree" ("cmr_number") WHERE ("cmr_number" IS NOT NULL);



CREATE INDEX "idx_orders_department_id" ON "public"."orders" USING "btree" ("department_id");



CREATE INDEX "idx_orders_info_status" ON "public"."orders" USING "btree" ("tenant_id", "info_status") WHERE ("info_status" <> 'COMPLETE'::"text");



CREATE INDEX "idx_orders_order_type" ON "public"."orders" USING "btree" ("order_type");



CREATE INDEX "idx_orders_parent_order_id" ON "public"."orders" USING "btree" ("parent_order_id");



CREATE INDEX "idx_orders_recipient_email" ON "public"."orders" USING "btree" ("recipient_email") WHERE ("recipient_email" IS NOT NULL);



CREATE INDEX "idx_orders_shipment_id" ON "public"."orders" USING "btree" ("shipment_id");



CREATE INDEX "idx_orders_source" ON "public"."orders" USING "btree" ("source");



CREATE INDEX "idx_orders_tenant" ON "public"."orders" USING "btree" ("tenant_id");



CREATE INDEX "idx_orders_tenant_created" ON "public"."orders" USING "btree" ("tenant_id", "created_at" DESC);



CREATE INDEX "idx_orders_tenant_status" ON "public"."orders" USING "btree" ("tenant_id", "status");



CREATE INDEX "idx_packaging_movements_client" ON "public"."packaging_movements" USING "btree" ("client_id");



CREATE INDEX "idx_packaging_movements_order" ON "public"."packaging_movements" USING "btree" ("order_id");



CREATE INDEX "idx_packaging_movements_recorded_at" ON "public"."packaging_movements" USING "btree" ("recorded_at");



CREATE INDEX "idx_packaging_movements_stop" ON "public"."packaging_movements" USING "btree" ("trip_stop_id");



CREATE INDEX "idx_packaging_movements_tenant" ON "public"."packaging_movements" USING "btree" ("tenant_id");



CREATE INDEX "idx_packaging_movements_unit" ON "public"."packaging_movements" USING "btree" ("loading_unit_id");



CREATE INDEX "idx_pod_stop" ON "public"."proof_of_delivery" USING "btree" ("trip_stop_id");



CREATE INDEX "idx_profiles_tenant" ON "public"."profiles" USING "btree" ("tenant_id");



CREATE INDEX "idx_rate_cards_client" ON "public"."rate_cards" USING "btree" ("client_id", "is_active");



CREATE INDEX "idx_rate_cards_tenant" ON "public"."rate_cards" USING "btree" ("tenant_id", "is_active");



CREATE INDEX "idx_rate_limit_counters_cleanup" ON "public"."rate_limit_counters" USING "btree" ("window_start");



CREATE INDEX "idx_rate_rules_card" ON "public"."rate_rules" USING "btree" ("rate_card_id", "sort_order");



CREATE INDEX "idx_rate_rules_vehicle_type" ON "public"."rate_rules" USING "btree" ("vehicle_type_id") WHERE ("vehicle_type_id" IS NOT NULL);



CREATE INDEX "idx_replan_suggestions_disruption" ON "public"."replan_suggestions" USING "btree" ("disruption_id");



CREATE INDEX "idx_requirement_types_tenant" ON "public"."requirement_types" USING "btree" ("tenant_id");



CREATE INDEX "idx_retention_log_run_at" ON "public"."vehicle_check_retention_log" USING "btree" ("run_at" DESC);



CREATE INDEX "idx_shipments_client" ON "public"."shipments" USING "btree" ("client_id");



CREATE INDEX "idx_shipments_status" ON "public"."shipments" USING "btree" ("status");



CREATE INDEX "idx_shipments_tenant" ON "public"."shipments" USING "btree" ("tenant_id");



CREATE INDEX "idx_slot_bookings_location_date" ON "public"."slot_bookings" USING "btree" ("client_location_id", "slot_date", "status");



CREATE INDEX "idx_slot_bookings_order" ON "public"."slot_bookings" USING "btree" ("order_id");



CREATE INDEX "idx_surcharges_tenant" ON "public"."surcharges" USING "btree" ("tenant_id", "is_active");



CREATE INDEX "idx_tenant_inbox_audit_inbox" ON "public"."tenant_inbox_audit" USING "btree" ("inbox_id", "created_at" DESC);



CREATE INDEX "idx_tenant_inbox_audit_tenant" ON "public"."tenant_inbox_audit" USING "btree" ("tenant_id", "created_at" DESC);



CREATE INDEX "idx_tenant_inboxes_active_poll" ON "public"."tenant_inboxes" USING "btree" ("is_active", "next_poll_at") WHERE "is_active";



CREATE INDEX "idx_tenant_inboxes_tenant" ON "public"."tenant_inboxes" USING "btree" ("tenant_id");



CREATE INDEX "idx_tenant_members_tenant" ON "public"."tenant_members" USING "btree" ("tenant_id");



CREATE INDEX "idx_tenant_members_user" ON "public"."tenant_members" USING "btree" ("user_id");



CREATE INDEX "idx_tenant_warehouses_tenant" ON "public"."tenant_warehouses" USING "btree" ("tenant_id");



CREATE INDEX "idx_traject_rules_tenant_active" ON "public"."traject_rules" USING "btree" ("tenant_id", "is_active", "priority");



CREATE INDEX "idx_trip_costs_tenant" ON "public"."trip_costs" USING "btree" ("tenant_id");



CREATE INDEX "idx_trip_costs_trip" ON "public"."trip_costs" USING "btree" ("trip_id");



CREATE INDEX "idx_trip_costs_type" ON "public"."trip_costs" USING "btree" ("cost_type_id");



CREATE INDEX "idx_trip_stops_order" ON "public"."trip_stops" USING "btree" ("order_id");



CREATE INDEX "idx_trip_stops_trip" ON "public"."trip_stops" USING "btree" ("trip_id", "stop_sequence");



CREATE INDEX "idx_trips_driver" ON "public"."trips" USING "btree" ("driver_id", "dispatch_status");



CREATE INDEX "idx_trips_tenant_date" ON "public"."trips" USING "btree" ("tenant_id", "planned_date");



CREATE INDEX "idx_trips_vehicle_date" ON "public"."trips" USING "btree" ("vehicle_id", "planned_date");



CREATE INDEX "idx_vehicle_availability_tenant" ON "public"."vehicle_availability" USING "btree" ("tenant_id");



CREATE INDEX "idx_vehicle_check_photos_check" ON "public"."vehicle_check_photos" USING "btree" ("check_id");



CREATE INDEX "idx_vehicle_check_photos_side" ON "public"."vehicle_check_photos" USING "btree" ("side");



CREATE INDEX "idx_vehicle_checks_driver_vehicle_date" ON "public"."vehicle_checks" USING "btree" ("driver_id", "vehicle_id", "started_at" DESC);



CREATE INDEX "idx_vehicle_checks_status" ON "public"."vehicle_checks" USING "btree" ("status");



CREATE INDEX "idx_vehicle_checks_tenant" ON "public"."vehicle_checks" USING "btree" ("tenant_id");



CREATE INDEX "idx_vehicle_documents_tenant" ON "public"."vehicle_documents" USING "btree" ("tenant_id");



CREATE INDEX "idx_vehicle_fixed_costs_tenant" ON "public"."vehicle_fixed_costs" USING "btree" ("tenant_id");



CREATE INDEX "idx_vehicle_fixed_costs_vehicle" ON "public"."vehicle_fixed_costs" USING "btree" ("vehicle_id");



CREATE INDEX "idx_vehicle_maintenance_tenant" ON "public"."vehicle_maintenance" USING "btree" ("tenant_id");



CREATE INDEX "idx_vehicle_positions_time" ON "public"."vehicle_positions" USING "btree" ("recorded_at" DESC);



CREATE INDEX "idx_vehicle_positions_trip" ON "public"."vehicle_positions" USING "btree" ("trip_id");



CREATE INDEX "idx_vehicle_positions_vehicle" ON "public"."vehicle_positions" USING "btree" ("vehicle_id");



CREATE INDEX "idx_vehicle_types_tenant" ON "public"."vehicle_types" USING "btree" ("tenant_id");



CREATE INDEX "idx_vehicles_tenant" ON "public"."vehicles" USING "btree" ("tenant_id");



CREATE UNIQUE INDEX "uniq_client_contacts_backup_per_client" ON "public"."client_contacts" USING "btree" ("client_id") WHERE (("role" = 'backup'::"text") AND ("is_active" = true));



CREATE UNIQUE INDEX "uniq_client_contacts_primary_per_client" ON "public"."client_contacts" USING "btree" ("client_id") WHERE (("role" = 'primary'::"text") AND ("is_active" = true));



CREATE UNIQUE INDEX "ux_order_info_requests_open_field" ON "public"."order_info_requests" USING "btree" ("order_id", "field_name") WHERE ("status" = 'PENDING'::"text");



CREATE OR REPLACE TRIGGER "audit_clients" AFTER INSERT OR DELETE OR UPDATE ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_func"();



CREATE OR REPLACE TRIGGER "audit_orders" AFTER INSERT OR DELETE OR UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_func"();



CREATE OR REPLACE TRIGGER "audit_vehicles" AFTER INSERT OR DELETE OR UPDATE ON "public"."vehicles" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_func"();



CREATE OR REPLACE TRIGGER "cleanup_tenant_inbox_secret_trg" BEFORE DELETE ON "public"."tenant_inboxes" FOR EACH ROW EXECUTE FUNCTION "public"."cleanup_tenant_inbox_secret"();



CREATE OR REPLACE TRIGGER "enforce_order_status_transition" BEFORE UPDATE OF "status" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."validate_order_status_transition"();



CREATE OR REPLACE TRIGGER "set_invoices_updated_at" BEFORE UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "trg_assign_shipment_number" BEFORE INSERT ON "public"."shipments" FOR EACH ROW EXECUTE FUNCTION "public"."assign_shipment_number"();



CREATE OR REPLACE TRIGGER "trg_enforce_department_on_transition" BEFORE INSERT OR UPDATE OF "status", "department_id" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_department_on_transition"();



CREATE OR REPLACE TRIGGER "trg_notify_delivered" AFTER UPDATE OF "dispatch_status" ON "public"."trips" FOR EACH ROW EXECUTE FUNCTION "public"."trg_notify_delivered"();



CREATE OR REPLACE TRIGGER "trg_notify_driver_arrived" AFTER UPDATE OF "stop_status" ON "public"."trip_stops" FOR EACH ROW EXECUTE FUNCTION "public"."trg_notify_driver_arrived"();



CREATE OR REPLACE TRIGGER "trg_notify_exception" AFTER UPDATE OF "status" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."trg_notify_exception"();



CREATE OR REPLACE TRIGGER "trg_notify_new_damage" AFTER INSERT ON "public"."vehicle_damage_events" FOR EACH ROW EXECUTE FUNCTION "public"."notify_new_damage"();



CREATE OR REPLACE TRIGGER "trg_notify_order_confirmed" AFTER UPDATE OF "status" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."trg_notify_order_confirmed"();



CREATE OR REPLACE TRIGGER "trg_notify_trip_started" AFTER UPDATE OF "dispatch_status" ON "public"."trips" FOR EACH ROW EXECUTE FUNCTION "public"."trg_notify_trip_started"();



CREATE OR REPLACE TRIGGER "trg_order_info_requests_sync" AFTER INSERT OR DELETE OR UPDATE ON "public"."order_info_requests" FOR EACH ROW EXECUTE FUNCTION "public"."trg_order_info_requests_sync"();



CREATE OR REPLACE TRIGGER "trg_orders_notes_updated_at" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."trg_orders_notes_updated_at"();



CREATE OR REPLACE TRIGGER "trg_seed_tenant_defaults" AFTER INSERT ON "public"."tenants" FOR EACH ROW EXECUTE FUNCTION "public"."seed_tenant_defaults"();



CREATE OR REPLACE TRIGGER "trg_shipments_notes_updated_at" BEFORE UPDATE ON "public"."shipments" FOR EACH ROW EXECUTE FUNCTION "public"."trg_shipments_notes_updated_at"();



CREATE OR REPLACE TRIGGER "update_client_contacts_updated_at" BEFORE UPDATE ON "public"."client_contacts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_consolidation_groups_updated_at" BEFORE UPDATE ON "public"."consolidation_groups" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_cost_types_updated_at" BEFORE UPDATE ON "public"."cost_types" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_drivers_updated_at" BEFORE UPDATE ON "public"."drivers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_extraction_templates_updated_at" BEFORE UPDATE ON "public"."client_extraction_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_location_time_windows_updated_at" BEFORE UPDATE ON "public"."location_time_windows" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_orders_updated_at" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_rate_cards_updated_at" BEFORE UPDATE ON "public"."rate_cards" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_slot_bookings_updated_at" BEFORE UPDATE ON "public"."slot_bookings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_surcharges_updated_at" BEFORE UPDATE ON "public"."surcharges" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_tenant_inboxes_updated_at" BEFORE UPDATE ON "public"."tenant_inboxes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_vehicle_fixed_costs_updated_at" BEFORE UPDATE ON "public"."vehicle_fixed_costs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_vehicles_updated_at" BEFORE UPDATE ON "public"."vehicles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_decisions"
    ADD CONSTRAINT "ai_decisions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_usage_log"
    ADD CONSTRAINT "ai_usage_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."anomalies"
    ADD CONSTRAINT "anomalies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."client_contacts"
    ADD CONSTRAINT "client_contacts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_contacts"
    ADD CONSTRAINT "client_contacts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_extraction_templates"
    ADD CONSTRAINT "client_extraction_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_locations"
    ADD CONSTRAINT "client_locations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_locations"
    ADD CONSTRAINT "client_locations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."client_portal_users"
    ADD CONSTRAINT "client_portal_users_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_portal_users"
    ADD CONSTRAINT "client_portal_users_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_portal_users"
    ADD CONSTRAINT "client_portal_users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_portal_users"
    ADD CONSTRAINT "client_portal_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_rates"
    ADD CONSTRAINT "client_rates_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_rates"
    ADD CONSTRAINT "client_rates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."confidence_metrics"
    ADD CONSTRAINT "confidence_metrics_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."consolidation_groups"
    ADD CONSTRAINT "consolidation_groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."consolidation_groups"
    ADD CONSTRAINT "consolidation_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."consolidation_groups"
    ADD CONSTRAINT "consolidation_groups_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."consolidation_orders"
    ADD CONSTRAINT "consolidation_orders_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."consolidation_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."consolidation_orders"
    ADD CONSTRAINT "consolidation_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cost_types"
    ADD CONSTRAINT "cost_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_exceptions"
    ADD CONSTRAINT "delivery_exceptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_exceptions"
    ADD CONSTRAINT "delivery_exceptions_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id");



ALTER TABLE ONLY "public"."delivery_exceptions"
    ADD CONSTRAINT "delivery_exceptions_trip_stop_id_fkey" FOREIGN KEY ("trip_stop_id") REFERENCES "public"."trip_stops"("id");



ALTER TABLE ONLY "public"."departments"
    ADD CONSTRAINT "departments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."disruptions"
    ADD CONSTRAINT "disruptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drivers"
    ADD CONSTRAINT "drivers_current_vehicle_id_fkey" FOREIGN KEY ("current_vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."drivers"
    ADD CONSTRAINT "drivers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_lines"
    ADD CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_lines"
    ADD CONSTRAINT "invoice_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."loading_units"
    ADD CONSTRAINT "loading_units_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."location_time_windows"
    ADD CONSTRAINT "location_time_windows_client_location_id_fkey" FOREIGN KEY ("client_location_id") REFERENCES "public"."client_locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."location_time_windows"
    ADD CONSTRAINT "location_time_windows_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_log"
    ADD CONSTRAINT "notification_log_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notification_log"
    ADD CONSTRAINT "notification_log_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."notification_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notification_log"
    ADD CONSTRAINT "notification_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_log"
    ADD CONSTRAINT "notification_log_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notification_templates"
    ADD CONSTRAINT "notification_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_events"
    ADD CONSTRAINT "order_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_info_requests"
    ADD CONSTRAINT "order_info_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_info_requests"
    ADD CONSTRAINT "order_info_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_note_reads"
    ADD CONSTRAINT "order_note_reads_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_note_reads"
    ADD CONSTRAINT "order_note_reads_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_note_reads"
    ADD CONSTRAINT "order_note_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_parent_order_id_fkey" FOREIGN KEY ("parent_order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_portal_submitted_by_fkey" FOREIGN KEY ("portal_submitted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_vehicle_uuid_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."packaging_movements"
    ADD CONSTRAINT "packaging_movements_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."packaging_movements"
    ADD CONSTRAINT "packaging_movements_loading_unit_id_fkey" FOREIGN KEY ("loading_unit_id") REFERENCES "public"."loading_units"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."packaging_movements"
    ADD CONSTRAINT "packaging_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."packaging_movements"
    ADD CONSTRAINT "packaging_movements_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."packaging_movements"
    ADD CONSTRAINT "packaging_movements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."packaging_movements"
    ADD CONSTRAINT "packaging_movements_trip_stop_id_fkey" FOREIGN KEY ("trip_stop_id") REFERENCES "public"."trip_stops"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."proof_of_delivery"
    ADD CONSTRAINT "proof_of_delivery_trip_stop_id_fkey" FOREIGN KEY ("trip_stop_id") REFERENCES "public"."trip_stops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rate_cards"
    ADD CONSTRAINT "rate_cards_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rate_cards"
    ADD CONSTRAINT "rate_cards_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rate_rules"
    ADD CONSTRAINT "rate_rules_rate_card_id_fkey" FOREIGN KEY ("rate_card_id") REFERENCES "public"."rate_cards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rate_rules"
    ADD CONSTRAINT "rate_rules_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "public"."vehicle_types"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."replan_suggestions"
    ADD CONSTRAINT "replan_suggestions_disruption_id_fkey" FOREIGN KEY ("disruption_id") REFERENCES "public"."disruptions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."replan_suggestions"
    ADD CONSTRAINT "replan_suggestions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."requirement_types"
    ADD CONSTRAINT "requirement_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shipments"
    ADD CONSTRAINT "shipments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shipments"
    ADD CONSTRAINT "shipments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."slot_bookings"
    ADD CONSTRAINT "slot_bookings_booked_by_fkey" FOREIGN KEY ("booked_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."slot_bookings"
    ADD CONSTRAINT "slot_bookings_client_location_id_fkey" FOREIGN KEY ("client_location_id") REFERENCES "public"."client_locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."slot_bookings"
    ADD CONSTRAINT "slot_bookings_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."slot_bookings"
    ADD CONSTRAINT "slot_bookings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."slot_bookings"
    ADD CONSTRAINT "slot_bookings_trip_stop_id_fkey" FOREIGN KEY ("trip_stop_id") REFERENCES "public"."trip_stops"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."surcharges"
    ADD CONSTRAINT "surcharges_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_inbox_audit"
    ADD CONSTRAINT "tenant_inbox_audit_inbox_id_fkey" FOREIGN KEY ("inbox_id") REFERENCES "public"."tenant_inboxes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tenant_inbox_audit"
    ADD CONSTRAINT "tenant_inbox_audit_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_inbox_audit"
    ADD CONSTRAINT "tenant_inbox_audit_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tenant_inboxes"
    ADD CONSTRAINT "tenant_inboxes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_members"
    ADD CONSTRAINT "tenant_members_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_members"
    ADD CONSTRAINT "tenant_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_warehouses"
    ADD CONSTRAINT "tenant_warehouses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."traject_rules"
    ADD CONSTRAINT "traject_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_costs"
    ADD CONSTRAINT "trip_costs_cost_type_id_fkey" FOREIGN KEY ("cost_type_id") REFERENCES "public"."cost_types"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."trip_costs"
    ADD CONSTRAINT "trip_costs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_costs"
    ADD CONSTRAINT "trip_costs_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_stops"
    ADD CONSTRAINT "trip_stops_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_availability"
    ADD CONSTRAINT "vehicle_availability_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."vehicle_availability"
    ADD CONSTRAINT "vehicle_availability_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_check_photos"
    ADD CONSTRAINT "vehicle_check_photos_baseline_photo_id_fkey" FOREIGN KEY ("baseline_photo_id") REFERENCES "public"."vehicle_check_photos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vehicle_check_photos"
    ADD CONSTRAINT "vehicle_check_photos_check_id_fkey" FOREIGN KEY ("check_id") REFERENCES "public"."vehicle_checks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_checks"
    ADD CONSTRAINT "vehicle_checks_baseline_check_id_fkey" FOREIGN KEY ("baseline_check_id") REFERENCES "public"."vehicle_checks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vehicle_checks"
    ADD CONSTRAINT "vehicle_checks_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_checks"
    ADD CONSTRAINT "vehicle_checks_released_by_fkey" FOREIGN KEY ("released_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vehicle_checks"
    ADD CONSTRAINT "vehicle_checks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_checks"
    ADD CONSTRAINT "vehicle_checks_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_damage_events"
    ADD CONSTRAINT "vehicle_damage_events_acknowledged_by_fkey" FOREIGN KEY ("acknowledged_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vehicle_damage_events"
    ADD CONSTRAINT "vehicle_damage_events_attributed_to_check_id_fkey" FOREIGN KEY ("attributed_to_check_id") REFERENCES "public"."vehicle_checks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vehicle_damage_events"
    ADD CONSTRAINT "vehicle_damage_events_attributed_to_driver_id_fkey" FOREIGN KEY ("attributed_to_driver_id") REFERENCES "public"."drivers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vehicle_damage_events"
    ADD CONSTRAINT "vehicle_damage_events_discovered_by_driver_id_fkey" FOREIGN KEY ("discovered_by_driver_id") REFERENCES "public"."drivers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vehicle_damage_events"
    ADD CONSTRAINT "vehicle_damage_events_discovered_in_check_id_fkey" FOREIGN KEY ("discovered_in_check_id") REFERENCES "public"."vehicle_checks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_damage_events"
    ADD CONSTRAINT "vehicle_damage_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_damage_events"
    ADD CONSTRAINT "vehicle_damage_events_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_documents"
    ADD CONSTRAINT "vehicle_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."vehicle_documents"
    ADD CONSTRAINT "vehicle_documents_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_fixed_costs"
    ADD CONSTRAINT "vehicle_fixed_costs_cost_type_id_fkey" FOREIGN KEY ("cost_type_id") REFERENCES "public"."cost_types"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."vehicle_fixed_costs"
    ADD CONSTRAINT "vehicle_fixed_costs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_fixed_costs"
    ADD CONSTRAINT "vehicle_fixed_costs_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_maintenance"
    ADD CONSTRAINT "vehicle_maintenance_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."vehicle_maintenance"
    ADD CONSTRAINT "vehicle_maintenance_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_positions"
    ADD CONSTRAINT "vehicle_positions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_types"
    ADD CONSTRAINT "vehicle_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."webhook_subscriptions"
    ADD CONSTRAINT "webhook_subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



CREATE POLICY "Admins can delete roles" ON "public"."user_roles" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can insert roles" ON "public"."user_roles" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Anyone can insert ai_decisions" ON "public"."ai_decisions" FOR INSERT WITH CHECK (true);



CREATE POLICY "Anyone can insert anomalies" ON "public"."anomalies" FOR INSERT WITH CHECK (true);



CREATE POLICY "Anyone can insert confidence_metrics" ON "public"."confidence_metrics" FOR INSERT WITH CHECK (true);



CREATE POLICY "Anyone can insert disruptions" ON "public"."disruptions" FOR INSERT WITH CHECK (true);



CREATE POLICY "Anyone can insert order_events" ON "public"."order_events" FOR INSERT WITH CHECK (true);



CREATE POLICY "Anyone can insert replan_suggestions" ON "public"."replan_suggestions" FOR INSERT WITH CHECK (true);



CREATE POLICY "Anyone can read ai_decisions" ON "public"."ai_decisions" FOR SELECT USING (true);



CREATE POLICY "Anyone can read anomalies" ON "public"."anomalies" FOR SELECT USING (true);



CREATE POLICY "Anyone can read confidence_metrics" ON "public"."confidence_metrics" FOR SELECT USING (true);



CREATE POLICY "Anyone can read disruptions" ON "public"."disruptions" FOR SELECT USING (true);



CREATE POLICY "Anyone can read order_events" ON "public"."order_events" FOR SELECT USING (true);



CREATE POLICY "Anyone can read replan_suggestions" ON "public"."replan_suggestions" FOR SELECT USING (true);



CREATE POLICY "Anyone can read vehicle_positions" ON "public"."vehicle_positions" FOR SELECT USING (true);



CREATE POLICY "Anyone can update ai_decisions" ON "public"."ai_decisions" FOR UPDATE USING (true);



CREATE POLICY "Anyone can update anomalies" ON "public"."anomalies" FOR UPDATE USING (true);



CREATE POLICY "Anyone can update confidence_metrics" ON "public"."confidence_metrics" FOR UPDATE USING (true);



CREATE POLICY "Anyone can update disruptions" ON "public"."disruptions" FOR UPDATE USING (true);



CREATE POLICY "Anyone can update order_events" ON "public"."order_events" FOR UPDATE USING (true);



CREATE POLICY "Anyone can update replan_suggestions" ON "public"."replan_suggestions" FOR UPDATE USING (true);



CREATE POLICY "Authenticated read on retention_log" ON "public"."vehicle_check_retention_log" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view roles" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Members can read own tenant" ON "public"."tenants" FOR SELECT TO "authenticated" USING (("id" = (( SELECT (("auth"."jwt"() -> 'app_metadata'::"text") ->> 'tenant_id'::"text")))::"uuid"));



CREATE POLICY "Members can read own tenant members" ON "public"."tenant_members" FOR SELECT TO "authenticated" USING (("tenant_id" = (( SELECT (("auth"."jwt"() -> 'app_metadata'::"text") ->> 'tenant_id'::"text")))::"uuid"));



CREATE POLICY "Owners/admins can manage tenant members" ON "public"."tenant_members" TO "authenticated" USING ((("tenant_id" = (( SELECT (("auth"."jwt"() -> 'app_metadata'::"text") ->> 'tenant_id'::"text")))::"uuid") AND (EXISTS ( SELECT 1
   FROM "public"."tenant_members" "tm"
  WHERE (("tm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("tm"."tenant_id" = (( SELECT (("auth"."jwt"() -> 'app_metadata'::"text") ->> 'tenant_id'::"text")))::"uuid") AND ("tm"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))));



CREATE POLICY "Service role full access" ON "public"."order_note_reads" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access on client_contacts" ON "public"."client_contacts" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access on damage_events" ON "public"."vehicle_damage_events" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access on departments" ON "public"."departments" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access on order_info_requests" ON "public"."order_info_requests" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access on retention_log" ON "public"."vehicle_check_retention_log" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access on shipments" ON "public"."shipments" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access on traject_rules" ON "public"."traject_rules" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access on vehicle_check_photos" ON "public"."vehicle_check_photos" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access on vehicle_checks" ON "public"."vehicle_checks" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access on warehouses" ON "public"."tenant_warehouses" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access tenants" ON "public"."tenants" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role: activity_log" ON "public"."activity_log" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role: ai_usage_log" ON "public"."ai_usage_log" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role: clients" ON "public"."clients" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role: cost_types" ON "public"."cost_types" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role: drivers" ON "public"."drivers" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role: extraction_templates" ON "public"."client_extraction_templates" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role: invoice_lines" ON "public"."invoice_lines" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role: invoices" ON "public"."invoices" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role: loading_units" ON "public"."loading_units" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role: notifications" ON "public"."notifications" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role: orders" ON "public"."orders" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role: rate_limit_counters" ON "public"."rate_limit_counters" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role: requirement_types" ON "public"."requirement_types" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role: tenant_inbox_audit" ON "public"."tenant_inbox_audit" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role: tenant_inboxes" ON "public"."tenant_inboxes" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role: trip_costs" ON "public"."trip_costs" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role: vehicle_fixed_costs" ON "public"."vehicle_fixed_costs" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role: vehicle_types" ON "public"."vehicle_types" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role: vehicles" ON "public"."vehicles" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Tenant isolation for client_contacts" ON "public"."client_contacts" TO "authenticated" USING (("tenant_id" IN ( SELECT "tm"."tenant_id"
   FROM "public"."tenant_members" "tm"
  WHERE ("tm"."user_id" = "auth"."uid"())))) WITH CHECK (("tenant_id" IN ( SELECT "tm"."tenant_id"
   FROM "public"."tenant_members" "tm"
  WHERE ("tm"."user_id" = "auth"."uid"()))));



CREATE POLICY "Tenant isolation for damage_events" ON "public"."vehicle_damage_events" TO "authenticated" USING ("public"."user_has_tenant_access"("tenant_id")) WITH CHECK ("public"."user_has_tenant_access"("tenant_id"));



CREATE POLICY "Tenant isolation for departments" ON "public"."departments" TO "authenticated" USING ("public"."user_has_tenant_access"("tenant_id")) WITH CHECK ("public"."user_has_tenant_access"("tenant_id"));



CREATE POLICY "Tenant isolation for order_info_requests" ON "public"."order_info_requests" USING (("tenant_id" IN ( SELECT "tm"."tenant_id"
   FROM "public"."tenant_members" "tm"
  WHERE ("tm"."user_id" = "auth"."uid"())))) WITH CHECK (("tenant_id" IN ( SELECT "tm"."tenant_id"
   FROM "public"."tenant_members" "tm"
  WHERE ("tm"."user_id" = "auth"."uid"()))));



CREATE POLICY "Tenant isolation for shipments" ON "public"."shipments" TO "authenticated" USING ("public"."user_has_tenant_access"("tenant_id")) WITH CHECK ("public"."user_has_tenant_access"("tenant_id"));



CREATE POLICY "Tenant isolation for traject_rules" ON "public"."traject_rules" TO "authenticated" USING ("public"."user_has_tenant_access"("tenant_id")) WITH CHECK ("public"."user_has_tenant_access"("tenant_id"));



CREATE POLICY "Tenant isolation for vehicle_check_photos" ON "public"."vehicle_check_photos" TO "authenticated" USING (("check_id" IN ( SELECT "vc"."id"
   FROM "public"."vehicle_checks" "vc"
  WHERE "public"."user_has_tenant_access"("vc"."tenant_id")))) WITH CHECK (("check_id" IN ( SELECT "vc"."id"
   FROM "public"."vehicle_checks" "vc"
  WHERE "public"."user_has_tenant_access"("vc"."tenant_id"))));



CREATE POLICY "Tenant isolation for vehicle_checks" ON "public"."vehicle_checks" TO "authenticated" USING ("public"."user_has_tenant_access"("tenant_id")) WITH CHECK ("public"."user_has_tenant_access"("tenant_id"));



CREATE POLICY "Tenant isolation for warehouses" ON "public"."tenant_warehouses" USING (("tenant_id" IN ( SELECT "tm"."tenant_id"
   FROM "public"."tenant_members" "tm"
  WHERE ("tm"."user_id" = "auth"."uid"())))) WITH CHECK (("tenant_id" IN ( SELECT "tm"."tenant_id"
   FROM "public"."tenant_members" "tm"
  WHERE ("tm"."user_id" = "auth"."uid"()))));



CREATE POLICY "Tenant isolation: activity_log INSERT" ON "public"."activity_log" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: activity_log SELECT" ON "public"."activity_log" FOR SELECT TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: ai_usage_log SELECT" ON "public"."ai_usage_log" FOR SELECT TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: client_locations DELETE" ON "public"."client_locations" FOR DELETE TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: client_locations INSERT" ON "public"."client_locations" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: client_locations SELECT" ON "public"."client_locations" FOR SELECT TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: client_locations UPDATE" ON "public"."client_locations" FOR UPDATE TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: client_rates DELETE" ON "public"."client_rates" FOR DELETE TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: client_rates INSERT" ON "public"."client_rates" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: client_rates SELECT" ON "public"."client_rates" FOR SELECT TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: client_rates UPDATE" ON "public"."client_rates" FOR UPDATE TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: clients DELETE" ON "public"."clients" FOR DELETE TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: clients INSERT" ON "public"."clients" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: clients SELECT" ON "public"."clients" FOR SELECT TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: clients UPDATE" ON "public"."clients" FOR UPDATE TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: cost_types DELETE" ON "public"."cost_types" FOR DELETE TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "Tenant isolation: cost_types INSERT" ON "public"."cost_types" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "Tenant isolation: cost_types SELECT" ON "public"."cost_types" FOR SELECT TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "Tenant isolation: cost_types UPDATE" ON "public"."cost_types" FOR UPDATE TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"())) WITH CHECK (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "Tenant isolation: drivers DELETE" ON "public"."drivers" FOR DELETE TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: drivers INSERT" ON "public"."drivers" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: drivers SELECT" ON "public"."drivers" FOR SELECT TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: drivers UPDATE" ON "public"."drivers" FOR UPDATE TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: extraction_templates ALL" ON "public"."client_extraction_templates" TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id"))) WITH CHECK (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: extraction_templates SELECT" ON "public"."client_extraction_templates" FOR SELECT TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: loading_units ALL" ON "public"."loading_units" TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id"))) WITH CHECK (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: loading_units SELECT" ON "public"."loading_units" FOR SELECT TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: notifications DELETE" ON "public"."notifications" FOR DELETE TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: notifications INSERT" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: notifications SELECT" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: notifications UPDATE" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: orders DELETE" ON "public"."orders" FOR DELETE TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: orders INSERT" ON "public"."orders" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: orders SELECT" ON "public"."orders" FOR SELECT TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: orders UPDATE" ON "public"."orders" FOR UPDATE TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: requirement_types ALL" ON "public"."requirement_types" TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id"))) WITH CHECK (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: requirement_types SELECT" ON "public"."requirement_types" FOR SELECT TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: tenant_inbox_audit SELECT" ON "public"."tenant_inbox_audit" FOR SELECT TO "authenticated" USING ("public"."user_has_tenant_access"("tenant_id"));



CREATE POLICY "Tenant isolation: tenant_inboxes ALL" ON "public"."tenant_inboxes" TO "authenticated" USING ("public"."user_has_tenant_access"("tenant_id")) WITH CHECK ("public"."user_has_tenant_access"("tenant_id"));



CREATE POLICY "Tenant isolation: trip_costs DELETE" ON "public"."trip_costs" FOR DELETE TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "Tenant isolation: trip_costs INSERT" ON "public"."trip_costs" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "Tenant isolation: trip_costs SELECT" ON "public"."trip_costs" FOR SELECT TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "Tenant isolation: trip_costs UPDATE" ON "public"."trip_costs" FOR UPDATE TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"())) WITH CHECK (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "Tenant isolation: vehicle_availability DELETE" ON "public"."vehicle_availability" FOR DELETE TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: vehicle_availability INSERT" ON "public"."vehicle_availability" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: vehicle_availability SELECT" ON "public"."vehicle_availability" FOR SELECT TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: vehicle_availability UPDATE" ON "public"."vehicle_availability" FOR UPDATE TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: vehicle_documents DELETE" ON "public"."vehicle_documents" FOR DELETE TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: vehicle_documents INSERT" ON "public"."vehicle_documents" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: vehicle_documents SELECT" ON "public"."vehicle_documents" FOR SELECT TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: vehicle_documents UPDATE" ON "public"."vehicle_documents" FOR UPDATE TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: vehicle_fixed_costs DELETE" ON "public"."vehicle_fixed_costs" FOR DELETE TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "Tenant isolation: vehicle_fixed_costs INSERT" ON "public"."vehicle_fixed_costs" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "Tenant isolation: vehicle_fixed_costs SELECT" ON "public"."vehicle_fixed_costs" FOR SELECT TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "Tenant isolation: vehicle_fixed_costs UPDATE" ON "public"."vehicle_fixed_costs" FOR UPDATE TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"())) WITH CHECK (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "Tenant isolation: vehicle_maintenance DELETE" ON "public"."vehicle_maintenance" FOR DELETE TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: vehicle_maintenance INSERT" ON "public"."vehicle_maintenance" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: vehicle_maintenance SELECT" ON "public"."vehicle_maintenance" FOR SELECT TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: vehicle_maintenance UPDATE" ON "public"."vehicle_maintenance" FOR UPDATE TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: vehicle_types ALL" ON "public"."vehicle_types" TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id"))) WITH CHECK (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: vehicle_types SELECT" ON "public"."vehicle_types" FOR SELECT TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: vehicles DELETE" ON "public"."vehicles" FOR DELETE TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: vehicles INSERT" ON "public"."vehicles" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: vehicles SELECT" ON "public"."vehicles" FOR SELECT TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Tenant isolation: vehicles UPDATE" ON "public"."vehicles" FOR UPDATE TO "authenticated" USING (("tenant_id" = ( SELECT "public"."current_tenant_id"() AS "current_tenant_id")));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users read/write own note-reads" ON "public"."order_note_reads" USING (("user_id" = "auth"."uid"())) WITH CHECK ((("user_id" = "auth"."uid"()) AND ("tenant_id" IN ( SELECT "tm"."tenant_id"
   FROM "public"."tenant_members" "tm"
  WHERE ("tm"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."activity_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_corrections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_corrections_service_role" ON "public"."ai_corrections" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "ai_corrections_tenant_delete" ON "public"."ai_corrections" FOR DELETE TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "ai_corrections_tenant_insert" ON "public"."ai_corrections" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "ai_corrections_tenant_select" ON "public"."ai_corrections" FOR SELECT TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "ai_corrections_tenant_update" ON "public"."ai_corrections" FOR UPDATE TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



ALTER TABLE "public"."ai_decisions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_usage_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."anomalies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_log_admin_select" ON "public"."audit_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"public"."app_role")))));



CREATE POLICY "audit_log_service_role" ON "public"."audit_log" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "audit_log_tenant_insert" ON "public"."audit_log" FOR INSERT TO "authenticated" WITH CHECK ((("tenant_id" = "public"."get_user_tenant_id"()) OR ("tenant_id" IS NULL)));



CREATE POLICY "audit_log_tenant_select" ON "public"."audit_log" FOR SELECT TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



ALTER TABLE "public"."client_contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_extraction_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_portal_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "client_portal_users_own_select" ON "public"."client_portal_users" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "client_portal_users_service_role" ON "public"."client_portal_users" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "client_portal_users_tenant_delete" ON "public"."client_portal_users" FOR DELETE TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "client_portal_users_tenant_insert" ON "public"."client_portal_users" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "client_portal_users_tenant_select" ON "public"."client_portal_users" FOR SELECT TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "client_portal_users_tenant_update" ON "public"."client_portal_users" FOR UPDATE TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



ALTER TABLE "public"."client_rates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."confidence_metrics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."consolidation_groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "consolidation_groups_delete" ON "public"."consolidation_groups" FOR DELETE TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "consolidation_groups_insert" ON "public"."consolidation_groups" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "consolidation_groups_select" ON "public"."consolidation_groups" FOR SELECT TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "consolidation_groups_service" ON "public"."consolidation_groups" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "consolidation_groups_update" ON "public"."consolidation_groups" FOR UPDATE TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



ALTER TABLE "public"."consolidation_orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "consolidation_orders_delete" ON "public"."consolidation_orders" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."consolidation_groups" "g"
  WHERE (("g"."id" = "consolidation_orders"."group_id") AND ("g"."tenant_id" = "public"."get_user_tenant_id"())))));



CREATE POLICY "consolidation_orders_insert" ON "public"."consolidation_orders" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."consolidation_groups" "g"
  WHERE (("g"."id" = "consolidation_orders"."group_id") AND ("g"."tenant_id" = "public"."get_user_tenant_id"())))));



CREATE POLICY "consolidation_orders_select" ON "public"."consolidation_orders" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."consolidation_groups" "g"
  WHERE (("g"."id" = "consolidation_orders"."group_id") AND ("g"."tenant_id" = "public"."get_user_tenant_id"())))));



CREATE POLICY "consolidation_orders_service" ON "public"."consolidation_orders" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "consolidation_orders_update" ON "public"."consolidation_orders" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."consolidation_groups" "g"
  WHERE (("g"."id" = "consolidation_orders"."group_id") AND ("g"."tenant_id" = "public"."get_user_tenant_id"())))));



ALTER TABLE "public"."cost_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_exceptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delivery_exceptions_service_role" ON "public"."delivery_exceptions" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."departments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dex_all" ON "public"."delivery_exceptions" USING (true) WITH CHECK (true);



ALTER TABLE "public"."disruptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."driver_positions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "driver_positions_service_role" ON "public"."driver_positions" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "driver_positions_tenant_delete" ON "public"."driver_positions" FOR DELETE TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "driver_positions_tenant_insert" ON "public"."driver_positions" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "driver_positions_tenant_select" ON "public"."driver_positions" FOR SELECT TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "driver_positions_tenant_update" ON "public"."driver_positions" FOR UPDATE TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



ALTER TABLE "public"."driver_time_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "driver_time_entries_service_role" ON "public"."driver_time_entries" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "driver_time_entries_tenant_delete" ON "public"."driver_time_entries" FOR DELETE TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "driver_time_entries_tenant_insert" ON "public"."driver_time_entries" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "driver_time_entries_tenant_select" ON "public"."driver_time_entries" FOR SELECT TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "driver_time_entries_tenant_update" ON "public"."driver_time_entries" FOR UPDATE TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



ALTER TABLE "public"."drivers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."earnings_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoice_lines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoices_portal_user_select" ON "public"."invoices" FOR SELECT TO "authenticated" USING (("client_id" IN ( SELECT "cpu"."client_id"
   FROM "public"."client_portal_users" "cpu"
  WHERE (("cpu"."user_id" = "auth"."uid"()) AND ("cpu"."is_active" = true)))));



ALTER TABLE "public"."loading_units" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."location_time_windows" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "location_time_windows_delete" ON "public"."location_time_windows" FOR DELETE TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "location_time_windows_insert" ON "public"."location_time_windows" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "location_time_windows_select" ON "public"."location_time_windows" FOR SELECT TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "location_time_windows_service" ON "public"."location_time_windows" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "location_time_windows_update" ON "public"."location_time_windows" FOR UPDATE TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



ALTER TABLE "public"."notification_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_log_portal_select" ON "public"."notification_log" FOR SELECT TO "authenticated" USING (("order_id" IN ( SELECT "o"."id"
   FROM "public"."orders" "o"
  WHERE ("o"."client_id" IN ( SELECT "cpu"."client_id"
           FROM "public"."client_portal_users" "cpu"
          WHERE (("cpu"."user_id" = "auth"."uid"()) AND ("cpu"."is_active" = true)))))));



CREATE POLICY "notification_log_service_role" ON "public"."notification_log" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "notification_log_tenant_insert" ON "public"."notification_log" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "notification_log_tenant_select" ON "public"."notification_log" FOR SELECT TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



ALTER TABLE "public"."notification_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_templates_service_role" ON "public"."notification_templates" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "notification_templates_tenant_delete" ON "public"."notification_templates" FOR DELETE TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "notification_templates_tenant_insert" ON "public"."notification_templates" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "notification_templates_tenant_select" ON "public"."notification_templates" FOR SELECT TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "notification_templates_tenant_update" ON "public"."notification_templates" FOR UPDATE TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_tenant_select" ON "public"."notifications" FOR SELECT USING ((("tenant_id" = "public"."get_user_tenant_id"()) OR ("tenant_id" IS NULL) OR ("user_id" = "auth"."uid"())));



ALTER TABLE "public"."order_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_info_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_note_reads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "orders_portal_user_insert" ON "public"."orders" FOR INSERT TO "authenticated" WITH CHECK ((("source" = 'PORTAL'::"text") AND ("status" = 'DRAFT'::"text") AND ("client_id" IN ( SELECT "cpu"."client_id"
   FROM "public"."client_portal_users" "cpu"
  WHERE (("cpu"."user_id" = "auth"."uid"()) AND ("cpu"."is_active" = true) AND ("cpu"."portal_role" = ANY (ARRAY['editor'::"text", 'admin'::"text"])))))));



CREATE POLICY "orders_portal_user_select" ON "public"."orders" FOR SELECT TO "authenticated" USING (("client_id" IN ( SELECT "cpu"."client_id"
   FROM "public"."client_portal_users" "cpu"
  WHERE (("cpu"."user_id" = "auth"."uid"()) AND ("cpu"."is_active" = true)))));



ALTER TABLE "public"."packaging_movements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "packaging_movements_service_role" ON "public"."packaging_movements" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "packaging_movements_tenant_delete" ON "public"."packaging_movements" FOR DELETE TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "packaging_movements_tenant_insert" ON "public"."packaging_movements" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "packaging_movements_tenant_select" ON "public"."packaging_movements" FOR SELECT TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "packaging_movements_tenant_update" ON "public"."packaging_movements" FOR UPDATE TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_tenant_select" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("tenant_id" = "public"."get_user_tenant_id"()) OR ("tenant_id" IS NULL) OR ("id" = "auth"."uid"())));



ALTER TABLE "public"."proof_of_delivery" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "proof_of_delivery_service_role" ON "public"."proof_of_delivery" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."rate_cards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rate_cards_service_role" ON "public"."rate_cards" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "rate_cards_tenant_delete" ON "public"."rate_cards" FOR DELETE TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "rate_cards_tenant_insert" ON "public"."rate_cards" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "rate_cards_tenant_select" ON "public"."rate_cards" FOR SELECT TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "rate_cards_tenant_update" ON "public"."rate_cards" FOR UPDATE TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



ALTER TABLE "public"."rate_limit_counters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rate_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rate_rules_service_role" ON "public"."rate_rules" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "rate_rules_tenant_delete" ON "public"."rate_rules" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."rate_cards" "rc"
  WHERE (("rc"."id" = "rate_rules"."rate_card_id") AND ("rc"."tenant_id" = "public"."get_user_tenant_id"())))));



CREATE POLICY "rate_rules_tenant_insert" ON "public"."rate_rules" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."rate_cards" "rc"
  WHERE (("rc"."id" = "rate_rules"."rate_card_id") AND ("rc"."tenant_id" = "public"."get_user_tenant_id"())))));



CREATE POLICY "rate_rules_tenant_select" ON "public"."rate_rules" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."rate_cards" "rc"
  WHERE (("rc"."id" = "rate_rules"."rate_card_id") AND ("rc"."tenant_id" = "public"."get_user_tenant_id"())))));



CREATE POLICY "rate_rules_tenant_update" ON "public"."rate_rules" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."rate_cards" "rc"
  WHERE (("rc"."id" = "rate_rules"."rate_card_id") AND ("rc"."tenant_id" = "public"."get_user_tenant_id"())))));



ALTER TABLE "public"."replan_suggestions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."requirement_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shipments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."slot_bookings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "slot_bookings_delete" ON "public"."slot_bookings" FOR DELETE TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "slot_bookings_insert" ON "public"."slot_bookings" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "slot_bookings_select" ON "public"."slot_bookings" FOR SELECT TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "slot_bookings_service" ON "public"."slot_bookings" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "slot_bookings_update" ON "public"."slot_bookings" FOR UPDATE TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



ALTER TABLE "public"."surcharges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "surcharges_service_role" ON "public"."surcharges" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "surcharges_tenant_delete" ON "public"."surcharges" FOR DELETE TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "surcharges_tenant_insert" ON "public"."surcharges" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "surcharges_tenant_select" ON "public"."surcharges" FOR SELECT TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "surcharges_tenant_update" ON "public"."surcharges" FOR UPDATE TO "authenticated" USING (("tenant_id" = "public"."get_user_tenant_id"()));



ALTER TABLE "public"."tenant_inbox_audit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenant_inboxes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_insert_pod" ON "public"."proof_of_delivery" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."trip_stops" "ts"
     JOIN "public"."trips" "t" ON (("t"."id" = "ts"."trip_id")))
  WHERE (("ts"."id" = "proof_of_delivery"."trip_stop_id") AND ("t"."tenant_id" = "public"."current_tenant_id"())))));



ALTER TABLE "public"."tenant_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_read_pod" ON "public"."proof_of_delivery" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."trip_stops" "ts"
     JOIN "public"."trips" "t" ON (("t"."id" = "ts"."trip_id")))
  WHERE (("ts"."id" = "proof_of_delivery"."trip_stop_id") AND ("t"."tenant_id" = "public"."current_tenant_id"())))));



CREATE POLICY "tenant_update_pod" ON "public"."proof_of_delivery" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."trip_stops" "ts"
     JOIN "public"."trips" "t" ON (("t"."id" = "ts"."trip_id")))
  WHERE (("ts"."id" = "proof_of_delivery"."trip_stop_id") AND ("t"."tenant_id" = "public"."current_tenant_id"())))));



ALTER TABLE "public"."tenant_warehouses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."traject_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_costs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_stops" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trip_stops_all" ON "public"."trip_stops" USING (true) WITH CHECK (true);



CREATE POLICY "trip_stops_service_role" ON "public"."trip_stops" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."trips" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trips_all" ON "public"."trips" USING (true) WITH CHECK (true);



CREATE POLICY "trips_portal_user_select" ON "public"."trips" FOR SELECT TO "authenticated" USING (("id" IN ( SELECT "ts"."trip_id"
   FROM ("public"."trip_stops" "ts"
     JOIN "public"."orders" "o" ON (("o"."id" = "ts"."order_id")))
  WHERE ("o"."client_id" IN ( SELECT "cpu"."client_id"
           FROM "public"."client_portal_users" "cpu"
          WHERE (("cpu"."user_id" = "auth"."uid"()) AND ("cpu"."is_active" = true)))))));



CREATE POLICY "trips_service_role" ON "public"."trips" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_roles_tenant_select" ON "public"."user_roles" FOR SELECT TO "authenticated" USING ((("user_id" IN ( SELECT "tm"."user_id"
   FROM "public"."tenant_members" "tm"
  WHERE ("tm"."tenant_id" = "public"."get_user_tenant_id"()))) OR ("user_id" = "auth"."uid"())));



ALTER TABLE "public"."vehicle_availability" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicle_check_photos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicle_check_retention_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicle_checks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicle_damage_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicle_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicle_fixed_costs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicle_maintenance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicle_positions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicle_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vehicles_tenant_insert" ON "public"."vehicles" FOR INSERT WITH CHECK (("tenant_id" = "public"."get_user_tenant_id"()));



CREATE POLICY "vehicles_tenant_select" ON "public"."vehicles" FOR SELECT USING ((("tenant_id" = "public"."get_user_tenant_id"()) OR ("tenant_id" IS NULL)));



CREATE POLICY "vehicles_tenant_update" ON "public"."vehicles" FOR UPDATE USING ((("tenant_id" = "public"."get_user_tenant_id"()) OR ("tenant_id" IS NULL)));



ALTER TABLE "public"."webhook_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "webhook_tenant_all" ON "public"."webhook_subscriptions" USING (("tenant_id" = "public"."get_user_tenant_id"()));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."assign_shipment_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."assign_shipment_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_shipment_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_trigger_func"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_trigger_func"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_trigger_func"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_tenant_inbox_secret"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_tenant_inbox_secret"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_tenant_inbox_secret"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_tenant_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_tenant_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_tenant_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."dispatch_notification"("p_trigger_event" "text", "p_tenant_id" "uuid", "p_order_id" "uuid", "p_trip_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."dispatch_notification"("p_trigger_event" "text", "p_tenant_id" "uuid", "p_order_id" "uuid", "p_trip_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dispatch_notification"("p_trigger_event" "text", "p_tenant_id" "uuid", "p_order_id" "uuid", "p_trip_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."driver_gate_passed"("p_driver_id" "uuid", "p_vehicle_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."driver_gate_passed"("p_driver_id" "uuid", "p_vehicle_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."driver_gate_passed"("p_driver_id" "uuid", "p_vehicle_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_department_on_transition"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_department_on_transition"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_department_on_transition"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_tenant_inbox_password"("p_inbox_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_tenant_inbox_password"("p_inbox_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_tenant_inbox_password"("p_inbox_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tenant_inbox_password"("p_inbox_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_tenant_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_tenant_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_tenant_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "anon";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "service_role";



REVOKE ALL ON FUNCTION "public"."increment_rate_limit"("p_key" "text", "p_limit" integer, "p_window_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_rate_limit"("p_key" "text", "p_limit" integer, "p_window_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_rate_limit"("p_key" "text", "p_limit" integer, "p_window_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_rate_limit"("p_key" "text", "p_limit" integer, "p_window_seconds" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."info_tracking_tick"() TO "anon";
GRANT ALL ON FUNCTION "public"."info_tracking_tick"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."info_tracking_tick"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_new_damage"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_new_damage"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_new_damage"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prune_vehicle_check_photos"("days_threshold" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prune_vehicle_check_photos"("days_threshold" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."prune_vehicle_check_photos"("days_threshold" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."prune_vehicle_check_photos"("days_threshold" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_order_info_status"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_order_info_status"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_order_info_status"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."seed_default_cost_types"("p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."seed_default_cost_types"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."seed_default_cost_types"("p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."seed_tenant_defaults"() TO "anon";
GRANT ALL ON FUNCTION "public"."seed_tenant_defaults"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."seed_tenant_defaults"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_tenant_inbox_password"("p_inbox_id" "uuid", "p_password" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_tenant_inbox_password"("p_inbox_id" "uuid", "p_password" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_tenant_inbox_password"("p_inbox_id" "uuid", "p_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_tenant_inbox_password"("p_inbox_id" "uuid", "p_password" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sweep_overdue_info_requests"() TO "anon";
GRANT ALL ON FUNCTION "public"."sweep_overdue_info_requests"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sweep_overdue_info_requests"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_notify_delivered"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_notify_delivered"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_notify_delivered"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_notify_driver_arrived"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_notify_driver_arrived"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_notify_driver_arrived"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_notify_exception"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_notify_exception"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_notify_exception"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_notify_order_confirmed"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_notify_order_confirmed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_notify_order_confirmed"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_notify_trip_started"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_notify_trip_started"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_notify_trip_started"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_order_info_requests_sync"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_order_info_requests_sync"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_order_info_requests_sync"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_orders_notes_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_orders_notes_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_orders_notes_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_shipments_notes_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_shipments_notes_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_shipments_notes_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."user_has_tenant_access"("p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."user_has_tenant_access"("p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_has_tenant_access"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_has_tenant_access"("p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_order_status_transition"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_order_status_transition"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_order_status_transition"() TO "service_role";



GRANT ALL ON TABLE "public"."activity_log" TO "anon";
GRANT ALL ON TABLE "public"."activity_log" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_log" TO "service_role";



GRANT ALL ON TABLE "public"."ai_corrections" TO "anon";
GRANT ALL ON TABLE "public"."ai_corrections" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_corrections" TO "service_role";



GRANT ALL ON TABLE "public"."ai_decisions" TO "anon";
GRANT ALL ON TABLE "public"."ai_decisions" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_decisions" TO "service_role";



GRANT ALL ON TABLE "public"."ai_usage_log" TO "anon";
GRANT ALL ON TABLE "public"."ai_usage_log" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_usage_log" TO "service_role";



GRANT ALL ON TABLE "public"."anomalies" TO "anon";
GRANT ALL ON TABLE "public"."anomalies" TO "authenticated";
GRANT ALL ON TABLE "public"."anomalies" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."client_contacts" TO "anon";
GRANT ALL ON TABLE "public"."client_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."client_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."client_extraction_templates" TO "anon";
GRANT ALL ON TABLE "public"."client_extraction_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."client_extraction_templates" TO "service_role";



GRANT ALL ON TABLE "public"."client_locations" TO "anon";
GRANT ALL ON TABLE "public"."client_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."client_locations" TO "service_role";



GRANT ALL ON TABLE "public"."client_portal_users" TO "anon";
GRANT ALL ON TABLE "public"."client_portal_users" TO "authenticated";
GRANT ALL ON TABLE "public"."client_portal_users" TO "service_role";



GRANT ALL ON TABLE "public"."client_rates" TO "anon";
GRANT ALL ON TABLE "public"."client_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."client_rates" TO "service_role";



GRANT ALL ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT ALL ON TABLE "public"."confidence_metrics" TO "anon";
GRANT ALL ON TABLE "public"."confidence_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."confidence_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."consolidation_groups" TO "anon";
GRANT ALL ON TABLE "public"."consolidation_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."consolidation_groups" TO "service_role";



GRANT ALL ON TABLE "public"."consolidation_orders" TO "anon";
GRANT ALL ON TABLE "public"."consolidation_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."consolidation_orders" TO "service_role";



GRANT ALL ON TABLE "public"."cost_types" TO "anon";
GRANT ALL ON TABLE "public"."cost_types" TO "authenticated";
GRANT ALL ON TABLE "public"."cost_types" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_exceptions" TO "anon";
GRANT ALL ON TABLE "public"."delivery_exceptions" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_exceptions" TO "service_role";



GRANT ALL ON TABLE "public"."departments" TO "anon";
GRANT ALL ON TABLE "public"."departments" TO "authenticated";
GRANT ALL ON TABLE "public"."departments" TO "service_role";



GRANT ALL ON TABLE "public"."disruptions" TO "anon";
GRANT ALL ON TABLE "public"."disruptions" TO "authenticated";
GRANT ALL ON TABLE "public"."disruptions" TO "service_role";



GRANT ALL ON TABLE "public"."driver_positions" TO "anon";
GRANT ALL ON TABLE "public"."driver_positions" TO "authenticated";
GRANT ALL ON TABLE "public"."driver_positions" TO "service_role";



GRANT ALL ON TABLE "public"."driver_time_entries" TO "anon";
GRANT ALL ON TABLE "public"."driver_time_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."driver_time_entries" TO "service_role";



GRANT ALL ON TABLE "public"."drivers" TO "anon";
GRANT ALL ON TABLE "public"."drivers" TO "authenticated";
GRANT ALL ON TABLE "public"."drivers" TO "service_role";



GRANT ALL ON TABLE "public"."earnings_events" TO "anon";
GRANT ALL ON TABLE "public"."earnings_events" TO "authenticated";
GRANT ALL ON TABLE "public"."earnings_events" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_lines" TO "anon";
GRANT ALL ON TABLE "public"."invoice_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_lines" TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT ALL ON TABLE "public"."loading_units" TO "anon";
GRANT ALL ON TABLE "public"."loading_units" TO "authenticated";
GRANT ALL ON TABLE "public"."loading_units" TO "service_role";



GRANT ALL ON TABLE "public"."location_time_windows" TO "anon";
GRANT ALL ON TABLE "public"."location_time_windows" TO "authenticated";
GRANT ALL ON TABLE "public"."location_time_windows" TO "service_role";



GRANT ALL ON TABLE "public"."notification_log" TO "anon";
GRANT ALL ON TABLE "public"."notification_log" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_log" TO "service_role";



GRANT ALL ON TABLE "public"."notification_templates" TO "anon";
GRANT ALL ON TABLE "public"."notification_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_templates" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."order_events" TO "anon";
GRANT ALL ON TABLE "public"."order_events" TO "authenticated";
GRANT ALL ON TABLE "public"."order_events" TO "service_role";



GRANT ALL ON TABLE "public"."order_info_requests" TO "anon";
GRANT ALL ON TABLE "public"."order_info_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."order_info_requests" TO "service_role";



GRANT ALL ON TABLE "public"."order_note_reads" TO "anon";
GRANT ALL ON TABLE "public"."order_note_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."order_note_reads" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON SEQUENCE "public"."orders_order_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."orders_order_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."orders_order_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."packaging_movements" TO "anon";
GRANT ALL ON TABLE "public"."packaging_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."packaging_movements" TO "service_role";



GRANT ALL ON TABLE "public"."packaging_balances" TO "anon";
GRANT ALL ON TABLE "public"."packaging_balances" TO "authenticated";
GRANT ALL ON TABLE "public"."packaging_balances" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."proof_of_delivery" TO "anon";
GRANT ALL ON TABLE "public"."proof_of_delivery" TO "authenticated";
GRANT ALL ON TABLE "public"."proof_of_delivery" TO "service_role";



GRANT ALL ON TABLE "public"."rate_cards" TO "anon";
GRANT ALL ON TABLE "public"."rate_cards" TO "authenticated";
GRANT ALL ON TABLE "public"."rate_cards" TO "service_role";



GRANT ALL ON TABLE "public"."rate_limit_counters" TO "anon";
GRANT ALL ON TABLE "public"."rate_limit_counters" TO "authenticated";
GRANT ALL ON TABLE "public"."rate_limit_counters" TO "service_role";



GRANT ALL ON TABLE "public"."rate_rules" TO "anon";
GRANT ALL ON TABLE "public"."rate_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."rate_rules" TO "service_role";



GRANT ALL ON TABLE "public"."replan_suggestions" TO "anon";
GRANT ALL ON TABLE "public"."replan_suggestions" TO "authenticated";
GRANT ALL ON TABLE "public"."replan_suggestions" TO "service_role";



GRANT ALL ON TABLE "public"."requirement_types" TO "anon";
GRANT ALL ON TABLE "public"."requirement_types" TO "authenticated";
GRANT ALL ON TABLE "public"."requirement_types" TO "service_role";



GRANT ALL ON TABLE "public"."shipments" TO "anon";
GRANT ALL ON TABLE "public"."shipments" TO "authenticated";
GRANT ALL ON TABLE "public"."shipments" TO "service_role";



GRANT ALL ON TABLE "public"."slot_bookings" TO "anon";
GRANT ALL ON TABLE "public"."slot_bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."slot_bookings" TO "service_role";



GRANT ALL ON TABLE "public"."surcharges" TO "anon";
GRANT ALL ON TABLE "public"."surcharges" TO "authenticated";
GRANT ALL ON TABLE "public"."surcharges" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_inbox_audit" TO "anon";
GRANT ALL ON TABLE "public"."tenant_inbox_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_inbox_audit" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_inboxes" TO "anon";
GRANT ALL ON TABLE "public"."tenant_inboxes" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_inboxes" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_members" TO "anon";
GRANT ALL ON TABLE "public"."tenant_members" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_members" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_warehouses" TO "anon";
GRANT ALL ON TABLE "public"."tenant_warehouses" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_warehouses" TO "service_role";



GRANT ALL ON TABLE "public"."tenants" TO "anon";
GRANT ALL ON TABLE "public"."tenants" TO "authenticated";
GRANT ALL ON TABLE "public"."tenants" TO "service_role";



GRANT ALL ON TABLE "public"."traject_rules" TO "anon";
GRANT ALL ON TABLE "public"."traject_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."traject_rules" TO "service_role";



GRANT ALL ON TABLE "public"."trip_costs" TO "anon";
GRANT ALL ON TABLE "public"."trip_costs" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_costs" TO "service_role";



GRANT ALL ON TABLE "public"."trip_stops" TO "anon";
GRANT ALL ON TABLE "public"."trip_stops" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_stops" TO "service_role";



GRANT ALL ON TABLE "public"."trips" TO "anon";
GRANT ALL ON TABLE "public"."trips" TO "authenticated";
GRANT ALL ON TABLE "public"."trips" TO "service_role";



GRANT ALL ON SEQUENCE "public"."trips_trip_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."trips_trip_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."trips_trip_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_availability" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_availability" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_availability" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_check_photos" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_check_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_check_photos" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_checks" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_checks" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_checks" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_damage_events" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_damage_events" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_damage_events" TO "service_role";



GRANT ALL ON TABLE "public"."vehicles" TO "anon";
GRANT ALL ON TABLE "public"."vehicles" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicles" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_check_release_audit" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_check_release_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_check_release_audit" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_check_retention_log" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_check_retention_log" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_check_retention_log" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_documents" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_documents" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_fixed_costs" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_fixed_costs" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_fixed_costs" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_maintenance" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_maintenance" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_maintenance" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_positions" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_positions" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_positions" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_types" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_types" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_types" TO "service_role";



GRANT ALL ON TABLE "public"."webhook_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."webhook_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_subscriptions" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







