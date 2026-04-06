-- ============================================================
-- ORDERFLOW SUITE — REALISTISCHE SEED DATA
-- Draai in Supabase SQL Editor (service role)
-- ============================================================

-- Tenant ID constant
-- 00000000-0000-0000-0000-000000000001 = Royalty Cargo (existing)

-- ─── 1. KLANTEN (10 echte transport klanten) ────────────────

INSERT INTO public.clients (tenant_id, name, address, zipcode, city, country, contact_person, email, phone, kvk_number, btw_number, payment_terms) VALUES
('00000000-0000-0000-0000-000000000001', 'Albert Heijn Distributie', 'Provincialeweg 11', '1506 MA', 'Zaandam', 'NL', 'Jan van Dijk', 'logistiek@ah.nl', '+31756592111', '35012085', 'NL001234567B01', 30),
('00000000-0000-0000-0000-000000000001', 'Jumbo Supermarkten', 'Rijksweg 15', '5462 CE', 'Veghel', 'NL', 'Karin Smeets', 'transport@jumbo.com', '+31413362000', '17155691', 'NL002345678B01', 30),
('00000000-0000-0000-0000-000000000001', 'Bol.com Fulfilment', 'Papendorpseweg 100', '3528 BJ', 'Utrecht', 'NL', 'Thomas Berg', 'warehouse@bol.com', '+31307114400', '50804088', 'NL003456789B01', 14),
('00000000-0000-0000-0000-000000000001', 'DHL Supply Chain', 'Kabelweg 21', '1014 BA', 'Amsterdam', 'NL', 'Fatima El Amrani', 'planning@dhlsc.nl', '+31205621911', '24399601', 'NL004567890B01', 45),
('00000000-0000-0000-0000-000000000001', 'Heineken Nederland', 'Tweede Weteringplantsoen 21', '1017 ZD', 'Amsterdam', 'NL', 'Mark Visser', 'logistics@heineken.nl', '+31205239239', '33011411', 'NL005678901B01', 30),
('00000000-0000-0000-0000-000000000001', 'Bavaria Brouwerij', 'De Stater 1', '5737 RV', 'Lieshout', 'NL', 'Pieter van den Broek', 'transport@bavaria.nl', '+31499428111', '17087704', 'NL006789012B01', 30),
('00000000-0000-0000-0000-000000000001', 'Wehkamp Logistiek', 'Postweg 1', '8025 AH', 'Zwolle', 'NL', 'Linda Groot', 'shipping@wehkamp.nl', '+31384573000', '05073038', 'NL007890123B01', 21),
('00000000-0000-0000-0000-000000000001', 'IKEA Distribution', 'Hullenbergweg 2', '1101 BL', 'Amsterdam', 'NL', 'Erik Svensson', 'dc-nl@ikea.com', '+31203176291', '27154605', 'NL008901234B01', 30),
('00000000-0000-0000-0000-000000000001', 'Carrefour Belgium', 'Avenue des Olympiades 20', '1140', 'Brussel', 'BE', 'Philippe Dupont', 'logistique@carrefour.be', '+3227298211', '0448826918', 'BE0448826918', 45),
('00000000-0000-0000-0000-000000000001', 'Colruyt Group', 'Edingensesteenweg 196', '1500', 'Halle', 'BE', 'Luc Claes', 'transport@colruyt.be', '+3223600900', '0400378485', 'BE0400378485', 30);

-- ─── 2. KLANT LOCATIES ─────────────────────────────────────

INSERT INTO public.client_locations (tenant_id, client_id, label, address, zipcode, city, country, location_type, time_window_start, time_window_end, notes)
SELECT '00000000-0000-0000-0000-000000000001', c.id, loc.label, loc.address, loc.zipcode, loc.city, loc.country, loc.location_type, loc.tw_start, loc.tw_end, loc.notes
FROM public.clients c
CROSS JOIN LATERAL (VALUES
  -- Albert Heijn
  ('Hoofdkantoor Zaandam', 'Provincialeweg 11', '1506 MA', 'Zaandam', 'NL', 'both', '06:00', '22:00', 'Dock 1-8 beschikbaar'),
  ('DC Geldermalsen', 'Achtersteweg 1', '4191 NE', 'Geldermalsen', 'NL', 'delivery', '05:00', '21:00', 'Melden bij portier'),
  ('DC Pijnacker', 'Rijskade 5', '2641 KW', 'Pijnacker', 'NL', 'delivery', '06:00', '20:00', 'Alleen via ingang Zuid')
) AS loc(label, address, zipcode, city, country, location_type, tw_start, tw_end, notes)
WHERE c.name = 'Albert Heijn Distributie';

INSERT INTO public.client_locations (tenant_id, client_id, label, address, zipcode, city, country, location_type, time_window_start, time_window_end, notes)
SELECT '00000000-0000-0000-0000-000000000001', c.id, loc.label, loc.address, loc.zipcode, loc.city, loc.country, loc.location_type, loc.tw_start, loc.tw_end, loc.notes
FROM public.clients c
CROSS JOIN LATERAL (VALUES
  ('DC Veghel', 'Rijksweg 15', '5462 CE', 'Veghel', 'NL', 'both', '05:00', '22:00', 'Badge vereist'),
  ('DC Raalte', 'Koekoekweg 2', '8102 HZ', 'Raalte', 'NL', 'delivery', '06:00', '20:00', NULL),
  ('DC Breda', 'Bijsterhuizen 1204', '4817 HZ', 'Breda', 'NL', 'delivery', '07:00', '19:00', 'Max 18m voertuig')
) AS loc(label, address, zipcode, city, country, location_type, tw_start, tw_end, notes)
WHERE c.name = 'Jumbo Supermarkten';

-- ─── 3. KLANT TARIEVEN ──────────────────────────────────────

INSERT INTO public.client_rates (tenant_id, client_id, rate_type, description, amount)
SELECT '00000000-0000-0000-0000-000000000001', c.id, r.rate_type, r.description, r.amount
FROM public.clients c
CROSS JOIN LATERAL (VALUES
  ('base_rate', 'Basistarief per rit', 85.00),
  ('per_km', 'Kilometertarief', 1.45),
  ('per_pallet', 'Per pallet', 12.50),
  ('per_kg', 'Per kg (boven 1000kg)', 0.08)
) AS r(rate_type, description, amount)
WHERE c.name = 'Albert Heijn Distributie';

