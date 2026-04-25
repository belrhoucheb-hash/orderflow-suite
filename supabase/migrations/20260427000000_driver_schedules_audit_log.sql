-- Sprint 7 follow-up. Audit-log op driver_schedules.
--
-- Bij verlof- of rooster-discussies wil je terug kunnen zien wie wat
-- wanneer wijzigde. Triggert per INSERT/UPDATE/DELETE één rij op
-- public.activity_log met entity_type='driver_schedule'.
--
-- Geen gevoelige velden te redacten (geen BSN/IBAN), dus de hele
-- diff kan in changes opgeslagen worden.

CREATE OR REPLACE FUNCTION public.log_driver_schedule_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id  uuid;
  v_entity_id  uuid;
  v_user_id    uuid := auth.uid();
  v_action     text;
  v_changes    jsonb := '{}'::jsonb;
  v_old_row    jsonb;
  v_new_row    jsonb;
  v_key        text;
  v_old_val    jsonb;
  v_new_val    jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action    := 'create';
    v_tenant_id := NEW.tenant_id;
    v_entity_id := NEW.id;
    v_changes   := jsonb_build_object('new', to_jsonb(NEW));

  ELSIF TG_OP = 'UPDATE' THEN
    v_action    := 'update';
    v_tenant_id := NEW.tenant_id;
    v_entity_id := NEW.id;
    v_old_row   := to_jsonb(OLD);
    v_new_row   := to_jsonb(NEW);

    FOR v_key IN SELECT jsonb_object_keys(v_new_row) LOOP
      v_old_val := v_old_row -> v_key;
      v_new_val := v_new_row -> v_key;
      IF v_old_val IS DISTINCT FROM v_new_val THEN
        v_changes := v_changes || jsonb_build_object(
          v_key,
          jsonb_build_object('old', v_old_val, 'new', v_new_val)
        );
      END IF;
    END LOOP;

    IF v_changes = '{}'::jsonb THEN
      RETURN NEW;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    v_action    := 'delete';
    v_tenant_id := OLD.tenant_id;
    v_entity_id := OLD.id;
    v_changes   := jsonb_build_object('old', to_jsonb(OLD));
  END IF;

  INSERT INTO public.activity_log (
    tenant_id, user_id, entity_type, entity_id, action, changes
  ) VALUES (
    v_tenant_id, v_user_id, 'driver_schedule', v_entity_id, v_action, v_changes
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.log_driver_schedule_activity() IS
  'Trigger-functie die INSERT/UPDATE/DELETE op driver_schedules logt in activity_log voor audit-trail.';

DROP TRIGGER IF EXISTS driver_schedules_activity_log ON public.driver_schedules;
CREATE TRIGGER driver_schedules_activity_log
  AFTER INSERT OR UPDATE OR DELETE ON public.driver_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.log_driver_schedule_activity();

-- ─── ROLLBACK ──────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS driver_schedules_activity_log ON public.driver_schedules;
-- DROP FUNCTION IF EXISTS public.log_driver_schedule_activity();
