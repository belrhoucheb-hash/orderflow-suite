-- Fix ai_corrections.order_id: change TEXT → UUID and add FK to orders(id)
ALTER TABLE public.ai_corrections
  ALTER COLUMN order_id TYPE uuid USING order_id::uuid;

ALTER TABLE public.ai_corrections
  ADD CONSTRAINT fk_ai_corrections_order
  FOREIGN KEY (order_id) REFERENCES public.orders(id)
  ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_ai_corrections_order ON public.ai_corrections(order_id);