INSERT INTO public.client_rates (tenant_id, client_id, rate_type, description, amount)
SELECT '00000000-0000-0000-0000-000000000001', c.id, r.rate_type, r.description, r.amount
FROM public.clients c
CROSS JOIN LATERAL (VALUES
  ('base_rate', 'Basistarief per rit', 95.00),
  ('per_km', 'Kilometertarief', 1.55),
  ('per_pallet', 'Per pallet', 14.00)
) AS r(rate_type, description, amount)
WHERE c.name = 'Jumbo Supermarkten';

INSERT INTO public.client_rates (tenant_id, client_id, rate_type, description, amount)
SELECT '00000000-0000-0000-0000-000000000001', c.id, r.rate_type, r.description, r.amount
FROM public.clients c
CROSS JOIN LATERAL (VALUES
  ('base_rate', 'Basistarief colli', 45.00),
  ('per_kg', 'Per kg', 0.12),
  ('per_km', 'Kilometertarief', 1.35)
) AS r(rate_type, description, amount)
WHERE c.name = 'Bol.com Fulfilment';

INSERT INTO public.client_rates (tenant_id, client_id, rate_type, description, amount)
SELECT '00000000-0000-0000-0000-000000000001', c.id, r.rate_type, r.description, r.amount
FROM public.clients c
CROSS JOIN LATERAL (VALUES
  ('base_rate', 'Basistarief internationaal', 250.00),
  ('per_km', 'Kilometertarief', 1.65),
  ('per_pallet', 'Per pallet', 18.00)
) AS r(rate_type, description, amount)
WHERE c.name = 'Carrefour Belgium';

-- ─── 4. VOERTUIG DOCUMENTEN ─────────────────────────────────

INSERT INTO public.vehicle_documents (tenant_id, vehicle_id, doc_type, expiry_date, notes)
SELECT '00000000-0000-0000-0000-000000000001', v.id, d.doc_type, d.expiry::date, d.notes
FROM public.vehicles v
CROSS JOIN LATERAL (VALUES
  ('APK', '2027-03-15', 'Goedgekeurd zonder opmerkingen'),
  ('Verzekering', '2027-01-01', 'WA + Casco via Achmea'),
  ('Tachograaf', '2027-06-30', 'Digitale tachograaf')
) AS d(doc_type, expiry, notes)
WHERE v.code = 'fv1';

INSERT INTO public.vehicle_documents (tenant_id, vehicle_id, doc_type, expiry_date, notes)
SELECT '00000000-0000-0000-0000-000000000001', v.id, d.doc_type, d.expiry::date, d.notes
FROM public.vehicles v
CROSS JOIN LATERAL (VALUES
  ('APK', '2026-11-20', 'Goedgekeurd'),
  ('Verzekering', '2027-01-01', 'WA + Casco'),
  ('Tachograaf', '2027-04-15', 'Digitale tachograaf'),
  ('ADR-keuring', '2027-09-01', 'Klasse 3 en 8')
) AS d(doc_type, expiry, notes)
WHERE v.code = 'fv4';

-- ─── 5. VOERTUIG ONDERHOUD ──────────────────────────────────

INSERT INTO public.vehicle_maintenance (tenant_id, vehicle_id, maintenance_type, description, mileage_km, scheduled_date, completed_date, cost)
SELECT '00000000-0000-0000-0000-000000000001', v.id, m.mtype, m.desc, m.km, m.sched::date, m.done::date, m.cost
FROM public.vehicles v
CROSS JOIN LATERAL (VALUES
  ('onderhoudsbeurt', 'Grote beurt + olie', 45230, '2026-03-01', '2026-03-01', 485.00),
  ('regulier', 'Banden vernieuwd (4x)', 42100, '2026-01-15', '2026-01-15', 1240.00),
  ('inspectie', 'Remmen gecontroleerd', 48500, '2026-04-10', NULL, NULL)
) AS m(mtype, desc, km, sched, done, cost)
WHERE v.code = 'fv2';

INSERT INTO public.vehicle_maintenance (tenant_id, vehicle_id, maintenance_type, description, mileage_km, scheduled_date, completed_date, cost)
SELECT '00000000-0000-0000-0000-000000000001', v.id, m.mtype, m.desc, m.km, m.sched::date, m.done::date, m.cost
FROM public.vehicles v
CROSS JOIN LATERAL (VALUES
  ('onderhoudsbeurt', 'Koelinstallatie service', 67800, '2026-02-20', '2026-02-20', 890.00),
  ('regulier', 'Olie + filters', 71200, '2026-03-25', '2026-03-25', 320.00)
) AS m(mtype, desc, km, sched, done, cost)
WHERE v.code = 'fv3';

-- ─── 6. ORDERS (30 orders in verschillende statussen) ───────

-- Assign drivers to vehicles first
UPDATE public.drivers SET current_vehicle_id = (SELECT id FROM public.vehicles WHERE code = 'fv1') WHERE name = 'Henk de Vries';
UPDATE public.drivers SET current_vehicle_id = (SELECT id FROM public.vehicles WHERE code = 'fv2') WHERE name = 'Mo Ajam';
UPDATE public.drivers SET current_vehicle_id = (SELECT id FROM public.vehicles WHERE code = 'fv3') WHERE name = 'Sanne Jansen';
UPDATE public.drivers SET current_vehicle_id = (SELECT id FROM public.vehicles WHERE code = 'fv4') WHERE name = 'Piet Pietersen';

-- DRAFT orders (inbox - wachten op review)
INSERT INTO public.orders (tenant_id, status, source_email_from, source_email_subject, source_email_body, confidence_score, transport_type, pickup_address, delivery_address, geocoded_pickup_lat, geocoded_pickup_lng, geocoded_delivery_lat, geocoded_delivery_lng, quantity, unit, weight_kg, dimensions, requirements, client_name, priority, time_window_start, time_window_end, missing_fields, received_at) VALUES
('00000000-0000-0000-0000-000000000001', 'DRAFT', 'logistiek@ah.nl', 'Transport aanvraag 12 pallets Zaandam → Geldermalsen', 'Beste dispatch, Graag 12 europallets ophalen bij ons DC Zaandam (Provincialeweg 11) en afleveren bij DC Geldermalsen (Achtersteweg 1). Gewicht circa 8400kg. Levering uiterlijk morgen voor 14:00. Laadklep vereist.', 92, 'FTL', 'Provincialeweg 11, 1506 MA Zaandam', 'Achtersteweg 1, 4191 NE Geldermalsen', 52.4556, 4.8283, 51.8833, 5.2833, 12, 'Europallets', 8400, '120x80x145 cm', '{"LAADKLEP"}', 'Albert Heijn Distributie', 'hoog', '06:00', '14:00', '{}', NOW() - INTERVAL '2 hours'),

