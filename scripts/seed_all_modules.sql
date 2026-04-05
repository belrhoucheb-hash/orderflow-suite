-- ============================================================
-- OrderFlow Suite — Complete Seed Data for All Modules
-- Tenant: Royalty Cargo (Dev)
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Fixed tenant ID used everywhere
-- '00000000-0000-0000-0000-000000000001'

BEGIN;

-- ═══════════════════════════════════════════════════════════════
-- PART A: Ensure missing tables/columns exist (idempotent)
-- ═══════════════════════════════════════════════════════════════

-- handle_updated_at function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Invoices table
CREATE TABLE IF NOT EXISTS public.invoices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id),
  invoice_number text NOT NULL,
  client_id     uuid REFERENCES public.clients(id),
  client_name   text,
  client_address text,
  client_btw_number text,
  client_kvk_number text,
  status        text NOT NULL DEFAULT 'concept'
                  CHECK (status IN ('concept', 'verzonden', 'betaald', 'vervallen')),
  invoice_date  date NOT NULL DEFAULT CURRENT_DATE,
  due_date      date,
  subtotal      numeric(10,2) NOT NULL DEFAULT 0,
  btw_percentage numeric(5,2) NOT NULL DEFAULT 21.00,
  btw_amount    numeric(10,2) NOT NULL DEFAULT 0,
  total         numeric(10,2) NOT NULL DEFAULT 0,
  notes         text,
  pdf_url       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, invoice_number)
);

DROP TRIGGER IF EXISTS set_invoices_updated_at ON public.invoices;
CREATE TRIGGER set_invoices_updated_at
  BEFORE UPDATE ON public.invoices FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Invoice lines table
CREATE TABLE IF NOT EXISTS public.invoice_lines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  order_id    uuid REFERENCES public.orders(id),
  description text NOT NULL,
  quantity    numeric(10,2) NOT NULL DEFAULT 1,
  unit        text NOT NULL DEFAULT 'stuk',
  unit_price  numeric(10,2) NOT NULL DEFAULT 0,
  total       numeric(10,2) NOT NULL DEFAULT 0,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Add invoice_id to orders if missing
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='orders' AND column_name='invoice_id'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;
  END IF;
END; $$;

-- Add warehouse_received_at to orders if missing
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS warehouse_received_at timestamptz;

-- RLS on new tables
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;

-- Service role policies (so seed data can be inserted)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='invoices' AND policyname='Service role: invoices') THEN
    CREATE POLICY "Service role: invoices" ON public.invoices FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='invoice_lines' AND policyname='Service role: invoice_lines') THEN
    CREATE POLICY "Service role: invoice_lines" ON public.invoice_lines FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END; $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON public.invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON public.invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON public.invoice_lines(invoice_id);

-- Order status transition trigger
CREATE OR REPLACE FUNCTION public.validate_order_status_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
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

DROP TRIGGER IF EXISTS enforce_order_status_transition ON public.orders;
CREATE TRIGGER enforce_order_status_transition
  BEFORE UPDATE OF status ON public.orders FOR EACH ROW
  EXECUTE FUNCTION public.validate_order_status_transition();

-- ═══════════════════════════════════════════════════════════════
-- PART B: Seed Data
-- ═══════════════════════════════════════════════════════════════

-- ─── 0. TENANT ──────────────────────────────────────────────
INSERT INTO public.tenants (id, name, slug, primary_color, settings, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Royalty Cargo (Dev)',
  'dev',
  '#dc2626',
  '{"default_currency":"EUR","country":"NL"}',
  true
)
ON CONFLICT (id) DO NOTHING;

