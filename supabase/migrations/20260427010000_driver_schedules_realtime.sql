-- Sprint 7 follow-up. Enable realtime op driver_schedules.
--
-- Twee planners kunnen tegelijk in de Rooster-tab zitten. Met realtime
-- ziet de tweede planner direct dat de eerste een rij wijzigde, in
-- plaats van te wachten op een React Query stale-time refetch (10s).

ALTER TABLE public.driver_schedules REPLICA IDENTITY FULL;

DO $$ BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_schedules';
EXCEPTION WHEN others THEN
  -- Tabel zit mogelijk al in de publication, of de publication bestaat niet,
  -- niet blokkerend voor de migratie.
  NULL;
END $$;

-- ─── ROLLBACK ──────────────────────────────────────────────────────
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.driver_schedules;
-- ALTER TABLE public.driver_schedules REPLICA IDENTITY DEFAULT;