('00000000-0000-0000-0000-000000000001', 'DRAFT', 'transport@jumbo.com', 'Spoedtransport koeling Veghel-Raalte', 'Hallo, Wij hebben dringend een koeltransport nodig van DC Veghel naar DC Raalte. 8 pallets zuivelproducten, temp 2-6°C. Gewicht 4800kg. Vandaag nog leveren a.u.b.', 88, 'FTL', 'Rijksweg 15, 5462 CE Veghel', 'Koekoekweg 2, 8102 HZ Raalte', 51.6167, 5.5333, 52.3833, 6.2667, 8, 'Europallets', 4800, '120x80x145 cm', '{"KOELING"}', 'Jumbo Supermarkten', 'spoed', '08:00', '18:00', '{}', NOW() - INTERVAL '1 hour'),

('00000000-0000-0000-0000-000000000001', 'DRAFT', 'warehouse@bol.com', 'Pakketdistributie Utrecht → Amsterdam', 'Hi, Kunnen jullie 45 colli ophalen bij ons fulfilment center Utrecht en bezorgen bij DHL hub Amsterdam? Totaal 680kg. Graag voor 12:00.', 78, 'LTL', 'Papendorpseweg 100, 3528 BJ Utrecht', 'Kabelweg 21, 1014 BA Amsterdam', 52.0833, 5.1167, 52.3917, 4.8583, 45, 'Colli', 680, NULL, '{}', 'Bol.com Fulfilment', 'normaal', '08:00', '12:00', '{"dimensions"}', NOW() - INTERVAL '45 minutes'),

('00000000-0000-0000-0000-000000000001', 'DRAFT', 'logistics@heineken.nl', 'Biertransport Amsterdam → Brussel', 'Goedemiddag, Wij willen graag 20 pallets Heineken bier verzenden van Amsterdam naar Carrefour DC Brussel. Totaalgewicht 16000kg. ADR niet nodig. Levering over 2 dagen.', 95, 'FTL', 'Tweede Weteringplantsoen 21, 1017 ZD Amsterdam', 'Avenue des Olympiades 20, 1140 Brussel', 52.3600, 4.8900, 50.8500, 4.3500, 20, 'Europallets', 16000, '120x80x145 cm', '{"INTERNATIONAAL"}', 'Heineken Nederland', 'normaal', '07:00', '17:00', '{}', NOW() - INTERVAL '30 minutes'),

('00000000-0000-0000-0000-000000000001', 'DRAFT', 'shipping@wehkamp.nl', 'Retourzending Zwolle', 'Beste, 15 colli retouren ophalen bij ons DC Zwolle, bezorgen bij leverancier in Almere. 230kg totaal. Geen haast.', 65, 'LTL', 'Postweg 1, 8025 AH Zwolle', 'Markerkant 10-12, 1314 AN Almere', 52.5167, 6.0833, 52.3667, 5.2167, 15, 'Colli', 230, NULL, '{}', 'Wehkamp Logistiek', 'laag', NULL, NULL, '{"time_window_start","time_window_end"}', NOW() - INTERVAL '15 minutes');

-- CONFIRMED orders (goedgekeurd, wachten op planning)
INSERT INTO public.orders (tenant_id, status, confidence_score, transport_type, pickup_address, delivery_address, geocoded_pickup_lat, geocoded_pickup_lng, geocoded_delivery_lat, geocoded_delivery_lng, quantity, unit, weight_kg, dimensions, requirements, client_name, priority, time_window_start, time_window_end, received_at) VALUES
('00000000-0000-0000-0000-000000000001', 'CONFIRMED', 97, 'FTL', 'De Stater 1, 5737 RV Lieshout', 'Bijsterhuizen 1204, 4817 HZ Breda', 51.5167, 5.6167, 51.5833, 4.7667, 14, 'Europallets', 9800, '120x80x145 cm', '{}', 'Bavaria Brouwerij', 'normaal', '08:00', '16:00', NOW() - INTERVAL '1 day'),
('00000000-0000-0000-0000-000000000001', 'CONFIRMED', 94, 'LTL', 'Hullenbergweg 2, 1101 BL Amsterdam', 'Provincialeweg 11, 1506 MA Zaandam', 52.3117, 4.9433, 52.4556, 4.8283, 6, 'Europallets', 3600, '120x80x145 cm', '{"LAADKLEP"}', 'IKEA Distribution', 'normaal', '09:00', '17:00', NOW() - INTERVAL '1 day'),
('00000000-0000-0000-0000-000000000001', 'CONFIRMED', 91, 'FTL', 'Papendorpseweg 100, 3528 BJ Utrecht', 'Edingensesteenweg 196, 1500 Halle', 52.0833, 5.1167, 50.7333, 4.2333, 10, 'Europallets', 7500, '120x80x145 cm', '{"INTERNATIONAAL"}', 'Bol.com Fulfilment', 'hoog', '06:00', '14:00', NOW() - INTERVAL '18 hours');

-- PLANNED orders (ingepland op voertuig)
INSERT INTO public.orders (tenant_id, status, confidence_score, transport_type, pickup_address, delivery_address, geocoded_pickup_lat, geocoded_pickup_lng, geocoded_delivery_lat, geocoded_delivery_lng, quantity, unit, weight_kg, dimensions, requirements, client_name, vehicle_id, driver_id, priority, time_window_start, time_window_end, received_at) VALUES
('00000000-0000-0000-0000-000000000001', 'PLANNED', 96, 'FTL', 'Rijksweg 15, 5462 CE Veghel', 'Provincialeweg 11, 1506 MA Zaandam', 51.6167, 5.5333, 52.4556, 4.8283, 16, 'Europallets', 11200, '120x80x145 cm', '{"LAADKLEP"}', 'Jumbo Supermarkten', (SELECT id FROM vehicles WHERE code='fv2'), (SELECT id FROM drivers WHERE name='Mo Ajam'), 'hoog', '07:00', '15:00', NOW() - INTERVAL '2 days'),
('00000000-0000-0000-0000-000000000001', 'PLANNED', 93, 'FTL', 'Tweede Weteringplantsoen 21, 1017 ZD Amsterdam', 'Koekoekweg 2, 8102 HZ Raalte', 52.3600, 4.8900, 52.3833, 6.2667, 10, 'Europallets', 7000, '120x80x145 cm', '{"KOELING"}', 'Heineken Nederland', (SELECT id FROM vehicles WHERE code='fv3'), (SELECT id FROM drivers WHERE name='Sanne Jansen'), 'normaal', '08:00', '18:00', NOW() - INTERVAL '2 days');

