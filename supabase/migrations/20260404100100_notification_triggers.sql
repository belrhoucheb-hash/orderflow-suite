-- ============================================================
-- Feature 6: Notification auto-dispatch triggers
-- Fires send-notification Edge Function on order/trip events
-- ============================================================

-- ─── Helper: invoke send-notification via pg_net ─────────────
-- Uses pg_net extension (available in Supabase) for async HTTP calls
CREATE OR REPLACE FUNCTION public.dispatch_notification(
  p_trigger_event TEXT,
  p_tenant_id UUID,
  p_order_id UUID DEFAULT NULL,
  p_trip_id UUID DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
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

-- ─── Trigger: ORDER_CONFIRMED ────────────────────────────────
-- Fires when order status changes to PENDING (confirmed by planner)
CREATE OR REPLACE FUNCTION public.trg_notify_order_confirmed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'PENDING' AND (OLD.status IS DISTINCT FROM 'PENDING') AND NEW.tenant_id IS NOT NULL THEN
    PERFORM public.dispatch_notification('ORDER_CONFIRMED', NEW.tenant_id, NEW.id, NULL);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_order_confirmed ON public.orders;
CREATE TRIGGER trg_notify_order_confirmed
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notify_order_confirmed();

-- ─── Trigger: TRIP_STARTED ───────────────────────────────────
-- Fires when trip status changes to IN_TRANSIT
CREATE OR REPLACE FUNCTION public.trg_notify_trip_started()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'IN_TRANSIT' AND (OLD.status IS DISTINCT FROM 'IN_TRANSIT') AND NEW.tenant_id IS NOT NULL THEN
    PERFORM public.dispatch_notification('TRIP_STARTED', NEW.tenant_id, NULL, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_trip_started ON public.trips;
CREATE TRIGGER trg_notify_trip_started
  AFTER UPDATE OF status ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notify_trip_started();

-- ─── Trigger: DELIVERED ──────────────────────────────────────
-- Fires when trip status changes to COMPLETED
CREATE OR REPLACE FUNCTION public.trg_notify_delivered()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'COMPLETED' AND (OLD.status IS DISTINCT FROM 'COMPLETED') AND NEW.tenant_id IS NOT NULL THEN
    PERFORM public.dispatch_notification('DELIVERED', NEW.tenant_id, NULL, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_delivered ON public.trips;
CREATE TRIGGER trg_notify_delivered
  AFTER UPDATE OF status ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notify_delivered();

-- ─── Trigger: EXCEPTION ──────────────────────────────────────
-- Fires when order status changes to EXCEPTION or CANCELLED
CREATE OR REPLACE FUNCTION public.trg_notify_exception()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status IN ('EXCEPTION', 'CANCELLED') AND (OLD.status IS DISTINCT FROM NEW.status) AND NEW.tenant_id IS NOT NULL THEN
    PERFORM public.dispatch_notification('EXCEPTION', NEW.tenant_id, NEW.id, NULL);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_exception ON public.orders;
CREATE TRIGGER trg_notify_exception
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notify_exception();

-- ─── Trigger: DRIVER_ARRIVED ─────────────────────────────────
-- Fires when a trip_stop status changes to ARRIVED
CREATE OR REPLACE FUNCTION public.trg_notify_driver_arrived()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  IF NEW.status = 'ARRIVED' AND (OLD.status IS DISTINCT FROM 'ARRIVED') THEN
    SELECT tenant_id INTO v_tenant_id FROM public.trips WHERE id = NEW.trip_id;
    IF v_tenant_id IS NOT NULL THEN
      PERFORM public.dispatch_notification('DRIVER_ARRIVED', v_tenant_id, NEW.order_id, NEW.trip_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_driver_arrived ON public.trip_stops;
CREATE TRIGGER trg_notify_driver_arrived
  AFTER UPDATE OF status ON public.trip_stops
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notify_driver_arrived();

-- Note: ETA_CHANGED trigger should be implemented at the application level
-- (in the driver position update logic) since it requires comparing old vs new ETA
-- with a >15 minute threshold. This is handled in the driver app / position update hook.
