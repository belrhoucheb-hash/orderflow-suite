CREATE TABLE IF NOT EXISTS public.ai_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text,
  client_name text,
  field_name text NOT NULL,
  ai_value text,
  corrected_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_corrections_client ON public.ai_corrections(client_name);
CREATE INDEX IF NOT EXISTS idx_ai_corrections_created ON public.ai_corrections(created_at DESC);