-- IN_TRANSIT orders (onderweg)
INSERT INTO public.orders (tenant_id, status, confidence_score, transport_type, pickup_address, delivery_address, geocoded_pickup_lat, geocoded_pickup_lng, geocoded_delivery_lat, geocoded_delivery_lng, quantity, unit, weight_kg, dimensions, requirements, client_name, vehicle_id, driver_id, priority, time_window_start, time_window_end, received_at) VALUES
('00000000-0000-0000-0000-000000000001', 'IN_TRANSIT', 98, 'FTL', 'De Stater 1, 5737 RV Lieshout', 'Avenue des Olympiades 20, 1140 Brussel', 51.5167, 5.6167, 50.8500, 4.3500, 22, 'Europallets', 15400, '120x80x145 cm', '{"INTERNATIONAAL"}', 'Bavaria Brouwerij', (SELECT id FROM vehicles WHERE code='fv4'), (SELECT id FROM drivers WHERE name='Piet Pietersen'), 'hoog', '06:00', '16:00', NOW() - INTERVAL '3 days'),
('00000000-0000-0000-0000-000000000001', 'IN_TRANSIT', 95, 'LTL', 'Hullenbergweg 2, 1101 BL Amsterdam', 'Postweg 1, 8025 AH Zwolle', 52.3117, 4.9433, 52.5167, 6.0833, 4, 'Europallets', 2400, '120x80x145 cm', '{}', 'IKEA Distribution', (SELECT id FROM vehicles WHERE code='fv1'), (SELECT id FROM drivers WHERE name='Henk de Vries'), 'normaal', '09:00', '17:00', NOW() - INTERVAL '1 day');

-- DELIVERED orders (afgeleverd)
INSERT INTO public.orders (tenant_id, status, confidence_score, transport_type, pickup_address, delivery_address, geocoded_pickup_lat, geocoded_pickup_lng, geocoded_delivery_lat, geocoded_delivery_lng, quantity, unit, weight_kg, dimensions, requirements, client_name, vehicle_id, driver_id, priority, time_window_start, time_window_end, received_at, invoice_ref) VALUES
('00000000-0000-0000-0000-000000000001', 'DELIVERED', 99, 'FTL', 'Provincialeweg 11, 1506 MA Zaandam', 'Rijskade 5, 2641 KW Pijnacker', 52.4556, 4.8283, 52.0167, 4.4333, 18, 'Europallets', 12600, '120x80x145 cm', '{"LAADKLEP"}', 'Albert Heijn Distributie', (SELECT id FROM vehicles WHERE code='fv2'), (SELECT id FROM drivers WHERE name='Mo Ajam'), 'normaal', '06:00', '14:00', NOW() - INTERVAL '5 days', 'RC-2026-0004'),
('00000000-0000-0000-0000-000000000001', 'DELIVERED', 97, 'FTL', 'Rijksweg 15, 5462 CE Veghel', 'Achtersteweg 1, 4191 NE Geldermalsen', 51.6167, 5.5333, 51.8833, 5.2833, 20, 'Europallets', 14000, '120x80x145 cm', '{}', 'Jumbo Supermarkten', (SELECT id FROM vehicles WHERE code='fv2'), (SELECT id FROM drivers WHERE name='Mo Ajam'), 'hoog', '05:00', '12:00', NOW() - INTERVAL '7 days', 'RC-2026-0005'),
('00000000-0000-0000-0000-000000000001', 'DELIVERED', 96, 'LTL', 'Papendorpseweg 100, 3528 BJ Utrecht', 'Kabelweg 21, 1014 BA Amsterdam', 52.0833, 5.1167, 52.3917, 4.8583, 30, 'Colli', 450, NULL, '{}', 'Bol.com Fulfilment', (SELECT id FROM vehicles WHERE code='fv1'), (SELECT id FROM drivers WHERE name='Henk de Vries'), 'normaal', '08:00', '12:00', NOW() - INTERVAL '4 days', 'RC-2026-0006'),
('00000000-0000-0000-0000-000000000001', 'DELIVERED', 98, 'FTL', 'Tweede Weteringplantsoen 21, 1017 ZD Amsterdam', 'Edingensesteenweg 196, 1500 Halle', 52.3600, 4.8900, 50.7333, 4.2333, 24, 'Europallets', 19200, '120x80x145 cm', '{"INTERNATIONAAL"}', 'Heineken Nederland', (SELECT id FROM vehicles WHERE code='fv4'), (SELECT id FROM drivers WHERE name='Piet Pietersen'), 'hoog', '06:00', '18:00', NOW() - INTERVAL '6 days', 'RC-2026-0007'),
('00000000-0000-0000-0000-000000000001', 'DELIVERED', 94, 'FTL', 'De Stater 1, 5737 RV Lieshout', 'Rijksweg 15, 5462 CE Veghel', 51.5167, 5.6167, 51.6167, 5.5333, 8, 'Europallets', 5600, '120x80x145 cm', '{}', 'Bavaria Brouwerij', (SELECT id FROM vehicles WHERE code='fv2'), (SELECT id FROM drivers WHERE name='Mo Ajam'), 'normaal', '08:00', '16:00', NOW() - INTERVAL '3 days', 'RC-2026-0008'),
('00000000-0000-0000-0000-000000000001', 'DELIVERED', 92, 'LTL', 'Hullenbergweg 2, 1101 BL Amsterdam', 'Markerkant 10-12, 1314 AN Almere', 52.3117, 4.9433, 52.3667, 5.2167, 5, 'Colli', 320, NULL, '{}', 'IKEA Distribution', (SELECT id FROM vehicles WHERE code='fv1'), (SELECT id FROM drivers WHERE name='Henk de Vries'), 'laag', '10:00', '18:00', NOW() - INTERVAL '8 days', 'RC-2026-0009'),
('00000000-0000-0000-0000-000000000001', 'DELIVERED', 100, 'FTL', 'Edingensesteenweg 196, 1500 Halle', 'Provincialeweg 11, 1506 MA Zaandam', 50.7333, 4.2333, 52.4556, 4.8283, 15, 'Europallets', 10500, '120x80x145 cm', '{"INTERNATIONAAL","LAADKLEP"}', 'Colruyt Group', (SELECT id FROM vehicles WHERE code='fv4'), (SELECT id FROM drivers WHERE name='Piet Pietersen'), 'normaal', '07:00', '19:00', NOW() - INTERVAL '10 days', 'RC-2026-0010'),
('00000000-0000-0000-0000-000000000001', 'DELIVERED', 93, 'FTL', 'Postweg 1, 8025 AH Zwolle', 'Hullenbergweg 2, 1101 BL Amsterdam', 52.5167, 6.0833, 52.3117, 4.9433, 12, 'Europallets', 8400, '120x80x145 cm', '{}', 'Wehkamp Logistiek', (SELECT id FROM vehicles WHERE code='fv2'), (SELECT id FROM drivers WHERE name='Mo Ajam'), 'normaal', '06:00', '15:00', NOW() - INTERVAL '9 days', 'RC-2026-0011');

