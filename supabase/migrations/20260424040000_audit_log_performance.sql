-- ══════════════════════════════════════════════════════════════════════════
-- Audit-log performance hardening voor 100k+ writes per dag.
--
-- Probleem:
--   1. `audit_trigger_func()` kopieert bij elke UPDATE TWEE volledige rijen
--      (to_jsonb(OLD) + to_jsonb(NEW)) naar audit_log. Bij brede tabellen
--      als orders (40+ kolommen) betekent dat per DML ~2x de rij-grootte
--      aan extra write, ook als er maar één kolom veranderde.
--   2. `audit_log` en `activity_log` zijn append-only en groeien oneindig.
--      Zonder partitionering worden `WHERE created_at > ...`-queries steeds
--      trager en vacuum/autovacuum steeds duurder.
--   3. De generieke trigger `audit_clients` schrijft naar audit_log, terwijl
--      de specifieke trigger `trg_audit_clients_changes` (uit 20260422001000)
--      al naar client_audit_log schrijft. Dat is dubbel werk per update.
--   4. Frontend-helpers (`logAudit()` in useOrders) schrijven een tweede
--      audit-rij bovenop de server-trigger — puur dubbel.
--
-- Aanpak (geen alles-tegelijk, in volgorde):
--   A. `audit_trigger_func()` wordt compact: op UPDATE alleen een diff-jsonb
--      per gewijzigd veld {"col": {"old":..,"new":..}}, niet twee full-row
--      kopieën. INSERT/DELETE houden nog een snapshot (dat is meestal wat
--      nuttig is) maar compacter.
--   B. `audit_clients` trigger weggehaald. De gespecialiseerde
--      `trg_audit_clients_changes` dekt clients al.
--   C. Retentie-kader: archive-tabellen en prune-functies. Cron kan die
--      dagelijks aanroepen.
--   D. Partitie-pad (CREATE NEW + COPY + SWAP) voor audit_log en
--      activity_log als gecommentarieerde DDL. Dit vereist een
--      onderhouds-window met schrijf-stop op de hoofd-tabellen, dus wordt
--      NIET automatisch toegepast. Zie de PARTITIONING-sectie onderaan.
--
-- Niet-toegepast (bewust):
--   * pg_net-async queue: kan later zonder deze migratie terug te draaien,
--     vereist extra extension en edge function die in Supabase Studio moet
--     worden geactiveerd. De compact-trigger haalt het grootste deel van
--     de latency al weg door de rij-grootte te beperken.
-- ══════════════════════════════════════════════════════════════════════════

-- ─── A. Compact audit_trigger_func ──────────────────────────────────
-- Vervangt de bestaande functie uit baseline. Triggers hoeven niet opnieuw
-- gekoppeld te worden: ze refereren aan de functienaam.
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _user_id       uuid := auth.uid();
  _user_email    text;
  _tenant_id     uuid;
  _old_row       jsonb;
  _new_row       jsonb;
  _diff          jsonb := '{}'::jsonb;
  _changed       text[] := ARRAY[]::text[];
  _key           text;
  _ignore_cols   text[] := ARRAY['updated_at', 'created_at'];
BEGIN
  IF _user_id IS NOT NULL THEN
    SELECT email INTO _user_email FROM auth.users WHERE id = _user_id;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    _old_row := to_jsonb(OLD);
    _new_row := to_jsonb(NEW);

    -- Tenant uit NEW indien aanwezig (generieke trigger, niet alle tabellen
    -- hebben tenant_id).
    IF _new_row ? 'tenant_id' THEN
      _tenant_id := (_new_row ->> 'tenant_id')::uuid;
    END IF;

    FOR _key IN SELECT jsonb_object_keys(_new_row) LOOP
      IF _key = ANY (_ignore_cols) THEN CONTINUE; END IF;
      IF (_old_row -> _key) IS DISTINCT FROM (_new_row -> _key) THEN
        _changed := array_append(_changed, _key);
        _diff := _diff || jsonb_build_object(
          _key,
          jsonb_build_object('old', _old_row -> _key, 'new', _new_row -> _key)
        );
      END IF;
    END LOOP;

    -- Geen echte verandering, geen audit-rij.
    IF array_length(_changed, 1) IS NULL THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.audit_log (
      table_name, record_id, action,
      old_data, new_data, changed_fields,
      user_id, user_email, tenant_id
    ) VALUES (
      TG_TABLE_NAME, OLD.id::text, 'UPDATE',
      NULL,           -- geen volledige old_data meer; diff zit in new_data
      _diff,          -- compacte diff-jsonb met alleen gewijzigde kolommen
      _changed,
      _user_id, _user_email, _tenant_id
    );
    RETURN NEW;

  ELSIF TG_OP = 'INSERT' THEN
    _new_row := to_jsonb(NEW);
    IF _new_row ? 'tenant_id' THEN
      _tenant_id := (_new_row ->> 'tenant_id')::uuid;
    END IF;

    INSERT INTO public.audit_log (
      table_name, record_id, action,
      new_data, user_id, user_email, tenant_id
    ) VALUES (
      TG_TABLE_NAME, NEW.id::text, 'INSERT',
      _new_row, _user_id, _user_email, _tenant_id
    );
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    _old_row := to_jsonb(OLD);
    IF _old_row ? 'tenant_id' THEN
      _tenant_id := (_old_row ->> 'tenant_id')::uuid;
    END IF;

    INSERT INTO public.audit_log (
      table_name, record_id, action,
      old_data, user_id, user_email, tenant_id
    ) VALUES (
      TG_TABLE_NAME, OLD.id::text, 'DELETE',
      _old_row, _user_id, _user_email, _tenant_id
    );
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.audit_trigger_func() IS
  'Compact audit-trigger. UPDATE schrijft alleen een diff-jsonb met gewijzigde kolommen i.p.v. twee full-row copies. Bespaart bij brede tabellen (orders, clients, vehicles) fors op row-grootte en write-latency.';

