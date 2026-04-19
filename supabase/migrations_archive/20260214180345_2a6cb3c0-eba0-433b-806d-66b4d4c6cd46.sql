-- Add internal note field for planner-to-planner notes
ALTER TABLE public.orders ADD COLUMN internal_note TEXT DEFAULT NULL;