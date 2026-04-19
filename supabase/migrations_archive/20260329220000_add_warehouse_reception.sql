-- Add warehouse_received_at to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS warehouse_received_at timestamptz;

COMMENT ON COLUMN public.orders.warehouse_received_at IS 'Timestamp when an export order was physically received in the warehouse (triggered by label printing).';
