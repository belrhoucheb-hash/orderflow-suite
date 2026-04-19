-- ──────────────────────────────────────────────────────────────────────────
-- §27 Orders.department_id verplicht maken (NOT NULL)
--
-- Operationeel probleem bij Royalty Cargo: orders zonder afdeling "verdwijnen"
-- omdat planner ze niet in de afdeling-filters ziet. De trigger
-- enforce_department_on_transition blokkeerde alleen bij transitie uit DRAFT,
-- dus DRAFT-orders konden ongemerkt zonder afdeling blijven. Nu hard afgedwongen
-- op DB-niveau voor elke status.
--
-- Backfill in drie stappen vóór SET NOT NULL:
--   1. kopieer van sibling-leg van hetzelfde shipment
--   2. RCS Export adres-detectie (EXPORT)
--   3. fallback: OPS van de tenant
-- Alles in één transactie zodat SET NOT NULL nooit op onvolledige staat draait.
-- ──────────────────────────────────────────────────────────────────────────

-- stap 1: kopieer van sibling-leg van hetzelfde shipment
UPDATE public.orders o
SET department_id = sib.department_id
FROM public.orders sib
WHERE o.department_id IS NULL
  AND o.shipment_id IS NOT NULL
  AND sib.shipment_id = o.shipment_id
  AND sib.id <> o.id
  AND sib.department_id IS NOT NULL;

-- stap 2: adres bevat RCS Export of RCS Hub -> EXPORT
UPDATE public.orders o
SET department_id = d.id
FROM public.departments d
WHERE o.department_id IS NULL
  AND d.tenant_id = o.tenant_id
  AND d.code = 'EXPORT'
  AND (
    o.pickup_address ILIKE '%RCS Export%' OR
    o.delivery_address ILIKE '%RCS Export%' OR
    o.pickup_address ILIKE '%RCS Hub%' OR
    o.delivery_address ILIKE '%RCS Hub%'
  );

-- stap 3: fallback OPS per tenant
UPDATE public.orders o
SET department_id = d.id
FROM public.departments d
WHERE o.department_id IS NULL
  AND d.tenant_id = o.tenant_id
  AND d.code = 'OPS';

-- sanity check, zou nooit moeten triggeren als departments-seed klopt
DO $$
DECLARE missing INT;
BEGIN
  SELECT count(*) INTO missing FROM public.orders WHERE department_id IS NULL;
  IF missing > 0 THEN
    RAISE EXCEPTION 'Backfill faalde: % orders zonder department_id. Check of elke tenant een OPS department heeft.', missing;
  END IF;
END$$;

ALTER TABLE public.orders
  ALTER COLUMN department_id SET NOT NULL;

COMMENT ON COLUMN public.orders.department_id IS
  'Afdeling waar deze order (leg) onder valt. NOT NULL sinds §27. Wordt afgeleid via traject_rules in createShipmentWithLegs; planner kan overrulen in NewOrder.';
