-- ──────────────────────────────────────────────────────────────────────────
-- Sprint 2, TA-02. Tenant-scoped voertuigtype-matrix.
--
-- vehicle_types is de prijs-relevante matrix (afmetingen, gewicht, klep,
-- koeling, ADR) los van de fysieke vloot in public.vehicles. De tariefmotor
-- kiest het kleinste passende type op basis van zending-afmetingen plus
-- override-flags (requires_tail_lift, koeling, ADR).
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vehicle_types (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0,

  max_length_cm   INTEGER,
  max_width_cm    INTEGER,
  max_height_cm   INTEGER,
  max_weight_kg   INTEGER,
  max_volume_m3   NUMERIC(6,2),
  max_pallets     INTEGER,

  has_tailgate    BOOLEAN NOT NULL DEFAULT false,
  has_cooling     BOOLEAN NOT NULL DEFAULT false,
  adr_capable     BOOLEAN NOT NULL DEFAULT false,

  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, code)
);

COMMENT ON TABLE public.vehicle_types IS
  'Prijs-relevante voertuigmatrix per tenant. Gebruikt door tariefmotor voor kleinste-passend-selectie.';
COMMENT ON COLUMN public.vehicle_types.sort_order IS
  'Hiërarchie klein-naar-groot. Motor kiest laagste sort_order dat aan alle eisen voldoet.';

CREATE INDEX IF NOT EXISTS idx_vehicle_types_tenant
  ON public.vehicle_types (tenant_id, is_active, sort_order);

ALTER TABLE public.vehicle_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vehicle_types_tenant_select" ON public.vehicle_types
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "vehicle_types_tenant_insert" ON public.vehicle_types
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());
CREATE POLICY "vehicle_types_tenant_update" ON public.vehicle_types
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "vehicle_types_tenant_delete" ON public.vehicle_types
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "vehicle_types_service_role" ON public.vehicle_types
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_vehicle_types_updated_at ON public.vehicle_types;
CREATE TRIGGER update_vehicle_types_updated_at
  BEFORE UPDATE ON public.vehicle_types
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- vehicles.vehicle_type_id: optionele FK, bestaande vehicles.type (tekst) blijft.
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS vehicle_type_id UUID REFERENCES public.vehicle_types(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.vehicles.vehicle_type_id IS
  'Optionele koppeling naar vehicle_types. NULL = nog niet gemapt, legacy type-tekst geldt.';

-- ─── ROLLBACK ─────────────────────────────────────────────────
-- ALTER TABLE public.vehicles DROP COLUMN IF EXISTS vehicle_type_id;
-- DROP TABLE IF EXISTS public.vehicle_types CASCADE;