-- CANCELLED order
INSERT INTO public.orders (tenant_id, status, confidence_score, transport_type, pickup_address, delivery_address, quantity, unit, weight_kg, client_name, priority, received_at, internal_note) VALUES
('00000000-0000-0000-0000-000000000001', 'CANCELLED', 85, 'LTL', 'Kabelweg 21, 1014 BA Amsterdam', 'Postweg 1, 8025 AH Zwolle', 3, 'Europallets', 1800, 'DHL Supply Chain', 'normaal', NOW() - INTERVAL '4 days', 'Geannuleerd door klant — dubbele aanvraag');

-- ─── 7. NOTIFICATIES ────────────────────────────────────────

INSERT INTO public.notifications (tenant_id, type, title, message, icon, is_read) VALUES
('00000000-0000-0000-0000-000000000001', 'info', 'Nieuwe order ontvangen', 'Albert Heijn Distributie heeft een transport aangevraagd: 12 pallets Zaandam → Geldermalsen', 'package', false),
('00000000-0000-0000-0000-000000000001', 'warning', 'SLA risico', 'Order van Jumbo Supermarkten (spoedtransport koeling) heeft nog geen voertuig toegewezen', 'alert-triangle', false),
('00000000-0000-0000-0000-000000000001', 'success', 'Order afgeleverd', 'Rit naar Pijnacker (Albert Heijn) is succesvol afgeleverd door Mo Ajam', 'check-circle', true),
('00000000-0000-0000-0000-000000000001', 'info', 'AI extractie voltooid', 'Heineken order automatisch geëxtraheerd met 95% confidence — wacht op review', 'bot', false),
('00000000-0000-0000-0000-000000000001', 'warning', 'Voertuig onderhoud', 'Bakwagen 02 (NL-BK-02) heeft een remmeninspectie gepland op 10 april', 'wrench', false),
('00000000-0000-0000-0000-000000000001', 'success', 'Factuur betaald', 'Factuur RC-2026-0005 van Jumbo Supermarkten is betaald (€ 2.340,00)', 'euro', true),
('00000000-0000-0000-0000-000000000001', 'info', 'Koeltransport bevestigd', 'Sanne Jansen heeft de koelrit Heineken (Amsterdam → Raalte) geaccepteerd', 'snowflake', false),
('00000000-0000-0000-0000-000000000001', 'error', 'GPS signaal verloren', 'Trekker 04 (NL-TK-04) heeft al 15 minuten geen GPS signaal — laatst gezien op A4 bij Leiden', 'map-pin', false);

-- ─── 8. AI DECISIONS (Confidence Store) ──────────────────────

INSERT INTO public.ai_decisions (tenant_id, decision_type, entity_type, confidence_score, field_confidences, ai_suggestion, final_values, was_auto_approved, was_corrected, correction_summary, outcome, processing_time_ms, model_version, resolved_at) VALUES
('00000000-0000-0000-0000-000000000001', 'order_extraction', 'order', 92.00, '{"client_name":98,"pickup_address":95,"delivery_address":93,"quantity":90,"weight_kg":88,"unit":95,"requirements":85,"time_window":80}', '{"client_name":"Albert Heijn Distributie","quantity":12,"unit":"Europallets","weight_kg":8400}', '{"client_name":"Albert Heijn Distributie","quantity":12,"unit":"Europallets","weight_kg":8400}', false, false, NULL, 'accepted', 1230, 'gemini-2.5-flash', NOW() - INTERVAL '2 hours'),
('00000000-0000-0000-0000-000000000001', 'order_extraction', 'order', 88.00, '{"client_name":95,"pickup_address":90,"delivery_address":88,"quantity":92,"weight_kg":85,"unit":90,"requirements":82,"time_window":75}', '{"client_name":"Jumbo Supermarkten","quantity":8,"weight_kg":4800,"requirements":["KOELING"]}', '{"client_name":"Jumbo Supermarkten","quantity":8,"weight_kg":4800,"requirements":["KOELING"]}', false, false, NULL, 'accepted', 980, 'gemini-2.5-flash', NOW() - INTERVAL '1 hour'),
('00000000-0000-0000-0000-000000000001', 'order_extraction', 'order', 78.00, '{"client_name":90,"pickup_address":85,"delivery_address":80,"quantity":75,"weight_kg":70,"unit":65}', '{"client_name":"Bol.com","quantity":45,"unit":"Colli","weight_kg":680}', '{"client_name":"Bol.com Fulfilment","quantity":45,"unit":"Colli","weight_kg":680}', false, true, '{"client_name":{"old":"Bol.com","new":"Bol.com Fulfilment"}}', 'corrected', 1450, 'gemini-2.5-flash', NOW() - INTERVAL '45 minutes'),
('00000000-0000-0000-0000-000000000001', 'order_extraction', 'order', 95.00, '{"client_name":99,"pickup_address":97,"delivery_address":95,"quantity":93,"weight_kg":92,"unit":98,"requirements":88}', '{"client_name":"Heineken Nederland","quantity":20,"weight_kg":16000}', '{"client_name":"Heineken Nederland","quantity":20,"weight_kg":16000}', true, false, NULL, 'accepted', 870, 'gemini-2.5-flash', NOW() - INTERVAL '30 minutes'),
('00000000-0000-0000-0000-000000000001', 'order_extraction', 'order', 65.00, '{"client_name":80,"pickup_address":70,"delivery_address":55,"quantity":60,"weight_kg":65}', '{"client_name":"Wehkamp","quantity":15,"delivery_address":"Almere"}', '{"client_name":"Wehkamp Logistiek","quantity":15,"delivery_address":"Markerkant 10-12, 1314 AN Almere"}', false, true, '{"client_name":{"old":"Wehkamp","new":"Wehkamp Logistiek"},"delivery_address":{"old":"Almere","new":"Markerkant 10-12, 1314 AN Almere"}}', 'corrected', 1680, 'gemini-2.5-flash', NOW() - INTERVAL '15 minutes'),
-- Older decisions for learning curve
('00000000-0000-0000-0000-000000000001', 'order_extraction', 'order', 99.00, '{"client_name":100,"pickup_address":99,"delivery_address":98,"quantity":100,"weight_kg":97}', '{"client_name":"Albert Heijn Distributie","quantity":18}', '{"client_name":"Albert Heijn Distributie","quantity":18}', true, false, NULL, 'accepted', 650, 'gemini-2.5-flash', NOW() - INTERVAL '5 days'),
('00000000-0000-0000-0000-000000000001', 'order_extraction', 'order', 97.00, '{"client_name":99,"pickup_address":96,"delivery_address":95,"quantity":98}', '{"client_name":"Jumbo Supermarkten","quantity":20}', '{"client_name":"Jumbo Supermarkten","quantity":20}', true, false, NULL, 'accepted', 720, 'gemini-2.5-flash', NOW() - INTERVAL '7 days'),
('00000000-0000-0000-0000-000000000001', 'order_extraction', 'order', 100.00, '{"client_name":100,"pickup_address":100,"delivery_address":100,"quantity":100,"weight_kg":100}', '{"client_name":"Colruyt Group","quantity":15}', '{"client_name":"Colruyt Group","quantity":15}', true, false, NULL, 'accepted', 580, 'gemini-2.5-flash', NOW() - INTERVAL '10 days'),
('00000000-0000-0000-0000-000000000001', 'order_extraction', 'order', 72.00, '{"client_name":75,"pickup_address":80,"delivery_address":60,"quantity":70}', '{"client_name":"Bol.com","quantity":30}', '{"client_name":"Bol.com Fulfilment","quantity":30,"delivery_address":"Kabelweg 21, 1014 BA Amsterdam"}', false, true, '{"client_name":{"old":"Bol.com","new":"Bol.com Fulfilment"}}', 'corrected', 1520, 'gemini-2.5-flash', NOW() - INTERVAL '4 days'),
('00000000-0000-0000-0000-000000000001', 'dispatch_auto', 'trip', 91.00, '{}', '{"vehicle":"fv2","driver":"Mo Ajam","route":["Veghel","Zaandam"]}', '{"vehicle":"fv2","driver":"Mo Ajam","route":["Veghel","Zaandam"]}', true, false, NULL, 'accepted', 340, 'system', NOW() - INTERVAL '2 days');