-- ─── 1. MASTER DATA: vehicle_types ──────────────────────────
INSERT INTO public.vehicle_types (id, tenant_id, name, code, default_capacity_kg, default_capacity_pallets, is_active, sort_order) VALUES
('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Bakwagen',        'bakwagen',     8000,  10, true,  1),
('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Trekker + Oplegger','trekker',    24000,  33, true,  2),
('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Bestelbus',        'bestelbus',    1200,   2, true,  3),
('a0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Koelwagen',        'koelwagen',    6000,   8, true,  4),
('a0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Containerchassis', 'container',   26000,   1, true,  5)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- ─── 2. MASTER DATA: loading_units ──────────────────────────
INSERT INTO public.loading_units (id, tenant_id, name, code, default_weight_kg, default_dimensions, is_active, sort_order) VALUES
('b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Europallet',   'EUR',   25,  '120x80x15 cm',   true, 1),
('b0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Blokpallet',   'BLOK',  30,  '120x100x15 cm',  true, 2),
('b0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Colli',        'COLLI', 5,   'variabel',       true, 3),
('b0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Rolcontainer', 'ROLL',  40,  '80x68x170 cm',   true, 4),
('b0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Gitterbox',    'GBOX',  85,  '124x84x97 cm',   true, 5),
('b0000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'Losse lading', 'BULK',  0,   'n.v.t.',         true, 6)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- ─── 3. MASTER DATA: requirement_types ──────────────────────
INSERT INTO public.requirement_types (id, tenant_id, name, code, category, icon, color, is_active, sort_order) VALUES
('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'ADR (gevaarlijke stoffen)', 'ADR',       'transport', 'flame',         '#ef4444', true, 1),
('c0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Koeling',                   'KOELING',   'transport', 'thermometer',   '#3b82f6', true, 2),
('c0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Breekbaar',                 'BREEKBAAR', 'handling',  'alert-triangle','#f59e0b', true, 3),
('c0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Klep / Laadklep',           'KLEP',      'vehicle',   'arrow-down',    '#8b5cf6', true, 4),
('c0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Code 95',                   'CODE95',    'driver',    'badge-check',   '#10b981', true, 5),
('c0000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'Internationaal',            'INTL',      'transport', 'globe',         '#6366f1', true, 6)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- ─── 4. CLIENTS ─────────────────────────────────────────────
INSERT INTO public.clients (id, tenant_id, name, address, zipcode, city, country, contact_person, email, phone, kvk_number, btw_number, payment_terms, is_active) VALUES
('d0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
 'Van der Berg Logistics',  'Transportweg 12',   '3045 AB', 'Rotterdam',  'NL', 'Jan van der Berg',  'jan@vdberg-logistics.nl',   '+31 10 234 5678', '12345678', 'NL123456789B01', 30, true),
('d0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
 'Fresh Express BV',        'Veilingweg 8',      '2685 CD', 'Poeldijk',   'NL', 'Lisa de Vries',     'lisa@freshexpress.nl',      '+31 174 123 456', '23456789', 'NL234567890B01', 14, true),
('d0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
 'ChemSolutions Nederland', 'Havenstraat 45',    '3011 AL', 'Rotterdam',  'NL', 'Pieter Smit',       'p.smit@chemsolutions.nl',   '+31 10 345 6789', '34567890', 'NL345678901B01', 45, true),
('d0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
 'Bakker Bouwmaterialen',   'Industriepark 3',   '5652 AH', 'Eindhoven',  'NL', 'Kees Bakker',       'kees@bakkerbouw.nl',        '+31 40 678 9012', '45678901', 'NL456789012B01', 30, true),
('d0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
 'Amsterdam Supply Chain',  'Basisweg 10',       '1043 AP', 'Amsterdam',  'NL', 'Sophie Jansen',     'sophie@amsupplychain.nl',   '+31 20 456 7890', '56789012', 'NL567890123B01', 30, true)
ON CONFLICT (id) DO NOTHING;

-- ─── 5. CLIENT LOCATIONS ────────────────────────────────────
INSERT INTO public.client_locations (id, tenant_id, client_id, label, address, zipcode, city, country, location_type, time_window_start, time_window_end, notes) VALUES
('e0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001',
 'Hoofdkantoor Rotterdam',  'Transportweg 12',     '3045 AB', 'Rotterdam',  'NL', 'pickup',   '07:00', '17:00', 'Melden bij receptie'),
('e0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001',
 'Warehouse Maasvlakte',    'Maasvlakte 2, Hal 7', '3199 LA', 'Rotterdam',  'NL', 'delivery', '06:00', '22:00', 'Gate 3, legitimatie verplicht'),
('e0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002',
 'Veiling Westland',        'Veilingweg 8',        '2685 CD', 'Poeldijk',   'NL', 'pickup',   '05:00', '12:00', 'Koelketen mag niet worden doorbroken'),
('e0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002',
 'DC Albert Heijn Zaandam',  'Communicatieweg 1',  '1521 PZ', 'Zaandam',    'NL', 'delivery', '04:00', '14:00', 'Laden op dock 12-15'),
('e0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003',
 'Chemiehaven Rotterdam',   'Havenstraat 45',      '3011 AL', 'Rotterdam',  'NL', 'pickup',   '08:00', '16:00', 'ADR-bevoegd personeel vereist'),
('e0000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000004',
 'Bouwplaats Strijp-S',     'Torenallee 20',       '5617 BD', 'Eindhoven',  'NL', 'delivery', '07:00', '18:00', 'Max voertuiglengte 12m'),
('e0000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000005',
 'Warehouse Schiphol',      'Anchoragelaan 48',    '1118 LD', 'Schiphol',   'NL', 'delivery', '00:00', '23:59', 'Beveiligde zone, aanmelden 30 min van tevoren')
ON CONFLICT (id) DO NOTHING;

-- ─── 6. CLIENT RATES ────────────────────────────────────────
INSERT INTO public.client_rates (id, tenant_id, client_id, rate_type, description, amount, currency, is_active) VALUES
('f0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'per_km',       'Standaard kilometertarief',     1.85, 'EUR', true),
('f0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'per_uur',      'Wachttijd chauffeur',           45.00, 'EUR', true),
('f0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'per_rit',      'Vast tarief veiling → DC',     285.00, 'EUR', true),
('f0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'toeslag',      'Koeltoeslag per pallet',        12.50, 'EUR', true),
('f0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'per_km',       'ADR-tarief per km',              3.20, 'EUR', true),
('f0000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000004', 'per_rit',      'Dagrit Eindhoven regio',       175.00, 'EUR', true),
('f0000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000005', 'per_rit',      'Luchtvracht Schiphol',         425.00, 'EUR', true)
ON CONFLICT (id) DO NOTHING;

-- ─── 7. VEHICLES ────────────────────────────────────────────
INSERT INTO public.vehicles (id, tenant_id, code, name, plate, type, capacity_kg, capacity_pallets, features, is_active, brand, build_year, cargo_length_cm, cargo_width_cm, cargo_height_cm, status, assigned_driver, fuel_consumption) VALUES
('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
 'RC-01', 'Bakwagen 1',       'BX-123-AB', 'bakwagen',   8000,  10, ARRAY['klep','zijborden'],       true,  'DAF',     2022, 720, 245, 260, 'beschikbaar', NULL, 28.5),
('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
 'RC-02', 'Trekker + Trailer', 'VH-456-CD', 'trekker',   24000,  33, ARRAY['GPS','dashcam'],          true,  'Volvo',   2021, 1360, 248, 270, 'onderweg',    NULL, 32.0),
('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
 'RC-03', 'Koelwagen',         'KW-789-EF', 'koelwagen',  6000,   8, ARRAY['koeling','thermostaat'],  true,  'Mercedes',2023, 600, 240, 240, 'beschikbaar', NULL, 26.0),
('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
 'RC-04', 'Bestelbus',         'BS-012-GH', 'bestelbus',  1200,   2, ARRAY['navigatie'],              true,  'VW',      2024, 340, 175, 190, 'beschikbaar', NULL, 12.5),
('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
 'RC-05', 'ADR Bakwagen',      'AD-345-IJ', 'bakwagen',   7500,   9, ARRAY['klep','ADR','brandblus'], true,  'Scania',  2020, 700, 245, 255, 'onderhoud',   NULL, 30.0),
('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001',
 'RC-06', 'Trekker 2',         'TR-678-KL', 'trekker',   24000,  33, ARRAY['GPS','dashcam','ADR'],    true,  'DAF',     2023, 1360, 248, 270, 'beschikbaar', NULL, 31.0)
ON CONFLICT (id) DO NOTHING;

-- ─── 8. DRIVERS ─────────────────────────────────────────────
INSERT INTO public.drivers (id, tenant_id, name, email, phone, license_number, certifications, status, current_vehicle_id, is_active) VALUES
('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
 'Mohammed El Amrani',  'm.elamrani@royaltycargo.nl',  '+31 6 1234 5678', 'NL-0012345678', ARRAY['CE','Code95','ADR'],   'beschikbaar', '10000000-0000-0000-0000-000000000001', true),
('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
 'Henk de Groot',       'h.degroot@royaltycargo.nl',   '+31 6 2345 6789', 'NL-0023456789', ARRAY['CE','Code95'],          'onderweg',    '10000000-0000-0000-0000-000000000002', true),
('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
 'Anna Visser',         'a.visser@royaltycargo.nl',    '+31 6 3456 7890', 'NL-0034567890', ARRAY['C','Code95','koeling'], 'beschikbaar', '10000000-0000-0000-0000-000000000003', true),
('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
 'Stefan Bakker',       's.bakker@royaltycargo.nl',    '+31 6 4567 8901', 'NL-0045678901', ARRAY['B'],                     'beschikbaar', '10000000-0000-0000-0000-000000000004', true),
('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
 'Fatima Yilmaz',       'f.yilmaz@royaltycargo.nl',    '+31 6 5678 9012', 'NL-0056789012', ARRAY['CE','Code95','ADR'],    'vrij',        NULL,                                    true)
ON CONFLICT (id) DO NOTHING;

-- Update vehicles with assigned drivers
UPDATE public.vehicles SET assigned_driver = 'Mohammed El Amrani' WHERE id = '10000000-0000-0000-0000-000000000001';
UPDATE public.vehicles SET assigned_driver = 'Henk de Groot'      WHERE id = '10000000-0000-0000-0000-000000000002';
UPDATE public.vehicles SET assigned_driver = 'Anna Visser'        WHERE id = '10000000-0000-0000-0000-000000000003';
UPDATE public.vehicles SET assigned_driver = 'Stefan Bakker'      WHERE id = '10000000-0000-0000-0000-000000000004';

-- ─── 9. VEHICLE DOCUMENTS ───────────────────────────────────
INSERT INTO public.vehicle_documents (id, tenant_id, vehicle_id, doc_type, expiry_date, notes) VALUES
('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'APK',           '2026-11-15', 'Laatste APK goedgekeurd zonder opmerkingen'),
('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Verzekering',   '2027-01-01', 'WA + casco bij Allianz'),
('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'APK',           '2026-06-20', 'Let op: bijna verlopen'),
('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'Verzekering',   '2027-03-01', NULL),
('30000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'ATP-certificaat','2027-05-01', 'Koelinstallatie Carrier Supra gecertificeerd'),
('30000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'ADR-keuring',   '2026-08-30', 'Klasse 3 + 8 goedgekeurd'),
('30000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'APK',           '2026-04-10', 'URGENT: verloopt binnenkort!')
ON CONFLICT (id) DO NOTHING;

-- ─── 10. VEHICLE MAINTENANCE ────────────────────────────────
INSERT INTO public.vehicle_maintenance (id, tenant_id, vehicle_id, maintenance_type, description, mileage_km, scheduled_date, completed_date, cost) VALUES
('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
 'regulier',    'Grote beurt 60.000 km',                  60000,  '2026-02-15', '2026-02-15', 850.00),
('40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
 'banden',      '4x nieuwe banden Michelin',               62000,  '2026-03-01', '2026-03-01', 1200.00),
('40000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002',
 'regulier',    'Oliewissel + filters',                   120000, '2026-03-20', '2026-03-20', 450.00),
('40000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005',
 'reparatie',   'Remschijven vervangen + ADR-controle',    85000,  '2026-03-28', NULL,         NULL),
('40000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003',
 'regulier',    'Koelinstallatie check + koelmiddel',      45000,  '2026-04-15', NULL,         NULL),
('40000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000006',
 'regulier',    'Grote beurt 90.000 km',                   90000,  '2026-05-01', NULL,         NULL)
ON CONFLICT (id) DO NOTHING;

-- ─── 11. VEHICLE AVAILABILITY (this week + next week) ───────
INSERT INTO public.vehicle_availability (id, tenant_id, vehicle_id, date, status, reason) VALUES
-- Today and upcoming
('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', CURRENT_DATE,     'beschikbaar', NULL),
('50000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', CURRENT_DATE,     'onderweg',    'Rit Rotterdam → Groningen'),
('50000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', CURRENT_DATE,     'beschikbaar', NULL),
('50000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', CURRENT_DATE,     'beschikbaar', NULL),
('50000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', CURRENT_DATE,     'onderhoud',   'In garage voor remmen'),
('50000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000006', CURRENT_DATE,     'beschikbaar', NULL),
-- Tomorrow
('50000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', CURRENT_DATE + 1, 'gereserveerd','Gereserveerd voor ChemSolutions ADR rit'),
('50000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', CURRENT_DATE + 1, 'beschikbaar', NULL),
('50000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', CURRENT_DATE + 1, 'gereserveerd','Fresh Express koelrit'),
('50000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', CURRENT_DATE + 1, 'onderhoud',   'Nog in garage'),
-- Day after tomorrow
('50000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', CURRENT_DATE + 2, 'beschikbaar', NULL),
('50000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', CURRENT_DATE + 2, 'beschikbaar', 'Terug uit garage')
ON CONFLICT (id) DO NOTHING;

-- ─── 12. ORDERS — alle statussen vertegenwoordigd ───────────
INSERT INTO public.orders (id, tenant_id, order_number, status, client_name, transport_type, pickup_address, delivery_address, quantity, unit, weight_kg, requirements, source_email_from, source_email_subject, source_email_body, confidence_score, vehicle_id, driver_id, thread_type, priority, internal_note, time_window_start, time_window_end, received_at, created_at, updated_at) VALUES

-- DRAFT orders (inbox / nieuw)
('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 6001, 'DRAFT',
 'Bakker Bouwmaterialen', 'Direct', 'Industriepark 3, Eindhoven', 'Torenallee 20, Eindhoven',
 8, 'Europallets', 2400, ARRAY['KLEP'],
 'kees@bakkerbouw.nl', 'Levering bouwmaterialen Strijp-S',
 'Beste,\n\nGraag 8 pallets bouwmaterialen bezorgen op de bouwplaats Strijp-S. Laadklep is nodig want er is geen dock.\n\nMvg,\nKees Bakker',
 92, NULL, NULL, 'new', 'normaal', NULL, '07:00', '18:00',
 NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours'),

('60000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 6002, 'DRAFT',
 'Amsterdam Supply Chain', 'WAREHOUSE_AIR', 'Basisweg 10, Amsterdam', 'Anchoragelaan 48, Schiphol',
 3, 'Colli', 150, ARRAY['BREEKBAAR','Internationaal'],
 'sophie@amsupplychain.nl', 'RE: Luchtvracht electronica Schiphol',
 'Hi team,\n\n3 colli fragiele electronica naar Schiphol cargo. Moet vandaag nog weg ivm vluchtschema.\n\nGroet,\nSophie',
 78, NULL, NULL, 'new', 'spoed', NULL, '10:00', '15:00',
 NOW() - INTERVAL '45 minutes', NOW() - INTERVAL '45 minutes', NOW() - INTERVAL '45 minutes'),

-- PENDING orders (wacht op antwoord / in behandeling)
('60000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 6003, 'PENDING',
 'ChemSolutions Nederland', 'Direct', 'Havenstraat 45, Rotterdam', 'Chemiepark 12, Moerdijk',
 6, 'Gitterbox', 5400, ARRAY['ADR'],
 'p.smit@chemsolutions.nl', 'Transport chemische grondstoffen',
 'ADR klasse 3 transport van 6 gitterboxen naar Moerdijk. Alleen ADR-gecertificeerd materieel.',
 95, NULL, NULL, 'new', 'hoog', 'Wacht op bevestiging ADR-classificatie van klant', '08:00', '16:00',
 NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day', NOW() - INTERVAL '6 hours'),

('60000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 6004, 'PENDING',
 'Van der Berg Logistics', 'Direct', 'Transportweg 12, Rotterdam', 'Distributiecentrum 5, Utrecht',
 15, 'Europallets', 6000, ARRAY[]::text[],
 'jan@vdberg-logistics.nl', 'FW: Dagelijkse pendelrit Rdam-Utrecht',
 'Standaard dagrit morgen, 15 pallets richting Utrecht DC.',
 99, NULL, NULL, 'new', 'normaal', NULL, '06:00', '14:00',
 NOW() - INTERVAL '20 hours', NOW() - INTERVAL '20 hours', NOW() - INTERVAL '12 hours'),

-- PLANNED orders (ingepland, klaar voor uitvoering)
('60000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 6005, 'PLANNED',
 'Fresh Express BV', 'Direct', 'Veilingweg 8, Poeldijk', 'Communicatieweg 1, Zaandam',
 12, 'Europallets', 4800, ARRAY['KOELING'],
 'lisa@freshexpress.nl', 'Koeltransport groenten week 14',
 'Wekelijkse koelrit: 12 pallets verse groenten van veiling naar AH DC Zaandam.',
 100, '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', 'new', 'hoog',
 'Koeltemperatuur: 2-4°C. Anna rijdt.', '05:00', '09:00',
 NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days', NOW() - INTERVAL '4 hours'),

('60000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 6006, 'PLANNED',
 'Van der Berg Logistics', 'Direct', 'Maasvlakte 2, Hal 7, Rotterdam', 'Europaweg 1, Groningen',
 20, 'Europallets', 9500, ARRAY[]::text[],
 'jan@vdberg-logistics.nl', 'Zending containers Groningen',
 'Grote zending vanuit Maasvlakte naar Groningen. 20 pallets diverse goederen.',
 98, '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'new', 'normaal',
 'Henk rijdt met trekker. Verwachte aankomst 14:00.', '07:00', '15:00',
 NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day', NOW() - INTERVAL '3 hours'),

-- IN_TRANSIT orders (onderweg)
('60000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 6007, 'IN_TRANSIT',
 'Bakker Bouwmaterialen', 'Direct', 'Betoncentrale 8, Breda', 'Bouwplaats Torenallee 20, Eindhoven',
 4, 'Blokpallets', 8000, ARRAY['KLEP'],
 'kees@bakkerbouw.nl', 'Betonblokken Breda → Eindhoven',
 'Spoedlevering betonblokken voor fundering.',
 97, '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'new', 'spoed',
 'Mohammed is vertrokken om 08:15. ETA 10:30.', '08:00', '12:00',
 NOW() - INTERVAL '3 hours', NOW() - INTERVAL '3 hours', NOW() - INTERVAL '1 hour'),

('60000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', 6008, 'IN_TRANSIT',
 'Amsterdam Supply Chain', 'Direct', 'Basisweg 10, Amsterdam', 'Hullenbergweg 400, Amsterdam',
 2, 'Rolcontainers', 300, ARRAY[]::text[],
 'sophie@amsupplychain.nl', 'Spoedlevering kantoormeubelen',
 'Twee rolcontainers met kantoormeubelen. Kan met de bus.',
 100, '10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000004', 'new', 'normaal',
 'Stefan rijdt met bestelbus, korte rit.', '09:00', '17:00',
 NOW() - INTERVAL '5 hours', NOW() - INTERVAL '5 hours', NOW() - INTERVAL '30 minutes'),

-- DELIVERED orders
('60000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001', 6009, 'DELIVERED',
 'Fresh Express BV', 'Direct', 'Veilingweg 8, Poeldijk', 'Communicatieweg 1, Zaandam',
 10, 'Europallets', 4000, ARRAY['KOELING'],
 'lisa@freshexpress.nl', 'Koeltransport week 13',
 'Wekelijkse koelrit: 10 pallets verse groenten.',
 100, '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', 'new', 'hoog',
 'Afgeleverd op 2026-03-23 om 08:45. Alles OK.', '05:00', '09:00',
 NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days', NOW() - INTERVAL '6 days 15 hours'),

('60000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 6010, 'DELIVERED',
 'Van der Berg Logistics', 'Direct', 'Transportweg 12, Rotterdam', 'Distributiecentrum 5, Utrecht',
 14, 'Europallets', 5600, ARRAY[]::text[],
 'jan@vdberg-logistics.nl', 'Pendelrit Rdam-Utrecht 24 maart',
 'Standaard dagrit.',
 99, '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'new', 'normaal',
 'Afgeleverd 24 maart 11:20, getekend door magazijnchef.', '06:00', '14:00',
 NOW() - INTERVAL '6 days', NOW() - INTERVAL '6 days', NOW() - INTERVAL '5 days 13 hours'),

('60000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 6011, 'DELIVERED',
 'ChemSolutions Nederland', 'Direct', 'Havenstraat 45, Rotterdam', 'Chemiepark 12, Moerdijk',
 4, 'Gitterbox', 3600, ARRAY['ADR'],
 'p.smit@chemsolutions.nl', 'ADR transport vorige week',
 'ADR klasse 8 transport.',
 96, '10000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', 'new', 'hoog',
 'Succesvol afgeleverd. Geen incidenten.', '08:00', '16:00',
 NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days', NOW() - INTERVAL '9 days 12 hours'),

-- CANCELLED order
('60000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 6012, 'CANCELLED',
 'Bakker Bouwmaterialen', 'Direct', 'Industriepark 3, Eindhoven', 'Helmondseweg 1, Helmond',
 6, 'Europallets', 1800, ARRAY[]::text[],
 'kees@bakkerbouw.nl', 'GEANNULEERD: Levering Helmond',
 'Door weersomstandigheden uitgesteld naar volgende week.',
 100, NULL, NULL, 'new', 'laag',
 'Klant heeft geannuleerd wegens vorst op de bouwplaats.', '07:00', '17:00',
 NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days', NOW() - INTERVAL '3 days'),

-- Extra DRAFT with update thread (voor inbox threading test)
('60000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001', 6013, 'DRAFT',
 'Van der Berg Logistics', 'Direct', 'Transportweg 12, Rotterdam', 'Nieuwegein Industrieweg 50',
 10, 'Europallets', 4000, ARRAY[]::text[],
 'jan@vdberg-logistics.nl', 'RE: Pendelrit Rotterdam - Nieuwegein (WIJZIGING)',
 'Update: het zijn nu 10 pallets ipv 8. Adres is gewijzigd naar Industrieweg 50 Nieuwegein.',
 85, NULL, NULL, 'update', 'normaal', NULL, '06:00', '14:00',
 NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 hour')
ON CONFLICT (id) DO NOTHING;

-- Set parent_order_id for the thread update
UPDATE public.orders SET parent_order_id = '60000000-0000-0000-0000-000000000004'
WHERE id = '60000000-0000-0000-0000-000000000013';

-- ─── 13. INVOICES ───────────────────────────────────────────
INSERT INTO public.invoices (id, tenant_id, invoice_number, client_id, client_name, client_address, client_btw_number, client_kvk_number, status, invoice_date, due_date, subtotal, btw_percentage, btw_amount, total, notes) VALUES

('70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
 'RC-2026-0001', 'd0000000-0000-0000-0000-000000000002', 'Fresh Express BV', 'Veilingweg 8, 2685 CD Poeldijk', 'NL234567890B01', '23456789',
 'betaald', '2026-03-10', '2026-03-24', 582.50, 21.00, 122.33, 704.83,
 'Koeltransporten week 10-11'),

('70000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
 'RC-2026-0002', 'd0000000-0000-0000-0000-000000000001', 'Van der Berg Logistics', 'Transportweg 12, 3045 AB Rotterdam', 'NL123456789B01', '12345678',
 'verzonden', '2026-03-20', '2026-04-19', 1480.00, 21.00, 310.80, 1790.80,
 'Pendelritten maart week 12-13'),

('70000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
 'RC-2026-0003', 'd0000000-0000-0000-0000-000000000003', 'ChemSolutions Nederland', 'Havenstraat 45, 3011 AL Rotterdam', 'NL345678901B01', '34567890',
 'concept', '2026-03-28', '2026-05-12', 960.00, 21.00, 201.60, 1161.60,
 'ADR transport maart')
ON CONFLICT (id) DO NOTHING;

-- ─── 14. INVOICE LINES ──────────────────────────────────────
INSERT INTO public.invoice_lines (id, invoice_id, order_id, description, quantity, unit, unit_price, total, sort_order) VALUES
-- Invoice 1: Fresh Express (betaald)
('80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000009',
 'Koeltransport Poeldijk → Zaandam (10 pallets)', 1, 'rit', 285.00, 285.00, 1),
('80000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000009',
 'Koeltoeslag per pallet', 10, 'pallet', 12.50, 125.00, 2),
('80000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000001', NULL,
 'Wachttijd dock (45 min)', 0.75, 'uur', 45.00, 33.75, 3),
('80000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000001', NULL,
 'Dieseltoeslag maart', 1, 'stuk', 138.75, 138.75, 4),

-- Invoice 2: Van der Berg (verzonden)
('80000000-0000-0000-0000-000000000005', '70000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000010',
 'Pendelrit Rotterdam → Utrecht (14 pallets)', 1, 'rit', 370.00, 370.00, 1),
('80000000-0000-0000-0000-000000000006', '70000000-0000-0000-0000-000000000002', NULL,
 'Pendelrit Rotterdam → Utrecht (12 pallets, 25 mrt)', 1, 'rit', 370.00, 370.00, 2),
('80000000-0000-0000-0000-000000000007', '70000000-0000-0000-0000-000000000002', NULL,
 'Pendelrit Rotterdam → Utrecht (15 pallets, 27 mrt)', 1, 'rit', 370.00, 370.00, 3),
('80000000-0000-0000-0000-000000000008', '70000000-0000-0000-0000-000000000002', NULL,
 'Pendelrit Rotterdam → Utrecht (15 pallets, 28 mrt)', 1, 'rit', 370.00, 370.00, 4),

-- Invoice 3: ChemSolutions (concept)
('80000000-0000-0000-0000-000000000009', '70000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000011',
 'ADR transport Rotterdam → Moerdijk (4 gitterboxen)', 1, 'rit', 640.00, 640.00, 1),
('80000000-0000-0000-0000-000000000010', '70000000-0000-0000-0000-000000000003', NULL,
 'ADR-toeslag gevaarlijke stoffen', 1, 'stuk', 320.00, 320.00, 2)
ON CONFLICT (id) DO NOTHING;

-- Link delivered orders to their invoices
UPDATE public.orders SET invoice_id = '70000000-0000-0000-0000-000000000001' WHERE id = '60000000-0000-0000-0000-000000000009';
UPDATE public.orders SET invoice_id = '70000000-0000-0000-0000-000000000002' WHERE id = '60000000-0000-0000-0000-000000000010';
UPDATE public.orders SET invoice_id = '70000000-0000-0000-0000-000000000003' WHERE id = '60000000-0000-0000-0000-000000000011';

-- ─── 15. NOTIFICATIONS ──────────────────────────────────────
INSERT INTO public.notifications (id, tenant_id, type, title, message, icon, order_id, is_read, metadata) VALUES
('90000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
 'order',    'Nieuwe order ontvangen',          'Bakker Bouwmaterialen heeft een nieuwe transportaanvraag ingediend (8 pallets → Strijp-S)',
 'package',  '60000000-0000-0000-0000-000000000001', false, '{"priority":"normaal"}'),
('90000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
 'urgent',   'Spoedorder: luchtvracht Schiphol', 'Amsterdam Supply Chain vraagt spoedtransport naar Schiphol cargo. Deadline vandaag 15:00.',
 'alert-triangle', '60000000-0000-0000-0000-000000000002', false, '{"priority":"spoed"}'),
('90000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
 'vehicle',  'APK bijna verlopen',              'Voertuig RC-05 (AD-345-IJ) APK verloopt op 10 april 2026. Plan tijdig een afspraak.',
 'truck',    NULL, false, '{"vehicle_id":"10000000-0000-0000-0000-000000000005","expiry":"2026-04-10"}'),
('90000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
 'delivery', 'Order 6009 afgeleverd',           'Koeltransport Fresh Express is succesvol afgeleverd in Zaandam.',
 'check-circle', '60000000-0000-0000-0000-000000000009', true, NULL),
('90000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
 'update',   'Orderwijziging ontvangen',        'Van der Berg Logistics heeft order 6004 gewijzigd: 10 pallets ipv 8, nieuw adres Nieuwegein.',
 'edit',     '60000000-0000-0000-0000-000000000013', false, '{"thread_type":"update","changes":["quantity","delivery_address"]}'),
('90000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001',
 'invoice',  'Factuur RC-2026-0001 betaald',    'Fresh Express BV heeft factuur RC-2026-0001 (€704,83) voldaan.',
 'banknote', NULL, true, '{"invoice_id":"70000000-0000-0000-0000-000000000001","amount":704.83}'),
('90000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001',
 'info',     'Chauffeur onderweg',              'Henk de Groot is vertrokken richting Groningen met 20 pallets (RC-02).',
 'navigation', '60000000-0000-0000-0000-000000000006', true, '{"driver":"Henk de Groot","vehicle":"RC-02"}')
ON CONFLICT (id) DO NOTHING;

-- ─── 16. AI USAGE LOG ───────────────────────────────────────
INSERT INTO public.ai_usage_log (id, tenant_id, function_name, model, input_tokens, output_tokens, cost_estimate, created_at) VALUES
('a1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'parse-order', 'gemini-2.5-flash', 1250, 480,  0.001200, NOW() - INTERVAL '2 hours'),
('a1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'parse-order', 'gemini-2.5-flash', 980,  520,  0.001050, NOW() - INTERVAL '45 minutes'),
('a1000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'parse-order', 'gemini-2.5-flash', 1100, 410,  0.001080, NOW() - INTERVAL '1 day'),
('a1000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'parse-order', 'gemini-2.5-flash', 850,  350,  0.000850, NOW() - INTERVAL '20 hours'),
('a1000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'parse-order', 'gemini-2.5-flash', 1500, 620,  0.001500, NOW() - INTERVAL '2 days'),
('a1000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'parse-order', 'gemini-2.5-flash', 1300, 490,  0.001280, NOW() - INTERVAL '3 days'),
('a1000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'parse-order', 'gemini-2.5-flash', 920,  380,  0.000920, NOW() - INTERVAL '5 days'),
('a1000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', 'parse-order', 'gemini-2.5-flash', 1050, 440,  0.001050, NOW() - INTERVAL '7 days'),
('a1000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001', 'send-follow-up','gemini-2.5-flash', 600,  350, 0.000680, NOW() - INTERVAL '6 hours'),
('a1000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'send-confirmation','gemini-2.5-flash',400, 280, 0.000480, NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;

-- ─── 17. ACTIVITY LOG ───────────────────────────────────────
INSERT INTO public.activity_log (id, tenant_id, entity_type, entity_id, action, changes, created_at) VALUES
('a2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
 'order', '60000000-0000-0000-0000-000000000009', 'status_change',
 '{"from":"IN_TRANSIT","to":"DELIVERED"}', NOW() - INTERVAL '6 days 15 hours'),
('a2000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
 'order', '60000000-0000-0000-0000-000000000010', 'status_change',
 '{"from":"IN_TRANSIT","to":"DELIVERED"}', NOW() - INTERVAL '5 days 13 hours'),
('a2000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
 'order', '60000000-0000-0000-0000-000000000005', 'assigned',
 '{"vehicle":"RC-03","driver":"Anna Visser"}', NOW() - INTERVAL '4 hours'),
('a2000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
 'order', '60000000-0000-0000-0000-000000000012', 'status_change',
 '{"from":"PENDING","to":"CANCELLED","reason":"Vorst op bouwplaats"}', NOW() - INTERVAL '3 days'),
('a2000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
 'invoice', '70000000-0000-0000-0000-000000000001', 'status_change',
 '{"from":"verzonden","to":"betaald"}', NOW() - INTERVAL '2 days'),
('a2000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001',
 'vehicle', '10000000-0000-0000-0000-000000000005', 'status_change',
 '{"from":"beschikbaar","to":"onderhoud","reason":"Remschijven vervangen"}', NOW() - INTERVAL '2 days'),
('a2000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001',
 'order', '60000000-0000-0000-0000-000000000001', 'created',
 '{"source":"email","confidence":92}', NOW() - INTERVAL '2 hours'),
('a2000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001',
 'order', '60000000-0000-0000-0000-000000000002', 'created',
 '{"source":"email","confidence":78,"priority":"spoed"}', NOW() - INTERVAL '45 minutes'),
('a2000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001',
 'driver', '20000000-0000-0000-0000-000000000002', 'status_change',
 '{"from":"beschikbaar","to":"onderweg","order":"6006"}', NOW() - INTERVAL '3 hours'),
('a2000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001',
 'invoice', '70000000-0000-0000-0000-000000000002', 'created',
 '{"total":1790.80,"client":"Van der Berg Logistics"}', NOW() - INTERVAL '10 days')
ON CONFLICT (id) DO NOTHING;

-- ─── 18. CLIENT EXTRACTION TEMPLATES ────────────────────────
INSERT INTO public.client_extraction_templates (id, tenant_id, client_email, field_mappings, success_count) VALUES
('a3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
 'jan@vdberg-logistics.nl',
 '{"client_name":"Van der Berg Logistics","default_transport_type":"Direct","default_unit":"Europallets"}',
 12),
('a3000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
 'lisa@freshexpress.nl',
 '{"client_name":"Fresh Express BV","default_transport_type":"Direct","default_requirements":["KOELING"],"default_unit":"Europallets"}',
 8),
('a3000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
 'p.smit@chemsolutions.nl',
 '{"client_name":"ChemSolutions Nederland","default_transport_type":"Direct","default_requirements":["ADR"],"default_unit":"Gitterbox"}',
 5)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- PART D: Plan A+B — Tarieven, Kosten, Tijdvensters, Consolidatie
-- ═══════════════════════════════════════════════════════════════

-- ─── D1. RATE CARDS ────────────────────────────────────────────
INSERT INTO public.rate_cards (id, tenant_id, client_id, name, valid_from, valid_until, is_active, currency) VALUES
('70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', NULL,
 'Standaard Tarief', '2026-01-01', NULL, true, 'EUR'),
('70000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001',
 'Van der Berg — Contracttarief', '2026-01-01', '2026-12-31', true, 'EUR'),
('70000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002',
 'Fresh Express — Koeltransport', '2026-01-01', NULL, true, 'EUR'),
('70000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003',
 'ChemSolutions — ADR Tarief', '2026-01-01', NULL, true, 'EUR')
ON CONFLICT (id) DO NOTHING;

-- ─── D2. RATE RULES ───────────────────────────────────────────
INSERT INTO public.rate_rules (id, rate_card_id, rule_type, transport_type, amount, min_amount, conditions, sort_order) VALUES
-- Standaard tarief
('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'PER_KM',       NULL, 1.65,  125.00, '{}', 1),
('71000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', 'PER_STOP',     NULL, 25.00, NULL,   '{}', 2),
('71000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000001', 'PER_PALLET',   NULL, 8.50,  NULL,   '{}', 3),
-- Van der Berg contract
('71000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000002', 'PER_KM',       NULL, 1.85,  150.00, '{}', 1),
('71000000-0000-0000-0000-000000000005', '70000000-0000-0000-0000-000000000002', 'PER_UUR',      NULL, 45.00, NULL,   '{"description":"Wachttijd"}', 2),
('71000000-0000-0000-0000-000000000006', '70000000-0000-0000-0000-000000000002', 'STAFFEL',      NULL, 1.50,  NULL,   '{"weight_from":0,"weight_to":5000}', 3),
('71000000-0000-0000-0000-000000000007', '70000000-0000-0000-0000-000000000002', 'STAFFEL',      NULL, 1.25,  NULL,   '{"weight_from":5000,"weight_to":15000}', 4),
-- Fresh Express koeltransport
('71000000-0000-0000-0000-000000000008', '70000000-0000-0000-0000-000000000003', 'VAST_BEDRAG',  NULL, 285.00, NULL,  '{}', 1),
('71000000-0000-0000-0000-000000000009', '70000000-0000-0000-0000-000000000003', 'PER_PALLET',   NULL, 12.50,  NULL,  '{"description":"Koelpallet toeslag"}', 2),
-- ChemSolutions ADR
('71000000-0000-0000-0000-000000000010', '70000000-0000-0000-0000-000000000004', 'PER_KM',       NULL, 3.20,  250.00, '{}', 1),
('71000000-0000-0000-0000-000000000011', '70000000-0000-0000-0000-000000000004', 'VAST_BEDRAG',  NULL, 75.00, NULL,   '{"description":"ADR documentatie toeslag"}', 2)
ON CONFLICT (id) DO NOTHING;

-- ─── D3. SURCHARGES ───────────────────────────────────────────
INSERT INTO public.surcharges (id, tenant_id, name, surcharge_type, amount, applies_to, is_active) VALUES
('72000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
 'Dieseltoeslag',       'PERCENTAGE',  12.50, '{}', true),
('72000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
 'Weekendtoeslag',      'PERCENTAGE',  25.00, '{"day_of_week":[5,6]}', true),
('72000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
 'ADR-toeslag',         'VAST_BEDRAG', 50.00, '{"requirements":["ADR"]}', true),
('72000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
 'Koeltoeslag',         'PER_KM',       0.35, '{"requirements":["KOELING"]}', true),
('72000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
 'Wachttijd >30 min',   'VAST_BEDRAG', 35.00, '{"waiting_time_above_min":30}', false)
ON CONFLICT (id) DO NOTHING;

-- ─── D4. COST TYPES ──────────────────────────────────────────
INSERT INTO public.cost_types (id, tenant_id, name, category, calculation_method, default_rate, is_active) VALUES
('73000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Brandstof',         'BRANDSTOF',  'PER_KM',      1.89, true),
('73000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Tolkosten',         'TOL',        'PER_RIT',    15.00, true),
('73000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Chauffeurkosten',   'CHAUFFEUR',  'PER_UUR',    32.50, true),
('73000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Voertuigkosten',    'VOERTUIG',   'PER_RIT',   185.00, true),
('73000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Wachtgeld',         'CHAUFFEUR',  'PER_UUR',    45.00, true),
('73000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'Overige kosten',    'OVERIG',     'HANDMATIG',   0.00, true)
ON CONFLICT (id) DO NOTHING;

-- ─── D5. VEHICLE FIXED COSTS ─────────────────────────────────
-- Uses cost_type_id FK referencing cost_types table
INSERT INTO public.vehicle_fixed_costs (id, tenant_id, vehicle_id, cost_type_id, monthly_amount, valid_from) VALUES
('74000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000004', 1850.00, '2026-01-01'),
('74000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000006', 320.00,  '2026-01-01'),
('74000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '73000000-0000-0000-0000-000000000004', 2400.00, '2026-01-01'),
('74000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '73000000-0000-0000-0000-000000000006', 450.00,  '2026-01-01'),
('74000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', '73000000-0000-0000-0000-000000000004', 2100.00, '2026-01-01'),
('74000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', '73000000-0000-0000-0000-000000000006', 350.00,  '2026-01-01')
ON CONFLICT (id) DO NOTHING;

-- ─── D6. LOCATION TIME WINDOWS ───────────────────────────────
INSERT INTO public.location_time_windows (id, client_location_id, tenant_id, day_of_week, open_time, close_time, slot_duration_min, max_concurrent_slots, notes) VALUES
-- Van der Berg Hoofdkantoor (ma-vr 07:00-17:00)
('75000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 1, '07:00', '17:00', 30, 2, 'Max 2 voertuigen tegelijk'),
('75000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 2, '07:00', '17:00', 30, 2, NULL),
('75000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 3, '07:00', '17:00', 30, 2, NULL),
('75000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 4, '07:00', '17:00', 30, 2, NULL),
('75000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 5, '07:00', '17:00', 30, 2, NULL),
-- Fresh Express Veiling (ma-za 05:00-12:00, strakke slots)
('75000000-0000-0000-0000-000000000006', 'e0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 1, '05:00', '12:00', 20, 3, 'Versproducten — stipt op tijd'),
('75000000-0000-0000-0000-000000000007', 'e0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 2, '05:00', '12:00', 20, 3, NULL),
('75000000-0000-0000-0000-000000000008', 'e0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 3, '05:00', '12:00', 20, 3, NULL),
('75000000-0000-0000-0000-000000000009', 'e0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 4, '05:00', '12:00', 20, 3, NULL),
('75000000-0000-0000-0000-000000000010', 'e0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 5, '05:00', '12:00', 20, 3, NULL),
('75000000-0000-0000-0000-000000000011', 'e0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 6, '06:00', '10:00', 20, 2, 'Zaterdag beperkte opening'),
-- AH DC Zaandam (ma-vr 04:00-14:00)
('75000000-0000-0000-0000-000000000012', 'e0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 1, '04:00', '14:00', 30, 4, 'Dock 12-15, aanmelden verplicht'),
('75000000-0000-0000-0000-000000000013', 'e0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 2, '04:00', '14:00', 30, 4, NULL),
('75000000-0000-0000-0000-000000000014', 'e0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 3, '04:00', '14:00', 30, 4, NULL),
('75000000-0000-0000-0000-000000000015', 'e0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 4, '04:00', '14:00', 30, 4, NULL),
('75000000-0000-0000-0000-000000000016', 'e0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 5, '04:00', '14:00', 30, 4, NULL)
ON CONFLICT (id) DO NOTHING;

-- ─── D7. SLOT BOOKINGS (vandaag + morgen) ─────────────────────
INSERT INTO public.slot_bookings (id, tenant_id, client_location_id, order_id, slot_date, slot_start, slot_end, status, notes) VALUES
('76000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
 'e0000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-000000000005',
 CURRENT_DATE, '05:30', '06:00', 'BEVESTIGD', 'Fresh Express koelrit — dock 14'),
('76000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
 'e0000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000004',
 CURRENT_DATE + 1, '08:00', '08:30', 'GEBOEKT', 'Van der Berg pendelrit — ophalen'),
('76000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
 'e0000000-0000-0000-0000-000000000004', NULL,
 CURRENT_DATE + 1, '09:00', '09:30', 'GEBOEKT', 'Gereserveerd slot AH DC')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- DONE! Data summary:
-- ─────────────────────────────────────────────────────────────
--  1 tenant
--  5 clients  + 7 locations + 7 rates
--  6 vehicles + 7 documents + 6 maintenance + 12 availability
--  5 drivers
-- 13 orders   (2 DRAFT, 2 PENDING, 2 PLANNED, 2 IN_TRANSIT, 3 DELIVERED, 1 CANCELLED, 1 thread-update)
--  3 invoices + 10 invoice lines
--  7 notifications
-- 10 AI usage logs
-- 10 activity logs
--  3 client extraction templates
--  5 vehicle types + 6 loading units + 6 requirement types
--  4 rate cards + 11 rate rules
--  5 surcharges
--  6 cost types + 6 vehicle fixed costs
-- 16 location time windows + 3 slot bookings
-- ═══════════════════════════════════════════════════════════════
