-- ══════════════════════════════════════════════════════════════════════════
-- Sprint 2. Seed voor Royalty Cargo.
--
-- Migreert de hardcoded VEHICLE_MATRIX uit NewOrder.tsx naar vehicle_types,
-- rate_cards, rate_rules en surcharges zodat de sprint-2 pricing engine
-- exact dezelfde prijzen genereert als het frontend-pad.
--
-- Basis-km = 725 (KM_BASIS in NewOrder.tsx).
-- Diesel-inclusief wordt via rate_rules.conditions->>'diesel_included' bepaald.
-- Screening is een VAST_BEDRAG per voertuig, toggelbaar via conditions.
-- Idempotent: herhaaldelijk draaien is veilig.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_tenant_id   UUID;
  v_rate_card   UUID;
  v_caddy       UUID;
  v_bus         UUID;
  v_koel_klein  UUID;
  v_koel_groot  UUID;
  v_bakbus      UUID;
  v_daf_truck   UUID;
  v_hoya        UUID;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants WHERE slug = 'royalty-cargo';
  IF v_tenant_id IS NULL THEN
    RAISE NOTICE 'Tenant royalty-cargo niet gevonden, seed overgeslagen.';
    RETURN;
  END IF;

  -- ─── Vehicle types ───────────────────────────────────────────────────
  INSERT INTO public.vehicle_types (
    tenant_id, code, name, sort_order,
    max_length_cm, max_width_cm, max_height_cm, max_weight_kg,
    has_tailgate, has_cooling, adr_capable, is_active
  ) VALUES
    (v_tenant_id, 'caddy',      'Caddy',      10, 180, 110, 110,   400, false, false, false, true),
    (v_tenant_id, 'hoya',       'Hoya',       20, 200, 120, 120,   500, false, false, false, true),
    (v_tenant_id, 'bus',        'Bus',        30, 280, 150, 150,   800, false, false, false, true),
    (v_tenant_id, 'koel-klein', 'Koel klein', 40, 240, 130, 130,   600, false, true,  false, true),
    (v_tenant_id, 'koel-groot', 'Koel groot', 50, 320, 160, 170,  1000, false, true,  false, true),
    (v_tenant_id, 'bakbus',     'Bakbus',     60, 400, 180, 190,  1200, true,  false, false, true),
    (v_tenant_id, 'daf-truck',  'DAF Truck',  70, 700, 240, 240,  8000, false, false, false, true)
  ON CONFLICT (tenant_id, code) DO UPDATE SET
    name          = EXCLUDED.name,
    sort_order    = EXCLUDED.sort_order,
    max_length_cm = EXCLUDED.max_length_cm,
    max_width_cm  = EXCLUDED.max_width_cm,
    max_height_cm = EXCLUDED.max_height_cm,
    max_weight_kg = EXCLUDED.max_weight_kg,
    has_tailgate  = EXCLUDED.has_tailgate,
    has_cooling   = EXCLUDED.has_cooling,
    adr_capable   = EXCLUDED.adr_capable,
    is_active     = EXCLUDED.is_active,
    updated_at    = now();

  SELECT id INTO v_caddy      FROM public.vehicle_types WHERE tenant_id = v_tenant_id AND code = 'caddy';
  SELECT id INTO v_hoya       FROM public.vehicle_types WHERE tenant_id = v_tenant_id AND code = 'hoya';
  SELECT id INTO v_bus        FROM public.vehicle_types WHERE tenant_id = v_tenant_id AND code = 'bus';
  SELECT id INTO v_koel_klein FROM public.vehicle_types WHERE tenant_id = v_tenant_id AND code = 'koel-klein';
  SELECT id INTO v_koel_groot FROM public.vehicle_types WHERE tenant_id = v_tenant_id AND code = 'koel-groot';
  SELECT id INTO v_bakbus     FROM public.vehicle_types WHERE tenant_id = v_tenant_id AND code = 'bakbus';
  SELECT id INTO v_daf_truck  FROM public.vehicle_types WHERE tenant_id = v_tenant_id AND code = 'daf-truck';

  -- ─── Rate card (tenant-default, niet gekoppeld aan specifieke klant) ─
  INSERT INTO public.rate_cards (tenant_id, client_id, name, is_active, currency)
  VALUES (v_tenant_id, NULL, 'Royalty Cargo standaardtarief', true, 'EUR')
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_rate_card
    FROM public.rate_cards
    WHERE tenant_id = v_tenant_id
      AND name = 'Royalty Cargo standaardtarief'
    LIMIT 1;

  -- ─── Rate rules: leeg eerst zodat updates schoon blijven ─────────────
  DELETE FROM public.rate_rules
    WHERE rate_card_id = v_rate_card;

  -- PER_KM: diesel inclusief (matrix.inc / 725), min_amount = matrix.min
  -- PER_KM: diesel exclusief (matrix.ex  / 725), min_amount = matrix.min
  -- VAST_BEDRAG: screening (toggelbaar via conditions.optional)
  INSERT INTO public.rate_rules (rate_card_id, rule_type, vehicle_type_id, amount, min_amount, conditions, sort_order) VALUES
    -- Caddy:        ex 841,     inc 1103.30, min 115,    screening 107.50
    (v_rate_card, 'PER_KM',      v_caddy,      1.5218, 115.00, '{"diesel_included": true}',            10),
    (v_rate_card, 'PER_KM',      v_caddy,      1.1600, 115.00, '{"diesel_included": false}',           11),
    (v_rate_card, 'VAST_BEDRAG', v_caddy,      107.50, NULL,   '{"purpose": "screening", "optional": true}', 12),
    -- Hoya:         ex 913.50,  inc 1197.55, min 97.50,  screening 107.50
    (v_rate_card, 'PER_KM',      v_hoya,       1.6518, 97.50,  '{"diesel_included": true}',            20),
    (v_rate_card, 'PER_KM',      v_hoya,       1.2600, 97.50,  '{"diesel_included": false}',           21),
    (v_rate_card, 'VAST_BEDRAG', v_hoya,       107.50, NULL,   '{"purpose": "screening", "optional": true}', 22),
    -- Bus:          ex 986,     inc 1291.80, min 125,    screening 107.50
    (v_rate_card, 'PER_KM',      v_bus,        1.7818, 125.00, '{"diesel_included": true}',            30),
    (v_rate_card, 'PER_KM',      v_bus,        1.3600, 125.00, '{"diesel_included": false}',           31),
    (v_rate_card, 'VAST_BEDRAG', v_bus,        107.50, NULL,   '{"purpose": "screening", "optional": true}', 32),
    -- Koel klein:   ex 1073,    inc 1404.90, min 125,    screening 107.50
    (v_rate_card, 'PER_KM',      v_koel_klein, 1.9378, 125.00, '{"diesel_included": true}',            40),
    (v_rate_card, 'PER_KM',      v_koel_klein, 1.4800, 125.00, '{"diesel_included": false}',           41),
    (v_rate_card, 'VAST_BEDRAG', v_koel_klein, 107.50, NULL,   '{"purpose": "screening", "optional": true}', 42),
    -- Koel groot:   ex 1189,    inc 1555.70, min 135,    screening 107.50
    (v_rate_card, 'PER_KM',      v_koel_groot, 2.1458, 135.00, '{"diesel_included": true}',            50),
    (v_rate_card, 'PER_KM',      v_koel_groot, 1.6400, 135.00, '{"diesel_included": false}',           51),
    (v_rate_card, 'VAST_BEDRAG', v_koel_groot, 107.50, NULL,   '{"purpose": "screening", "optional": true}', 52),
    -- Bakbus:       ex 1276,    inc 1668.80, min 145,    screening 107.50
    (v_rate_card, 'PER_KM',      v_bakbus,     2.3018, 145.00, '{"diesel_included": true}',            60),
    (v_rate_card, 'PER_KM',      v_bakbus,     1.7600, 145.00, '{"diesel_included": false}',           61),
    (v_rate_card, 'VAST_BEDRAG', v_bakbus,     107.50, NULL,   '{"purpose": "screening", "optional": true}', 62),
    -- DAF Truck:    ex 1986.50, inc 2592.45, min 275,    screening 217.50
    (v_rate_card, 'PER_KM',      v_daf_truck,  3.5758, 275.00, '{"diesel_included": true}',            70),
    (v_rate_card, 'PER_KM',      v_daf_truck,  2.7400, 275.00, '{"diesel_included": false}',           71),
    (v_rate_card, 'VAST_BEDRAG', v_daf_truck,  217.50, NULL,   '{"purpose": "screening", "optional": true}', 72),
    -- Wacht- en stop-tarieven (voertuig-onafhankelijk, dus vehicle_type_id = NULL)
    (v_rate_card, 'PER_UUR',     NULL,          52.50, NULL,   '{"purpose": "wachturen"}',             80),
    (v_rate_card, 'PER_STOP',    NULL,          45.00, NULL,   '{"purpose": "extra_stops"}',           81);

  -- ─── Surcharges: update de seed-rijen naar Royalty Cargo percentages ─
  -- Ochtend + avond samen 35% in het frontend, hier als aparte toeslagen
  -- beide op 35% (engine past er maar een toe afhankelijk van tijdsvenster).
  UPDATE public.surcharges
     SET amount = 35.00, surcharge_type = 'PERCENTAGE', is_active = true
   WHERE tenant_id = v_tenant_id AND name IN ('Ochtendtoeslag','Avondtoeslag');

  UPDATE public.surcharges
     SET amount = 50.00, surcharge_type = 'PERCENTAGE', is_active = true
   WHERE tenant_id = v_tenant_id AND name = 'Zaterdagtoeslag';

  UPDATE public.surcharges
     SET amount = 75.00, surcharge_type = 'PERCENTAGE', is_active = true
   WHERE tenant_id = v_tenant_id AND name IN ('Zondagtoeslag','Feestdagtoeslag');

  -- ─── Engine-flag aanzetten voor Royalty Cargo (stap 5 in plan) ──────
  -- NIET hier: wordt pas geflipt na verificatie van de output (zie step 5).
  -- De seed brengt alleen data op orde; activering is een aparte actie.

  RAISE NOTICE 'Royalty Cargo seed klaar: 7 voertuigen, 23 rate_rules, surcharges bijgewerkt.';
END $$;

-- ─── ROLLBACK ─────────────────────────────────────────────────────────
-- DELETE FROM public.rate_rules WHERE rate_card_id IN
--   (SELECT id FROM public.rate_cards WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
--      AND name = 'Royalty Cargo standaardtarief');
-- DELETE FROM public.rate_cards WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
--   AND name = 'Royalty Cargo standaardtarief';
-- DELETE FROM public.vehicle_types WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
--   AND code IN ('caddy','hoya','bus','koel-klein','koel-groot','bakbus','daf-truck');
