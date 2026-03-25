
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS thread_type text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS parent_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS changes_detected jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS anomalies jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.orders.thread_type IS 'Type of email thread: new, update, cancellation, confirmation, question';
COMMENT ON COLUMN public.orders.parent_order_id IS 'Links reply emails to their original order';
COMMENT ON COLUMN public.orders.changes_detected IS 'Array of {field, old_value, new_value} diffs when thread_type=update';
COMMENT ON COLUMN public.orders.anomalies IS 'Array of {field, value, avg_value, message} anomaly flags';