-- ─── B. Dubbele clients-trigger opruimen ─────────────────────────────
-- De specifieke trigger `trg_audit_clients_changes` (20260422001000) schrijft
-- al naar client_audit_log met een whitelist en per-veld rijen. De generieke
-- `audit_clients`-trigger uit baseline schrijft parallel naar audit_log —
-- dat is dubbel werk dat de UI nergens gebruikt. Wegtrekken.
DROP TRIGGER IF EXISTS audit_clients ON public.clients;

-- ─── C. Extra index voor "wie heeft wat wanneer"-queries ─────────────
-- De huidige idx_audit_log_user mist created_at, waardoor user-filters met
-- tijdsvenster nog steeds de hele user-partitie moeten scannen.
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_created
  ON public.audit_log (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_created
  ON public.audit_log (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- Ook voor activity_log: (entity_type, entity_id) heeft al een index, maar
-- tenant + created_at + action-filter is een veel voorkomende UI-vraag.
CREATE INDEX IF NOT EXISTS idx_activity_log_action
  ON public.activity_log (tenant_id, action, created_at DESC);

-- ─── D. Retentie: archive-tabellen en prune-functies ─────────────────
-- Retention-policy: 12 maanden hot in de actieve tabel, daarna naar
-- _archive, 24 maanden totaal. Cron roept prune_audit_log_*() dagelijks
-- aan. Archive-tabellen houden dezelfde kolommen; de RLS is strikter
-- (alleen service_role leest ze).

CREATE TABLE IF NOT EXISTS public.audit_log_archive (
  LIKE public.audit_log INCLUDING DEFAULTS INCLUDING CONSTRAINTS
);
COMMENT ON TABLE public.audit_log_archive IS
  'Archief voor audit_log-rijen ouder dan 12 maanden. Append-only, alleen service_role.';

ALTER TABLE public.audit_log_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_archive_service_role" ON public.audit_log_archive;
CREATE POLICY "audit_log_archive_service_role"
  ON public.audit_log_archive
  TO service_role
  USING (TRUE) WITH CHECK (TRUE);

CREATE INDEX IF NOT EXISTS idx_audit_log_archive_created
  ON public.audit_log_archive (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_archive_tenant_created
  ON public.audit_log_archive (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.activity_log_archive (
  LIKE public.activity_log INCLUDING DEFAULTS INCLUDING CONSTRAINTS
);
COMMENT ON TABLE public.activity_log_archive IS
  'Archief voor activity_log-rijen ouder dan 12 maanden. Append-only, alleen service_role.';

ALTER TABLE public.activity_log_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_log_archive_service_role" ON public.activity_log_archive;
CREATE POLICY "activity_log_archive_service_role"
  ON public.activity_log_archive
  TO service_role
  USING (TRUE) WITH CHECK (TRUE);

CREATE INDEX IF NOT EXISTS idx_activity_log_archive_created
  ON public.activity_log_archive (created_at DESC);

-- Prune: verplaats rijen > 12 maanden naar archive, verwijder rijen > 24
-- maanden uit archive. Geeft aantal verplaatste rijen terug.
CREATE OR REPLACE FUNCTION public.prune_audit_log()
RETURNS TABLE(archived_rows integer, purged_rows integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _archived integer := 0;
  _purged   integer := 0;
BEGIN
  WITH moved AS (
    DELETE FROM public.audit_log
    WHERE created_at < NOW() - INTERVAL '12 months'
    RETURNING *
  )
  INSERT INTO public.audit_log_archive
  SELECT * FROM moved;
  GET DIAGNOSTICS _archived = ROW_COUNT;

  DELETE FROM public.audit_log_archive
  WHERE created_at < NOW() - INTERVAL '24 months';
  GET DIAGNOSTICS _purged = ROW_COUNT;

  archived_rows := _archived;
  purged_rows   := _purged;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_audit_log() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_audit_log() TO service_role;

COMMENT ON FUNCTION public.prune_audit_log() IS
  'Verplaatst audit_log-rijen ouder dan 12 maanden naar audit_log_archive en verwijdert archive-rijen ouder dan 24 maanden. Dagelijks aanroepen via cron/service_role.';

CREATE OR REPLACE FUNCTION public.prune_activity_log()
RETURNS TABLE(archived_rows integer, purged_rows integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _archived integer := 0;
  _purged   integer := 0;
BEGIN
  WITH moved AS (
    DELETE FROM public.activity_log
    WHERE created_at < NOW() - INTERVAL '12 months'
    RETURNING *
  )
  INSERT INTO public.activity_log_archive
  SELECT * FROM moved;
  GET DIAGNOSTICS _archived = ROW_COUNT;

  DELETE FROM public.activity_log_archive
  WHERE created_at < NOW() - INTERVAL '24 months';
  GET DIAGNOSTICS _purged = ROW_COUNT;

  archived_rows := _archived;
  purged_rows   := _purged;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_activity_log() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_activity_log() TO service_role;

COMMENT ON FUNCTION public.prune_activity_log() IS
  'Verplaatst activity_log-rijen ouder dan 12 maanden naar activity_log_archive en verwijdert archive-rijen ouder dan 24 maanden. Dagelijks aanroepen via cron/service_role.';

-- ─── PARTITIONING-pad (NIET automatisch uitgevoerd) ──────────────────
-- Partitionering op created_at (maandelijks) helpt voor:
--   * VACUUM-snelheid (oude partities zijn read-only en hoeven niet)
--   * Query-tijd op tijdsvensters (partition pruning)
--   * Bulk-drop van oude data via DROP PARTITION i.p.v. DELETE
--
-- Partitioneren van een BESTAANDE tabel met data is niet in-place mogelijk
-- in Postgres. Het vereist:
--   1. CREATE TABLE audit_log_new (...) PARTITION BY RANGE (created_at)
--   2. CREATE partitie-tabellen per maand (huidig + verleden + toekomst)
--   3. INSERT INTO audit_log_new SELECT * FROM audit_log
--   4. Triggers en FK's overzetten
--   5. ALTER TABLE audit_log RENAME TO audit_log_old
--      ALTER TABLE audit_log_new RENAME TO audit_log
--   6. DROP TABLE audit_log_old
--
-- Tijdens stap 3 mag er NIET naar audit_log geschreven worden, anders
-- verliezen we rijen. Bij 100k writes/dag en een tabel die al honderden
-- miljoenen rijen bevat kan stap 3 uren duren → **vereist een
-- onderhouds-window met schrijf-stop op orders, clients, drivers,
-- vehicles, rate_cards, rate_rules**.
--
-- Omdat de impact groot is en reversibel verkeerd kan gaan, laten we de
-- DDL hieronder gecommentarieerd staan. Het onderhoudsteam kan het
-- uitvoeren in een gepland window, of kiezen voor pg_partman. De
-- compact-trigger en retentie-prune zijn ondertussen actief en halen het
-- grootste deel van de druk al weg.
--
-- Voorbeeld-DDL (uitcommentariëren en aanpassen aan data-volume):
--
-- CREATE TABLE public.audit_log_partitioned (
--   LIKE public.audit_log INCLUDING ALL
-- ) PARTITION BY RANGE (created_at);
--
-- CREATE TABLE public.audit_log_p2026_04
--   PARTITION OF public.audit_log_partitioned
--   FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
-- -- (herhaal per maand voor verleden en 3 maanden toekomst)
--
-- INSERT INTO public.audit_log_partitioned SELECT * FROM public.audit_log;
--
-- BEGIN;
--   ALTER TABLE public.audit_log RENAME TO audit_log_legacy;
--   ALTER TABLE public.audit_log_partitioned RENAME TO audit_log;
--   -- FK's, RLS en indexen opnieuw koppelen volgens baseline.
-- COMMIT;

-- ─── ROLLBACK ────────────────────────────────────────────────────────
-- -- Compact trigger terug naar de oude full-row variant:
-- CREATE OR REPLACE FUNCTION public.audit_trigger_func() … (zie baseline regel 53)
--
-- -- Clients-trigger herstellen:
-- CREATE OR REPLACE TRIGGER audit_clients
--   AFTER INSERT OR DELETE OR UPDATE ON public.clients
--   FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();
--
-- DROP FUNCTION IF EXISTS public.prune_audit_log();
-- DROP FUNCTION IF EXISTS public.prune_activity_log();
-- DROP INDEX IF EXISTS public.idx_audit_log_tenant_created;
-- DROP INDEX IF EXISTS public.idx_audit_log_user_created;
-- DROP INDEX IF EXISTS public.idx_activity_log_action;
-- DROP TABLE IF EXISTS public.audit_log_archive;
-- DROP TABLE IF EXISTS public.activity_log_archive;
