
-- Add vehicle_id column to orders for planning assignments
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS vehicle_id text;
