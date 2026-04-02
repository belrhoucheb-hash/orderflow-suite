-- ============================================================
-- Migration: Driver Tracking & Time Registration (Fixed)
-- Ensures tenant_id exists even if tables were already present
-- ============================================================

-- ─── 1. Driver Time Entries ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.driver_time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Zorg dat tenant_id bestaat als de tabel al bestond
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'driver_time_entries' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.driver_time_entries ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.driver_time_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read driver time entries" ON public.driver_time_entries;
CREATE POLICY "Members can read driver time entries"
  ON public.driver_time_entries FOR SELECT TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()->'app_metadata'->>'tenant_id'))::uuid OR tenant_id IS NULL);

DROP POLICY IF EXISTS "Authenticated users can insert driver time entries" ON public.driver_time_entries;
CREATE POLICY "Authenticated users can insert driver time entries"
  ON public.driver_time_entries FOR INSERT TO authenticated
  WITH CHECK (tenant_id = ((SELECT auth.jwt()->'app_metadata'->>'tenant_id'))::uuid OR tenant_id IS NULL);

-- ─── 2. Driver Positions (Background GPS) ──────────────────
CREATE TABLE IF NOT EXISTS public.driver_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  latitude NUMERIC(10,7) NOT NULL,
  longitude NUMERIC(10,7) NOT NULL,
  accuracy NUMERIC(10,2),
  speed NUMERIC(10,2),
  heading NUMERIC(10,2),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Zorg dat tenant_id bestaat als de tabel al bestond
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'driver_positions' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.driver_positions ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.driver_positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read driver positions" ON public.driver_positions;
CREATE POLICY "Members can read driver positions"
  ON public.driver_positions FOR SELECT TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()->'app_metadata'->>'tenant_id'))::uuid OR tenant_id IS NULL);

DROP POLICY IF EXISTS "Authenticated users can insert driver positions" ON public.driver_positions;
CREATE POLICY "Authenticated users can insert driver positions"
  ON public.driver_positions FOR INSERT TO authenticated
  WITH CHECK (tenant_id = ((SELECT auth.jwt()->'app_metadata'->>'tenant_id'))::uuid OR tenant_id IS NULL);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_driver_time_entries_driver ON public.driver_time_entries(driver_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_positions_driver ON public.driver_positions(driver_id, recorded_at DESC);

-- Enable Realtime (ignore error if already enabled)
DO $$ BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_time_entries';
EXCEPTION WHEN others THEN END $$;

DO $$ BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_positions';
EXCEPTION WHEN others THEN END $$;
