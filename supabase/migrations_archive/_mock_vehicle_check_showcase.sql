-- ──────────────────────────────────────────────────────────────────────────
-- SHOWCASE MOCK DATA — draai handmatig in SQL editor, niet via migrate.
-- Maakt 3 voorbeeld-checks + 1 baseline-seed + 2 damage events zodat de
-- /voertuigcheck historie-pagina meteen gevuld is.
--
-- VEILIG OM OPNIEUW TE DRAAIEN: ingevoegd met unieke notes-markeringen
-- ("[MOCK-SHOWCASE-*]") zodat je ze later makkelijk kunt verwijderen:
--   DELETE FROM vehicle_checks WHERE notes LIKE '%[MOCK-SHOWCASE%';
-- ──────────────────────────────────────────────────────────────────────────

WITH
  t AS (SELECT id AS tenant_id FROM public.tenants LIMIT 1),
  v AS (SELECT id AS vehicle_id FROM public.vehicles LIMIT 1),
  d1 AS (SELECT id AS driver_id, name FROM public.drivers ORDER BY name LIMIT 1),
  d2 AS (SELECT id AS driver_id, name FROM public.drivers ORDER BY name OFFSET 1 LIMIT 1),

  -- 1. Baseline seed (admin heeft "nulstaat" vastgelegd, 3 dagen geleden)
  baseline AS (
    INSERT INTO public.vehicle_checks
      (tenant_id, driver_id, vehicle_id, started_at, completed_at, status, is_baseline_seed, notes, checklist)
    SELECT t.tenant_id, NULL, v.vehicle_id,
           now() - interval '3 days', now() - interval '3 days',
           'OK', true,
           '[MOCK-SHOWCASE-BASELINE] Initiële nulstaat — admin',
           '{"lights":true,"tires":true,"fluids":true,"wipers":true,"mirrors":true,"safety_kit":true,"first_aid":true,"fire_ext":true,"tacho_card":true,"fuel_level":true}'::jsonb
    FROM t, v
    RETURNING id, vehicle_id, tenant_id
  ),
  baseline_photos AS (
    INSERT INTO public.vehicle_check_photos (check_id, side, storage_path, ai_description, severity)
    SELECT b.id, side,
           b.tenant_id::text || '/' || b.id::text || '/' || side || '.jpg',
           'Baseline — voertuig zonder zichtbare schade, zijde ' || side || '.',
           'none'
    FROM baseline b,
         unnest(ARRAY['front','rear','left','right','interior_front','interior_cargo']) AS side
    RETURNING check_id
  ),

  -- 2. Gisteren: chauffeur 1 doet check, alles OK
  check_ok AS (
    INSERT INTO public.vehicle_checks
      (tenant_id, driver_id, vehicle_id, started_at, completed_at, status, baseline_check_id, notes, checklist)
    SELECT t.tenant_id, d1.driver_id, v.vehicle_id,
           now() - interval '1 day' - interval '2 hours',
           now() - interval '1 day' - interval '1 hour 55 minutes',
           'OK',
           (SELECT id FROM baseline),
           '[MOCK-SHOWCASE-OK] Geen bijzonderheden bij start dienst',
           '{"lights":true,"tires":true,"fluids":true,"wipers":true,"mirrors":true,"safety_kit":true,"first_aid":true,"fire_ext":true,"tacho_card":true,"fuel_level":true}'::jsonb
    FROM t, v, d1
    RETURNING id, tenant_id, vehicle_id, driver_id
  ),
  check_ok_photos AS (
    INSERT INTO public.vehicle_check_photos (check_id, side, storage_path, ai_description, severity)
    SELECT c.id, side,
           c.tenant_id::text || '/' || c.id::text || '/' || side || '.jpg',
           'Geen verschillen t.o.v. baseline.',
           'none'
    FROM check_ok c,
         unnest(ARRAY['front','rear','left','right','interior_front','interior_cargo']) AS side
    RETURNING check_id
  ),

  -- 3. Vandaag: chauffeur 2 vindt nieuwe kras + deuk — DAMAGE_FOUND
  check_dmg AS (
    INSERT INTO public.vehicle_checks
      (tenant_id, driver_id, vehicle_id, started_at, completed_at, status, baseline_check_id, notes, checklist)
    SELECT t.tenant_id, d2.driver_id, v.vehicle_id,
           now() - interval '3 hours',
           now() - interval '2 hours 50 minutes',
           'DAMAGE_FOUND',
           (SELECT id FROM check_ok),
           '[MOCK-SHOWCASE-DAMAGE] Zag kras op linkerzijde en deuk achterzijde, was er gisteren niet',
           '{"lights":true,"tires":true,"fluids":true,"wipers":true,"mirrors":true,"safety_kit":true,"first_aid":true,"fire_ext":true,"tacho_card":true,"fuel_level":true}'::jsonb
    FROM t, v, d2
    RETURNING id, tenant_id, vehicle_id, driver_id
  ),
  check_dmg_photos AS (
    INSERT INTO public.vehicle_check_photos (check_id, side, storage_path, ai_description, ai_diff, severity)
    SELECT c.id, p.side,
           c.tenant_id::text || '/' || c.id::text || '/' || p.side || '.jpg',
           p.descr, p.diff, p.sev
    FROM check_dmg c,
         (VALUES
           ('front',           'Voorzijde zonder bijzonderheden.', NULL, 'none'),
           ('rear',            'Deuk op rechter achterbumper.',     'Nieuwe deuk ~8cm rechter achterbumper — niet aanwezig in baseline.', 'blocking'),
           ('left',            'Kras over linkerzijde.',            'Diagonale kras ~30cm over linker schuifdeur — nieuw.',                'minor'),
           ('right',           'Rechterzijde zonder bijzonderheden.',NULL, 'none'),
           ('interior_front',  'Cabine schoon.',                    NULL, 'none'),
           ('interior_cargo',  'Laadruimte leeg en schoon.',        NULL, 'none')
         ) AS p(side, descr, diff, sev)
    RETURNING check_id
  )

INSERT INTO public.vehicle_damage_events
  (tenant_id, vehicle_id, discovered_in_check_id, discovered_by_driver_id,
   attributed_to_check_id, attributed_to_driver_id,
   side, severity, description, photo_path, status)
SELECT
  c.tenant_id, c.vehicle_id, c.id, c.driver_id,
  (SELECT id FROM check_ok), (SELECT driver_id FROM check_ok),
  sides.side, sides.sev, sides.descr,
  c.tenant_id::text || '/' || c.id::text || '/' || sides.side || '.jpg',
  'OPEN'
FROM check_dmg c,
     (VALUES
       ('rear',  'blocking', 'Deuk ~8cm rechter achterbumper'),
       ('left',  'minor',    'Diagonale kras ~30cm linker schuifdeur')
     ) AS sides(side, sev, descr);

SELECT 'MOCK-SHOWCASE: 3 checks + 6 baseline foto''s + 6 OK foto''s + 6 DAMAGE foto''s + 2 damage events aangemaakt.' AS resultaat;