-- ─── 9. CONFIDENCE METRICS ──────────────────────────────────

INSERT INTO public.confidence_metrics (tenant_id, client_id, decision_type, period_start, period_end, total_decisions, auto_approved_count, corrected_count, rejected_count, avg_confidence, avg_correction_delta, automation_rate) VALUES
('00000000-0000-0000-0000-000000000001', (SELECT id FROM clients WHERE name='Albert Heijn Distributie'), 'order_extraction', '2026-03-01', '2026-03-31', 28, 24, 3, 1, 94.50, 3.20, 85.71),
('00000000-0000-0000-0000-000000000001', (SELECT id FROM clients WHERE name='Jumbo Supermarkten'), 'order_extraction', '2026-03-01', '2026-03-31', 22, 18, 4, 0, 91.20, 5.10, 81.82),
('00000000-0000-0000-0000-000000000001', (SELECT id FROM clients WHERE name='Bol.com Fulfilment'), 'order_extraction', '2026-03-01', '2026-03-31', 35, 20, 12, 3, 82.30, 8.70, 57.14),
('00000000-0000-0000-0000-000000000001', (SELECT id FROM clients WHERE name='Heineken Nederland'), 'order_extraction', '2026-03-01', '2026-03-31', 15, 13, 2, 0, 96.10, 2.40, 86.67),
('00000000-0000-0000-0000-000000000001', (SELECT id FROM clients WHERE name='Colruyt Group'), 'order_extraction', '2026-03-01', '2026-03-31', 12, 11, 1, 0, 97.80, 1.50, 91.67),
('00000000-0000-0000-0000-000000000001', NULL, 'order_extraction', '2026-04-01', '2026-04-06', 10, 6, 3, 1, 87.40, 6.30, 60.00);

-- ─── 10. ORDER EVENTS (Pipeline) ────────────────────────────

INSERT INTO public.order_events (tenant_id, order_id, event_type, event_data, actor_type, confidence_score, duration_since_previous_ms, created_at)
SELECT '00000000-0000-0000-0000-000000000001', o.id, e.event_type, e.event_data::jsonb, e.actor_type, e.confidence, e.duration, o.received_at + e.offset::interval
FROM public.orders o
CROSS JOIN LATERAL (VALUES
  ('email_received', '{"subject":"Transport aanvraag","from":"logistiek@ah.nl"}', 'system', NULL::numeric, NULL::bigint, '0 seconds'),
  ('ai_extraction_started', '{}', 'ai', NULL, NULL, '2 seconds'),
  ('ai_extraction_completed', '{"fields_extracted":8}', 'ai', 92.0, 1230, '3 seconds'),
  ('planner_approved', '{"corrections":0}', 'planner', NULL, 120000, '5 minutes')
) AS e(event_type, event_data, actor_type, confidence, duration, offset)
WHERE o.source_email_from = 'logistiek@ah.nl' AND o.status = 'DRAFT'
LIMIT 4;

-- Events for delivered orders
INSERT INTO public.order_events (tenant_id, order_id, event_type, event_data, actor_type, confidence_score, duration_since_previous_ms, created_at)
SELECT '00000000-0000-0000-0000-000000000001', o.id, e.event_type, e.event_data::jsonb, e.actor_type, e.confidence, e.duration, o.received_at + e.offset::interval
FROM public.orders o
CROSS JOIN LATERAL (VALUES
  ('email_received', '{"subject":"Transport"}', 'system', NULL::numeric, NULL::bigint, '0 seconds'),
  ('ai_extraction_completed', '{"fields_extracted":8}', 'ai', 99.0, 980, '2 seconds'),
  ('planner_approved', '{}', 'planner', NULL, 60000, '1 minute'),
  ('order_planned', '{"vehicle":"fv2"}', 'planner', NULL, 3600000, '1 hour'),
  ('trip_dispatched', '{"driver":"Mo Ajam"}', 'system', NULL, 7200000, '3 hours'),
  ('order_delivered', '{"pod_uploaded":true}', 'chauffeur', NULL, 28800000, '11 hours'),
  ('invoice_generated', '{"invoice_ref":"RC-2026-0004"}', 'system', NULL, 3600000, '12 hours')
) AS e(event_type, event_data, actor_type, confidence, duration, offset)
WHERE o.invoice_ref = 'RC-2026-0004';

