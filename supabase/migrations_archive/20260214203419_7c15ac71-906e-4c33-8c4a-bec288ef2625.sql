-- Add columns for AI follow-up email feature
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS missing_fields text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS follow_up_draft text,
ADD COLUMN IF NOT EXISTS follow_up_sent_at timestamptz;