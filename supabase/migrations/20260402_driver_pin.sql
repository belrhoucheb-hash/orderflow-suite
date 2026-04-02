-- Add PIN hash column to drivers table for chauffeur authentication
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS pin_hash text DEFAULT '0000';
-- Default '0000' for existing drivers; in production use a proper hash.
-- The must_change_pin flag prompts drivers to change their default PIN on first login.
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS must_change_pin boolean DEFAULT true;
