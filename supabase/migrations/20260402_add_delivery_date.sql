-- Add delivery_date column to orders for multi-day planning
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_date DATE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pickup_date DATE;

-- Index for efficient date-based planning queries
CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON public.orders (delivery_date);
CREATE INDEX IF NOT EXISTS idx_orders_status_delivery_date ON public.orders (status, delivery_date);

COMMENT ON COLUMN public.orders.delivery_date IS 'Requested delivery date (YYYY-MM-DD)';
COMMENT ON COLUMN public.orders.pickup_date IS 'Requested pickup date (YYYY-MM-DD)';
