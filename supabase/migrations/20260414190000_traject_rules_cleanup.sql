-- Opruimen traject-regels:
--
-- 1. De oude "Naar RCS Export hub → split OPS + EXPORT"-regel (prio 10) was
--    te breed: matcht ook als delivery IS de hub (klant levert af bij hub),
--    wat resulteert in een onzinnige hub→hub tweede leg. We vertrouwen nu
--    op de afdeling_equals=EXPORT-regel (prio 15) die pas fired als
--    auto-detectie óf handmatige keuze zegt dat het echt export is.
--
-- 2. "Vanuit RCS hub → single Export leg" (pickup = hub) moet hoger in prio
--    dan de afdeling-regel, zodat `rcs hub → dubai` blijft 1 leg (hub → dubai)
--    in plaats van de 2-legs split te pakken.

UPDATE public.traject_rules
   SET is_active = false,
       updated_at = now()
 WHERE match_conditions ? 'delivery_address_contains'
   AND is_active = true;

UPDATE public.traject_rules
   SET priority = 5,
       updated_at = now()
 WHERE match_conditions ? 'pickup_address_contains';
