-- ============================================================
-- Sprint 3 RPC round-trip tests
-- ============================================================
--
-- Verifieert dat:
--   1. confirm_consolidation_group creëert trip + trip_stops
--      (pickup + delivery per order in de juiste sequentie)
--   2. reject_consolidation_group zet status VERWORPEN zonder trip
--   3. record_capacity_override vult capacity_override_*
--      en weigert een lege reden
--   4. view driver_hours_per_week sommeert trips.total_duration_min
--      per ISO-week per chauffeur
--
-- Draaien: psql -f supabase/tests/sprint3_cluster_rpcs.sql
-- Rollt alles terug, raakt geen bestaande data.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_tenant uuid   := '00000000-0000-0000-0000-0000000000bb';
  v_dept uuid     := gen_random_uuid();
  v_client uuid   := gen_random_uuid();
  v_driver uuid   := gen_random_uuid();
  v_vehicle uuid  := gen_random_uuid();
  v_order1 uuid   := gen_random_uuid();
  v_order2 uuid   := gen_random_uuid();
  v_group uuid    := gen_random_uuid();
  v_trip_id uuid;
  v_stops_count int;
  v_pickup_count int;
  v_delivery_count int;
  v_group_status text;
  v_hours numeric;
BEGIN
  -- Setup: tenant, department, client, driver, vehicle, orders, cluster
  INSERT INTO public.tenants (id, name) VALUES (v_tenant, 'SPR3-TEST-TENANT');
  INSERT INTO public.departments (id, tenant_id, code, name) VALUES (v_dept, v_tenant, 'TEST', 'Test afdeling');
  INSERT INTO public.clients (id, tenant_id, name, address, city, country)
    VALUES (v_client, v_tenant, 'TestKlant BV', 'Teststraat 1', 'Testdorp', 'NL');
  INSERT INTO public.drivers (id, tenant_id, name, contract_hours_per_week, is_active, status)
    VALUES (v_driver, v_tenant, 'Test Driver', 40, true, 'beschikbaar');
  INSERT INTO public.vehicles (id, tenant_id, code, name, plate, type, capacity_kg, capacity_pallets, is_active, status)
    VALUES (v_vehicle, v_tenant, 'TST01', 'Test Voertuig', 'TS-01-AA', 'van', 1500, 6, true, 'beschikbaar');

  INSERT INTO public.orders (id, tenant_id, order_number, status, client_id, client_name, department_id,
                              pickup_address, delivery_address, weight_kg, quantity,
                              delivery_date, pickup_date,
                              pickup_time_window_start, pickup_time_window_end,
                              delivery_time_window_start, delivery_time_window_end)
    VALUES (v_order1, v_tenant, 999001, 'PENDING', v_client, 'TestKlant BV', v_dept,
            'Ophaal A, 3011 AA', 'Aflever A, 3012 AB', 100, 1,
            CURRENT_DATE + 1, CURRENT_DATE + 1,
            '08:00', '10:00', '12:00', '14:00');

  INSERT INTO public.orders (id, tenant_id, order_number, status, client_id, client_name, department_id,
                              pickup_address, delivery_address, weight_kg, quantity,
                              delivery_date, pickup_date)
    VALUES (v_order2, v_tenant, 999002, 'PENDING', v_client, 'TestKlant BV', v_dept,
            'Ophaal B, 3011 AA', 'Aflever B, 3013 CD', 200, 2,
            CURRENT_DATE + 1, CURRENT_DATE + 1);

  INSERT INTO public.consolidation_groups (id, tenant_id, name, planned_date, status,
                                             vehicle_id, driver_id, proposal_source,
                                             total_weight_kg, total_pallets, utilization_pct,
                                             estimated_duration_min)
    VALUES (v_group, v_tenant, 'Test cluster', CURRENT_DATE + 1, 'VOORSTEL',
            v_vehicle, v_driver, 'auto', 300, 3, 50, 120);

  INSERT INTO public.consolidation_orders (group_id, order_id, stop_sequence)
    VALUES (v_group, v_order1, 1), (v_group, v_order2, 2);

  -- ── Test 1: confirm_consolidation_group creëert trip + trip_stops ──
  SELECT public.confirm_consolidation_group(v_group) INTO v_trip_id;

  ASSERT v_trip_id IS NOT NULL, 'confirm moet trip_id retourneren';

  SELECT COUNT(*) INTO v_stops_count FROM public.trip_stops WHERE trip_id = v_trip_id;
  ASSERT v_stops_count = 4, format('verwacht 4 stops (2 orders x pickup+delivery), kreeg %s', v_stops_count);

  SELECT COUNT(*) INTO v_pickup_count FROM public.trip_stops WHERE trip_id = v_trip_id AND stop_type = 'PICKUP';
  ASSERT v_pickup_count = 2, format('verwacht 2 pickups, kreeg %s', v_pickup_count);

  SELECT COUNT(*) INTO v_delivery_count FROM public.trip_stops WHERE trip_id = v_trip_id AND stop_type = 'DELIVERY';
  ASSERT v_delivery_count = 2, format('verwacht 2 deliveries, kreeg %s', v_delivery_count);

  SELECT status INTO v_group_status FROM public.consolidation_groups WHERE id = v_group;
  ASSERT v_group_status = 'INGEPLAND', format('verwacht INGEPLAND, kreeg %s', v_group_status);

  RAISE NOTICE 'Test 1 confirm OK: trip % met 4 stops, group is INGEPLAND', v_trip_id;

  -- ── Test 2: view driver_hours_per_week sommeert correct ──
  UPDATE public.trips SET total_duration_min = 120 WHERE id = v_trip_id;

  SELECT planned_hours INTO v_hours
  FROM public.driver_hours_per_week
  WHERE driver_id = v_driver
    AND week_start = date_trunc('week', CURRENT_DATE + 1)::date;

  ASSERT v_hours = 2, format('verwacht 2 uur (120 min), kreeg %s', v_hours);
  RAISE NOTICE 'Test 2 view OK: driver_hours_per_week = % uur', v_hours;

  -- ── Test 3: record_capacity_override weigert lege reden ──
  DECLARE
    v_threw boolean := false;
  BEGIN
    BEGIN
      PERFORM public.record_capacity_override(v_group, '');
    EXCEPTION WHEN OTHERS THEN
      v_threw := true;
    END;
    ASSERT v_threw, 'lege reden moet exception geven';
  END;

  -- record met geldige reden
  PERFORM public.record_capacity_override(v_group, 'Testreden voor override');
  PERFORM 1 FROM public.consolidation_groups
    WHERE id = v_group AND capacity_override_reason = 'Testreden voor override';
  ASSERT FOUND, 'capacity_override_reason moet gezet zijn';
  RAISE NOTICE 'Test 3 override OK: reden opgeslagen';

  -- ── Test 4: reject_consolidation_group op nieuw cluster ──
  DECLARE
    v_reject_group uuid := gen_random_uuid();
  BEGIN
    INSERT INTO public.consolidation_groups (id, tenant_id, name, planned_date, status,
                                               vehicle_id, driver_id, proposal_source)
      VALUES (v_reject_group, v_tenant, 'Reject test', CURRENT_DATE + 2, 'VOORSTEL',
              v_vehicle, v_driver, 'auto');

    PERFORM public.reject_consolidation_group(v_reject_group, 'testreden');

    SELECT status INTO v_group_status FROM public.consolidation_groups WHERE id = v_reject_group;
    ASSERT v_group_status = 'VERWORPEN', format('verwacht VERWORPEN, kreeg %s', v_group_status);
    RAISE NOTICE 'Test 4 reject OK: status is VERWORPEN';
  END;

  RAISE NOTICE 'Alle 4 tests geslaagd';
END $$;

ROLLBACK;
