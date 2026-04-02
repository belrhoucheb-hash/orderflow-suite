-- ============================================================
-- Epic 1: Dispatch to Delivery
-- Creates trips, trip_stops, proof_of_delivery, delivery_exceptions
-- ============================================================

-- ─── 1. Trips ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  trip_number SERIAL,
  vehicle_id UUID NOT NULL,
  driver_id UUID,
  dispatch_status TEXT NOT NULL DEFAULT 'CONCEPT'
    CHECK (dispatch_status IN (
      'CONCEPT','VERZENDKLAAR','VERZONDEN','ONTVANGEN',
      'GEACCEPTEERD','GEWEIGERD','ACTIEF','VOLTOOID','AFGEBROKEN'
    )),
  planned_date DATE NOT NULL,
  planned_start_time TIME,
  actual_start_time TIMESTAMPTZ,
  actual_end_time TIMESTAMPTZ,
  total_distance_km NUMERIC(10,2),
  total_duration_min INTEGER,
  dispatcher_id UUID,
  dispatched_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 2. Trip Stops ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trip_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  order_id UUID,
  stop_type TEXT NOT NULL CHECK (stop_type IN ('PICKUP','DELIVERY','DEPOT')),
  stop_sequence INTEGER NOT NULL,
  stop_status TEXT NOT NULL DEFAULT 'GEPLAND'
    CHECK (stop_status IN (
      'GEPLAND','ONDERWEG','AANGEKOMEN','LADEN','LOSSEN',
      'AFGELEVERD','MISLUKT','OVERGESLAGEN'
    )),
  planned_address TEXT,
  planned_time TIMESTAMPTZ,
  actual_arrival_time TIMESTAMPTZ,
  actual_departure_time TIMESTAMPTZ,
  contact_name TEXT,
  contact_phone TEXT,
  instructions TEXT,
  failure_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 3. Proof of Delivery ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.proof_of_delivery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_stop_id UUID NOT NULL REFERENCES public.trip_stops(id) ON DELETE CASCADE,
  order_id UUID,
  pod_status TEXT NOT NULL DEFAULT 'VERWACHT'
    CHECK (pod_status IN (
      'NIET_VEREIST','VERWACHT','ONTVANGEN','ONVOLLEDIG',
      'GOEDGEKEURD','AFGEWEZEN'
    )),
  signature_url TEXT,
  photos JSONB DEFAULT '[]'::jsonb,
  recipient_name TEXT,
  received_at TIMESTAMPTZ,
  validated_by UUID,
  validated_at TIMESTAMPTZ,
  rejection_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 4. Delivery Exceptions ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  trip_id UUID REFERENCES public.trips(id),
  trip_stop_id UUID REFERENCES public.trip_stops(id),
  order_id UUID,
  exception_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'MEDIUM'
    CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  description TEXT NOT NULL,
  owner_id UUID,
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED','ESCALATED')),
  blocks_billing BOOLEAN NOT NULL DEFAULT false,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  escalated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 5. Billing status on orders ───────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='billing_status') THEN
    ALTER TABLE public.orders ADD COLUMN billing_status TEXT DEFAULT 'NIET_GEREED';
    ALTER TABLE public.orders ADD COLUMN billing_blocked_reason TEXT;
    ALTER TABLE public.orders ADD COLUMN billing_ready_at TIMESTAMPTZ;
  END IF;
END $$;

-- ─── 6. Indices ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_trips_tenant_date ON public.trips(tenant_id, planned_date);
CREATE INDEX IF NOT EXISTS idx_trips_driver ON public.trips(driver_id, dispatch_status);
CREATE INDEX IF NOT EXISTS idx_trips_vehicle_date ON public.trips(vehicle_id, planned_date);
CREATE INDEX IF NOT EXISTS idx_trip_stops_trip ON public.trip_stops(trip_id, stop_sequence);
CREATE INDEX IF NOT EXISTS idx_trip_stops_order ON public.trip_stops(order_id);
CREATE INDEX IF NOT EXISTS idx_pod_stop ON public.proof_of_delivery(trip_stop_id);
CREATE INDEX IF NOT EXISTS idx_dex_tenant ON public.delivery_exceptions(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_billing ON public.orders(billing_status);

-- ─── 7. RLS ────────────────────────────────────────────────
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proof_of_delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_exceptions ENABLE ROW LEVEL SECURITY;

-- Allow all for now (tighten in production)
CREATE POLICY "trips_all" ON public.trips FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "trip_stops_all" ON public.trip_stops FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "pod_all" ON public.proof_of_delivery FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dex_all" ON public.delivery_exceptions FOR ALL USING (true) WITH CHECK (true);
