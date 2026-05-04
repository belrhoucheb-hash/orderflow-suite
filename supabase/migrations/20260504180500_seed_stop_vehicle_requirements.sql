-- Add stop-level vehicle/access requirement options to the shared vehicle type catalog.
-- These are selected per pickup/delivery address in New Order and remain tenant-scoped.

CREATE OR REPLACE FUNCTION public.seed_default_vehicle_types(p_tenant_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO public.vehicle_types (
    tenant_id, code, name, sort_order,
    max_length_cm, max_width_cm, max_height_cm, max_weight_kg, max_volume_m3, max_pallets,
    has_tailgate, has_cooling, adr_capable
  ) VALUES
    (p_tenant_id, 'busje',                     'Busje',                         1,
     null, null, null, null, null, null, false, false, false),
    (p_tenant_id, 'bakwagen',                  'Bakwagen',                      2,
     null, null, null, null, null, null, false, false, false),
    (p_tenant_id, 'koelwagen',                 'Koelwagen',                     3,
     null, null, null, null, null, null, false, true,  false),
    (p_tenant_id, 'trailer',                   'Trailer',                      40,
     1360, 250, 280, 24000, 95.20, 33,  false, false, false),
    (p_tenant_id, 'koel-min5-20',              'Koel -5/20 graden',            45,
     null, null, null, null, null, null, false, true,  false),
    (p_tenant_id, 'koel-plus15-25',            'Koel +15/25 graden',           46,
     null, null, null, null, null, null, false, true,  false),
    (p_tenant_id, 'koel-plus2-8',              'Koel +2/8 graden',             47,
     null, null, null, null, null, null, false, true,  false),
    (p_tenant_id, 'adr',                       'ADR',                          48,
     null, null, null, null, null, null, false, false, true),
    (p_tenant_id, 'zeilwagen',                 'Zeilwagen',                    49,
     null, null, null, null, null, null, false, false, false),
    (p_tenant_id, 'kasten-trailer-rollerbaan', 'Kasten trailer / rollerbaan',  50,
     1360, 250, 280, 24000, 95.20, 33,  false, false, false)
  ON CONFLICT (tenant_id, code) DO UPDATE SET
    name = EXCLUDED.name,
    sort_order = EXCLUDED.sort_order,
    has_cooling = EXCLUDED.has_cooling,
    adr_capable = EXCLUDED.adr_capable,
    is_active = true,
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.seed_default_vehicle_types(UUID) IS
  'Idempotent seed van generieke voertuigmatrix per tenant, inclusief stop-level voertuig/toegangseisen.';

DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    PERFORM public.seed_default_vehicle_types(t.id);
  END LOOP;
END $$;
