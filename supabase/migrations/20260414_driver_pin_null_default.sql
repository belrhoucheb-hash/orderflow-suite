-- Fix: default "0000" op drivers.pin_hash was (a) plaintext en (b) een deadlock
-- omdat de frontend SHA-256 hashing gebruikt. Door default naar NULL te zetten
-- triggert de "Geen PIN ingesteld"-flow correct in ChauffeurApp.tsx.
ALTER TABLE public.drivers ALTER COLUMN pin_hash DROP DEFAULT;
UPDATE public.drivers SET pin_hash = NULL WHERE pin_hash = '0000';