-- ─── 11. ANOMALIES ──────────────────────────────────────────

INSERT INTO public.anomalies (tenant_id, category, type, severity, entity_type, title, description, suggested_action, auto_resolvable, data) VALUES
('00000000-0000-0000-0000-000000000001', 'pricing', 'unusual_price', 'warning', 'order', 'Ongebruikelijk hoog gewicht', 'Order van Heineken Nederland heeft 16.000kg — 40% boven het gemiddelde voor deze klant', 'Controleer of het gewicht klopt met de pakbon', false, '{"weight_kg":16000,"avg_weight":11000,"deviation_pct":45}'),
('00000000-0000-0000-0000-000000000001', 'timing', 'stale_order', 'warning', 'order', 'Order staat al 3 dagen in concept', 'Wehkamp retourzending is aangemaakt maar nog niet bevestigd', 'Neem contact op met Wehkamp of keur de order goed', true, '{"hours_in_draft":72}'),
('00000000-0000-0000-0000-000000000001', 'compliance', 'drive_time_violation', 'critical', 'driver', 'Rijtijdoverschrijding dreigt', 'Piet Pietersen rijdt al 4 uur zonder pauze op route Lieshout → Brussel', 'Plan een rustpauze in bij volgende tankstation', false, '{"driver":"Piet Pietersen","hours_driving":4.0,"max_allowed":4.5}'),
('00000000-0000-0000-0000-000000000001', 'pattern', 'repeat_correction', 'info', 'order', 'AI herhaalt dezelfde fout', 'Bol.com orders: klantnaam wordt consistent als "Bol.com" geëxtraheerd i.p.v. "Bol.com Fulfilment" — 4 correcties in 2 weken', 'Voeg "Bol.com Fulfilment" toe aan client extraction template', true, '{"field":"client_name","corrections":4,"client":"Bol.com Fulfilment"}'),
('00000000-0000-0000-0000-000000000001', 'timing', 'late_delivery', 'critical', 'order', 'SLA risico: IKEA levering', 'Order IKEA Distribution (Amsterdam → Zwolle) is al 6 uur onderweg voor een rit van 1,5 uur', 'Neem contact op met chauffeur Henk de Vries', false, '{"expected_hours":1.5,"actual_hours":6}'),
('00000000-0000-0000-0000-000000000001', 'capacity', 'capacity_exceeded', 'warning', 'vehicle', 'Voertuig bijna vol', 'Bakwagen 02 is ingepland met 11.200kg terwijl capaciteit 12.000kg is (93%)', 'Overweeg om orders te spreiden over meerdere ritten', false, '{"vehicle":"Bakwagen 02","load_kg":11200,"capacity_kg":12000,"utilization_pct":93}');

-- ─── 12. DISRUPTIONS + REPLAN SUGGESTIONS ───────────────────

INSERT INTO public.disruptions (tenant_id, type, severity, affected_vehicle_id, description, auto_resolved, resolution_summary) VALUES
('00000000-0000-0000-0000-000000000001', 'traffic_delay', 'medium', (SELECT id FROM vehicles WHERE code='fv4'), 'File op A4 bij Leiden richting België — verwachte vertraging 45 minuten', false, NULL),
('00000000-0000-0000-0000-000000000001', 'vehicle_breakdown', 'high', (SELECT id FROM vehicles WHERE code='fv1'), 'Busje 01 meldt waarschuwingslampje motor — mogelijk niet inzetbaar morgen', false, NULL),
('00000000-0000-0000-0000-000000000001', 'order_cancelled', 'low', NULL, 'DHL Supply Chain order geannuleerd — dubbele aanvraag', true, '{"action":"removed_from_plan","freed_capacity":"3 pallets"}');

INSERT INTO public.replan_suggestions (tenant_id, disruption_id, description, confidence, impact, actions, status)
SELECT '00000000-0000-0000-0000-000000000001', d.id,
  'Alternatieve route via A27/E19 vermijdt file — geschatte besparing 30 minuten',
  82.00,
  '{"timeSavedMinutes":30,"costDelta":15,"affectedStops":0}'::jsonb,
  '[{"type":"reorder_stops","details":{"new_route":"A27-E19"}}]'::jsonb,
  'pending'
FROM disruptions d WHERE d.type = 'traffic_delay' LIMIT 1;

INSERT INTO public.replan_suggestions (tenant_id, disruption_id, description, confidence, impact, actions, status)
SELECT '00000000-0000-0000-0000-000000000001', d.id,
  'Herverdeel orders van Busje 01 naar Bakwagen 02 (heeft nog 800kg capaciteit over)',
  75.00,
  '{"timeSavedMinutes":0,"costDelta":45,"affectedStops":2}'::jsonb,
  '[{"type":"reassign_order","fromTripId":null,"toTripId":null,"details":{"from_vehicle":"fv1","to_vehicle":"fv2"}}]'::jsonb,
  'pending'
FROM disruptions d WHERE d.type = 'vehicle_breakdown' LIMIT 1;

-- ─── 13. VEHICLE POSITIONS (GPS tracking data) ──────────────

