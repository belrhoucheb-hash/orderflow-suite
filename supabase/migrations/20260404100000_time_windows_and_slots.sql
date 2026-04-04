-- supabase/migrations/20260404100000_time_windows_and_slots.sql
-- ============================================================
-- Feature 1: Tijdvensters & Slotboeking
-- Creates location_time_windows, slot_bookings, alters trip_stops
-- ============================================================

-- ─── 1. Location Time Windows ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.location_time_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_location_id UUID NOT NULL REFERENCES public.client_locations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time TIME NOT NULL,
  close_time TIME NOT NULL,
  slot_duration_min INTEGER NOT NULL DEFAULT 30,
  max_concurrent_slots INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_time_range CHECK (close_time > open_time)
);

ALTER TABLE public.location_time_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "location_time_windows_select"
  ON public.location_time_windows FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "location_time_windows_insert"
  ON public.location_time_windows FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "location_time_windows_update"
  ON public.location_time_windows FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "location_time_windows_delete"
  ON public.location_time_windows FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "location_time_windows_service"
  ON public.location_time_windows FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_location_time_windows_updated_at
  BEFORE UPDATE ON public.location_time_windows
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ─── 2. Slot Bookings ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.slot_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_location_id UUID NOT NULL REFERENCES public.client_locations(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  trip_stop_id UUID REFERENCES public.trip_stops(id) ON DELETE SET NULL,
  slot_date DATE NOT NULL,
  slot_start TIME NOT NULL,
  slot_end TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'GEBOEKT'
    CHECK (status IN ('GEBOEKT','BEVESTIGD','GEANNULEERD','VERLOPEN')),
  booked_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_slot_range CHECK (slot_end > slot_start)
);

ALTER TABLE public.slot_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "slot_bookings_select"
  ON public.slot_bookings FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "slot_bookings_insert"
  ON public.slot_bookings FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "slot_bookings_update"
  ON public.slot_bookings FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "slot_bookings_delete"
  ON public.slot_bookings FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "slot_bookings_service"
  ON public.slot_bookings FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_slot_bookings_location_date
  ON public.slot_bookings (client_location_id, slot_date, status);

CREATE INDEX idx_slot_bookings_order
  ON public.slot_bookings (order_id);

CREATE INDEX IF NOT EXISTS idx_location_time_windows_location
  ON public.location_time_windows (client_location_id, day_of_week);

CREATE TRIGGER update_slot_bookings_updated_at
  BEFORE UPDATE ON public.slot_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ─── 3. Alter trip_stops ───────────────────────────────────
ALTER TABLE public.trip_stops
  ADD COLUMN IF NOT EXISTS planned_window_start TIME,
  ADD COLUMN IF NOT EXISTS planned_window_end TIME,
  ADD COLUMN IF NOT EXISTS waiting_time_min INTEGER,
  ADD COLUMN IF NOT EXISTS window_status TEXT DEFAULT 'ONBEKEND'
    CHECK (window_status IN ('ONBEKEND','OP_TIJD','TE_VROEG','TE_LAAT','GEMIST'));
