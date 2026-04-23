-- ══════════════════════════════════════════════════════════════════════════
-- Sprint 4. Audit-log op drivers via de centrale activity_log tabel.
--
-- Waarom:
--   Chauffeurdata bevat gevoelige velden (BSN, IBAN, contracturen, indienst-
--   en uitdienstdatum). Zonder audit weet niemand wie een BSN wijzigde of
--   wanneer iemand uit dienst werd gezet. Dat is een probleem voor AVG en
--   voor interne verantwoording.
--
-- Aanpak:
--   AFTER INSERT/UPDATE/DELETE trigger op public.drivers die één rij in
--   public.activity_log schrijft per event. Het schema is:
--     (tenant_id, user_id, entity_type, entity_id, action, changes jsonb)
--   Zie baseline.sql rond regel 888.
--
--   action           : 'create' | 'update' | 'delete'
--   entity_type      : 'driver'
--   entity_id        : id van de chauffeur
--   changes (UPDATE) : JSON diff van kolommen die daadwerkelijk veranderden,
--                      vorm {"<col>": {"old": ..., "new": ...}}.
--   changes (INSERT) : volledige rij als {"new": {...}} (gevoelige velden
--                      redacted).
--   changes (DELETE) : volledige rij als {"old": {...}} (gevoelige velden
--                      redacted).
--
--   Gevoelige kolommen (bsn, iban) worden nooit letterlijk gelogd. Bij
--   wijziging loggen we alleen {"old": "redacted", "new": "redacted"} zodat
--   de audit-trail wel ziet dát het veld veranderd is, niet wat de waarde
--   was.
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.log_driver_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id  uuid;
  v_entity_id  uuid;
  v_user_id    uuid := auth.uid();
  v_action     text;
  v_changes    jsonb := '{}'::jsonb;
  v_old_row    jsonb;
  v_new_row    jsonb;
  v_key        text;
  v_old_val    jsonb;
  v_new_val    jsonb;
  v_sensitive  text[] := ARRAY['bsn', 'iban'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action    := 'create';
    v_tenant_id := NEW.tenant_id;
    v_entity_id := NEW.id;
    v_new_row   := to_jsonb(NEW);

    -- Gevoelige velden redacten in de snapshot.
    FOREACH v_key IN ARRAY v_sensitive LOOP
      IF v_new_row ? v_key AND v_new_row -> v_key IS NOT NULL
         AND v_new_row ->> v_key <> '' THEN
        v_new_row := jsonb_set(v_new_row, ARRAY[v_key], to_jsonb('redacted'::text));
      END IF;
    END LOOP;

    v_changes := jsonb_build_object('new', v_new_row);

  ELSIF TG_OP = 'UPDATE' THEN
    v_action    := 'update';
    v_tenant_id := NEW.tenant_id;
    v_entity_id := NEW.id;
    v_old_row   := to_jsonb(OLD);
    v_new_row   := to_jsonb(NEW);

    -- Alleen kolommen loggen die daadwerkelijk veranderd zijn.
    FOR v_key IN
      SELECT jsonb_object_keys(v_new_row)
    LOOP
      v_old_val := v_old_row -> v_key;
      v_new_val := v_new_row -> v_key;

      IF v_old_val IS DISTINCT FROM v_new_val THEN
        IF v_key = ANY (v_sensitive) THEN
          -- Wel loggen dát het veld veranderde, niet de waarde.
          v_changes := v_changes || jsonb_build_object(
            v_key,
            jsonb_build_object('old', 'redacted', 'new', 'redacted')
          );
        ELSE
          v_changes := v_changes || jsonb_build_object(
            v_key,
            jsonb_build_object('old', v_old_val, 'new', v_new_val)
          );
        END IF;
      END IF;
    END LOOP;

    -- Geen echte wijziging, geen log-rij (bv. updated_at-only touch).
    IF v_changes = '{}'::jsonb THEN
      RETURN NEW;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    v_action    := 'delete';
    v_tenant_id := OLD.tenant_id;
    v_entity_id := OLD.id;
    v_old_row   := to_jsonb(OLD);

    FOREACH v_key IN ARRAY v_sensitive LOOP
      IF v_old_row ? v_key AND v_old_row -> v_key IS NOT NULL
         AND v_old_row ->> v_key <> '' THEN
        v_old_row := jsonb_set(v_old_row, ARRAY[v_key], to_jsonb('redacted'::text));
      END IF;
    END LOOP;

    v_changes := jsonb_build_object('old', v_old_row);
  END IF;

  INSERT INTO public.activity_log (
    tenant_id, user_id, entity_type, entity_id, action, changes
  ) VALUES (
    v_tenant_id, v_user_id, 'driver', v_entity_id, v_action, v_changes
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.log_driver_activity() IS
  'Trigger-functie die INSERT/UPDATE/DELETE op drivers logt in activity_log. Gevoelige kolommen (bsn, iban) worden als "redacted" opgeslagen zodat de audit-trail het event ziet zonder de waarde bloot te geven.';

-- Trigger idempotent (her)aankoppelen.
DROP TRIGGER IF EXISTS drivers_activity_log ON public.drivers;
CREATE TRIGGER drivers_activity_log
  AFTER INSERT OR UPDATE OR DELETE ON public.drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.log_driver_activity();

-- ─── ROLLBACK ────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS drivers_activity_log ON public.drivers;
-- DROP FUNCTION IF EXISTS public.log_driver_activity();
