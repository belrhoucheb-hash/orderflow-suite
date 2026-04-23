-- Eenmalige opschoning: deactiveer voertuigtypes die de gebruiker niet
-- in de keuzelijst wilde zien (Caddy, Compact bestelvoertuig, Koeler
-- klein, Koeler groot, Bus, Koel klein, Koel groot, Bakbus, DAF Truck).
--
-- Geen DELETE: bestaande voertuigen/ritten kunnen aan deze codes hangen
-- en moeten blijven werken. Via de stamgegevens (tab Types) kan een
-- tenant ze later weer op is_active=true zetten of een eigen type
-- toevoegen zonder code-wijziging.

UPDATE public.vehicle_types
SET is_active = false
WHERE code IN (
  'caddy',
  'compact',
  'koeler-klein',
  'koeler-groot',
  'bus',
  'koel-klein',
  'koel-groot',
  'bakbus',
  'daf-truck'
);

-- ─── ROLLBACK ────────────────────────────────────────────────────────
-- UPDATE public.vehicle_types
-- SET is_active = true
-- WHERE code IN (
--   'caddy', 'compact', 'koeler-klein', 'koeler-groot', 'bus',
--   'koel-klein', 'koel-groot', 'bakbus', 'daf-truck'
-- );
