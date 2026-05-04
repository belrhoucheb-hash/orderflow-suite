Deze map is alleen bedoeld voor lokale development-scripts.

Bestanden in deze map mogen niet worden gebruikt als productie-migratie en horen
niet in `supabase/migrations/`. Scripts die RLS versoepelen moeten zelf een
expliciete lokale guard afdwingen voordat ze policies aanpassen.
