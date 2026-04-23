-- Zorg dat elke tenant in elk geval de standaardtypes Busje, Bakwagen
-- en Koelwagen actief heeft. Sommige tenants kregen bij initialisatie
-- alleen "exotische" types (Caddy, Bus, Bakbus, ...) en staan nu met
-- een lege keuzelijst nadat die types zijn uitgezet.
--
-- ON CONFLICT werkt op de UNIQUE (tenant_id, code)-constraint die al
-- op de tabel staat: als een tenant de code al heeft, zetten we hem
-- gewoon op actief in plaats van een dubbele rij te maken.

INSERT INTO public.vehicle_types (tenant_id, code, name, sort_order, is_active)
SELECT t.id, 'busje', 'Busje', 1, true FROM public.tenants t
ON CONFLICT (tenant_id, code) DO UPDATE SET is_active = true;

INSERT INTO public.vehicle_types (tenant_id, code, name, sort_order, is_active)
SELECT t.id, 'bakwagen', 'Bakwagen', 2, true FROM public.tenants t
ON CONFLICT (tenant_id, code) DO UPDATE SET is_active = true;

INSERT INTO public.vehicle_types (tenant_id, code, name, sort_order, is_active)
SELECT t.id, 'koelwagen', 'Koelwagen', 3, true FROM public.tenants t
ON CONFLICT (tenant_id, code) DO UPDATE SET is_active = true;

-- ─── ROLLBACK ────────────────────────────────────────────────────────
-- Geen automatische rollback: rijen terug-deactiveren kan per tenant
-- via de Types-tab als een klant ze echt niet wil.
