-- ============================================================
-- Migrate existing client_rates data to rate_cards + rate_rules.
-- Old client_rates table is kept as fallback until confirmed.
-- ============================================================

INSERT INTO public.rate_cards (tenant_id, client_id, name, is_active, currency)
SELECT DISTINCT cr.tenant_id, cr.client_id,
  'Gemigreerd tarief — ' || COALESCE(c.name, 'Onbekend'), true, COALESCE(cr.currency, 'EUR')
FROM public.client_rates cr
LEFT JOIN public.clients c ON c.id = cr.client_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.rate_cards rc WHERE rc.client_id = cr.client_id AND rc.tenant_id = cr.tenant_id
);

INSERT INTO public.rate_rules (rate_card_id, rule_type, amount, min_amount, conditions, sort_order)
SELECT rc.id,
  CASE cr.rate_type
    WHEN 'per_km' THEN 'PER_KM' WHEN 'per_pallet' THEN 'PER_PALLET'
    WHEN 'per_rit' THEN 'VAST_BEDRAG' ELSE 'VAST_BEDRAG'
  END,
  cr.amount, NULL,
  CASE WHEN cr.rate_type = 'toeslag_adr' THEN '{"requirements": ["ADR"]}'::jsonb
    WHEN cr.rate_type = 'toeslag_koel' THEN '{"transport_type": "koeltransport"}'::jsonb
    ELSE '{}'::jsonb END,
  ROW_NUMBER() OVER (PARTITION BY rc.id ORDER BY cr.rate_type) - 1
FROM public.client_rates cr
JOIN public.rate_cards rc ON rc.client_id = cr.client_id AND rc.tenant_id = cr.tenant_id
WHERE cr.is_active = true;

INSERT INTO public.surcharges (tenant_id, name, surcharge_type, amount, applies_to, is_active)
SELECT DISTINCT cr.tenant_id, 'Weekendtoeslag (gemigreerd)', 'VAST_BEDRAG', cr.amount, '{"day_of_week": [0, 6]}'::jsonb, true
FROM public.client_rates cr WHERE cr.rate_type = 'toeslag_weekend' AND cr.is_active = true
AND NOT EXISTS (SELECT 1 FROM public.surcharges s WHERE s.tenant_id = cr.tenant_id AND s.name LIKE '%Weekendtoeslag%')
LIMIT 1;

INSERT INTO public.surcharges (tenant_id, name, surcharge_type, amount, applies_to, is_active)
SELECT DISTINCT cr.tenant_id, 'Spoedtoeslag (gemigreerd)', 'VAST_BEDRAG', cr.amount, '{}'::jsonb, true
FROM public.client_rates cr WHERE cr.rate_type = 'toeslag_spoed' AND cr.is_active = true
AND NOT EXISTS (SELECT 1 FROM public.surcharges s WHERE s.tenant_id = cr.tenant_id AND s.name LIKE '%Spoedtoeslag%')
LIMIT 1;

COMMENT ON TABLE public.client_rates IS 'LEGACY: Migrated to rate_cards + rate_rules. Kept as fallback.';