INSERT INTO public.vehicle_positions (tenant_id, vehicle_id, driver_id, lat, lng, heading, speed, accuracy, recorded_at) VALUES
-- Trekker 04 op route Lieshout → Brussel (op A2/E25)
('00000000-0000-0000-0000-000000000001', (SELECT id FROM vehicles WHERE code='fv4'), (SELECT id FROM drivers WHERE name='Piet Pietersen'), 51.4200, 5.4800, 210.0, 85.50, 3.2, NOW() - INTERVAL '60 minutes'),
('00000000-0000-0000-0000-000000000001', (SELECT id FROM vehicles WHERE code='fv4'), (SELECT id FROM drivers WHERE name='Piet Pietersen'), 51.3100, 5.3200, 215.0, 92.30, 2.8, NOW() - INTERVAL '45 minutes'),
('00000000-0000-0000-0000-000000000001', (SELECT id FROM vehicles WHERE code='fv4'), (SELECT id FROM drivers WHERE name='Piet Pietersen'), 51.1800, 5.1500, 220.0, 88.70, 3.5, NOW() - INTERVAL '30 minutes'),
('00000000-0000-0000-0000-000000000001', (SELECT id FROM vehicles WHERE code='fv4'), (SELECT id FROM drivers WHERE name='Piet Pietersen'), 51.0500, 4.9200, 225.0, 45.00, 4.1, NOW() - INTERVAL '15 minutes'),
('00000000-0000-0000-0000-000000000001', (SELECT id FROM vehicles WHERE code='fv4'), (SELECT id FROM drivers WHERE name='Piet Pietersen'), 50.9800, 4.7100, 230.0, 78.20, 3.0, NOW()),
-- Busje 01 op route Amsterdam → Zwolle (op A1)
('00000000-0000-0000-0000-000000000001', (SELECT id FROM vehicles WHERE code='fv1'), (SELECT id FROM drivers WHERE name='Henk de Vries'), 52.3500, 5.0200, 45.0, 95.00, 2.5, NOW() - INTERVAL '45 minutes'),
('00000000-0000-0000-0000-000000000001', (SELECT id FROM vehicles WHERE code='fv1'), (SELECT id FROM drivers WHERE name='Henk de Vries'), 52.3800, 5.3500, 50.0, 102.30, 2.1, NOW() - INTERVAL '30 minutes'),
('00000000-0000-0000-0000-000000000001', (SELECT id FROM vehicles WHERE code='fv1'), (SELECT id FROM drivers WHERE name='Henk de Vries'), 52.4200, 5.7100, 55.0, 98.50, 2.8, NOW() - INTERVAL '15 minutes'),
('00000000-0000-0000-0000-000000000001', (SELECT id FROM vehicles WHERE code='fv1'), (SELECT id FROM drivers WHERE name='Henk de Vries'), 52.4600, 5.9500, 48.0, 88.00, 3.2, NOW());

-- ─── 14. AI USAGE LOG ───────────────────────────────────────

INSERT INTO public.ai_usage_log (tenant_id, function_name, model, input_tokens, output_tokens, cost_estimate) VALUES
('00000000-0000-0000-0000-000000000001', 'extract_order_fields', 'gemini-2.5-flash', 1250, 480, 0.000340),
('00000000-0000-0000-0000-000000000001', 'extract_order_fields', 'gemini-2.5-flash', 980, 420, 0.000280),
('00000000-0000-0000-0000-000000000001', 'extract_order_fields', 'gemini-2.5-flash', 1450, 550, 0.000400),
('00000000-0000-0000-0000-000000000001', 'extract_order_fields', 'gemini-2.5-flash', 870, 380, 0.000250),
('00000000-0000-0000-0000-000000000001', 'extract_order_fields', 'gemini-2.5-flash', 1680, 620, 0.000460),
('00000000-0000-0000-0000-000000000001', 'generate_follow_up', 'gemini-2.5-flash', 650, 280, 0.000186),
('00000000-0000-0000-0000-000000000001', 'extract_order_fields', 'gemini-2.5-flash', 1100, 450, 0.000310),
('00000000-0000-0000-0000-000000000001', 'extract_order_fields', 'gemini-2.5-flash', 920, 390, 0.000262),
('00000000-0000-0000-0000-000000000001', 'extract_order_fields', 'gemini-2.5-flash', 1350, 510, 0.000372),
('00000000-0000-0000-0000-000000000001', 'extract_order_fields', 'gemini-2.5-flash', 780, 340, 0.000224);

-- ─── 15. ACTIVITY LOG ───────────────────────────────────────

INSERT INTO public.activity_log (tenant_id, entity_type, entity_id, action, changes) VALUES
('00000000-0000-0000-0000-000000000001', 'order', gen_random_uuid(), 'create', '{"status":"DRAFT","client":"Albert Heijn Distributie"}'),
('00000000-0000-0000-0000-000000000001', 'order', gen_random_uuid(), 'update', '{"status":{"old":"DRAFT","new":"CONFIRMED"}}'),
('00000000-0000-0000-0000-000000000001', 'order', gen_random_uuid(), 'update', '{"status":{"old":"CONFIRMED","new":"PLANNED"},"vehicle":"Bakwagen 02"}'),
('00000000-0000-0000-0000-000000000001', 'vehicle', gen_random_uuid(), 'update', '{"status":{"old":"beschikbaar","new":"bezet"}}'),
('00000000-0000-0000-0000-000000000001', 'driver', gen_random_uuid(), 'update', '{"status":{"old":"beschikbaar","new":"bezet"},"vehicle":"fv2"}'),
('00000000-0000-0000-0000-000000000001', 'order', gen_random_uuid(), 'update', '{"status":{"old":"IN_TRANSIT","new":"DELIVERED"},"pod":"uploaded"}');

-- ─── 16. CLIENT EXTRACTION TEMPLATES ────────────────────────

INSERT INTO public.client_extraction_templates (tenant_id, client_email, field_mappings, success_count) VALUES
('00000000-0000-0000-0000-000000000001', 'logistiek@ah.nl', '{"client_name":"Albert Heijn Distributie","default_unit":"Europallets","pickup_pattern":"DC Zaandam|Provincialeweg","requirements":["LAADKLEP"]}', 28),
('00000000-0000-0000-0000-000000000001', 'transport@jumbo.com', '{"client_name":"Jumbo Supermarkten","default_unit":"Europallets","pickup_pattern":"DC Veghel|Rijksweg"}', 22),
('00000000-0000-0000-0000-000000000001', 'warehouse@bol.com', '{"client_name":"Bol.com Fulfilment","default_unit":"Colli","pickup_pattern":"Papendorpseweg"}', 35),
('00000000-0000-0000-0000-000000000001', 'logistics@heineken.nl', '{"client_name":"Heineken Nederland","default_unit":"Europallets","pickup_pattern":"Weteringplantsoen"}', 15),
('00000000-0000-0000-0000-000000000001', 'logistique@carrefour.be', '{"client_name":"Carrefour Belgium","default_unit":"Europallets","country":"BE"}', 8),
('00000000-0000-0000-0000-000000000001', 'transport@colruyt.be', '{"client_name":"Colruyt Group","default_unit":"Europallets","country":"BE"}', 12);
