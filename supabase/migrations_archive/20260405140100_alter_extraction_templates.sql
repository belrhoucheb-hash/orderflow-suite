-- Plan C: Enrich client_extraction_templates with learning fields

ALTER TABLE client_extraction_templates
  ADD COLUMN IF NOT EXISTS default_transport_type TEXT,
  ADD COLUMN IF NOT EXISTS default_requirements TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS avg_weight_kg NUMERIC,
  ADD COLUMN IF NOT EXISTS avg_quantity NUMERIC,
  ADD COLUMN IF NOT EXISTS auto_confirm_eligible BOOLEAN NOT NULL DEFAULT false;

-- Mark templates with 20+ successes and no recent rejections as eligible
COMMENT ON COLUMN client_extraction_templates.auto_confirm_eligible IS
  'Set true when template has sufficient history for autonomous confirmation. '
  'Evaluated by parse-order after each successful extraction.';
