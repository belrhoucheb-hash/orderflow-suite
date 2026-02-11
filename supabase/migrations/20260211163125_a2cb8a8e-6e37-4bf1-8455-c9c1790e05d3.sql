
-- Add attachments column to orders table as JSONB array
ALTER TABLE public.orders ADD COLUMN attachments JSONB DEFAULT '[]'::jsonb;
