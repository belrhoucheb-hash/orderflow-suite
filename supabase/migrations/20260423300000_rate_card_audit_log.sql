-- Audit-log voor tariefkaarten en tariefregels.
--
-- Tariefwijzigingen raken direct de facturering, dus bij een klantvraag
-- "waarom was mijn rit in februari duurder?" moeten we kunnen herleiden
-- wie wanneer welke regel heeft aangepast, met before/after-snapshots.
-- Deze tabel + triggers vormen de audit-trail; de UI-geschiedenis toont
-- ze per kaart.
--
-- Notitie: we slaan rate_card_id op zonder FK. Als een kaart verwijderd
-- wordt blijft de log bestaan (anders zou CASCADE de geschiedenis wissen
-- bij de eerste delete-actie, wat het hele punt van een audit-log
-- ondermijnt).

-- ─── Tabel ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rate_card_audit_log (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL,
  rate_card_id     UUID        NOT NULL,
  rule_id          UUID,
  action           TEXT        NOT NULL,
  actor_user_id    UUID,
  before_data      JSONB,
  after_data       JSONB,
  changed_fields   TEXT[],
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rate_card_audit_log_action_chk CHECK (
    action IN (
      'card_created', 'card_updated', 'card_deleted',
      'rule_created', 'rule_updated', 'rule_deleted'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_rate_card_audit_log_card
  ON public.rate_card_audit_log (rate_card_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rate_card_audit_log_tenant
  ON public.rate_card_audit_log (tenant_id, created_at DESC);

COMMENT ON TABLE public.rate_card_audit_log IS
  'Audit-trail voor rate_cards en rate_rules. Elke INSERT/UPDATE/DELETE op die tabellen schrijft hier een regel met before/after snapshot. Wordt nooit door een cascade-delete gewist.';

-- ─── RLS ─────────────────────────────────────────────────────────────
ALTER TABLE public.rate_card_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Audit-log: tenant select" ON public.rate_card_audit_log;
CREATE POLICY "Audit-log: tenant select"
  ON public.rate_card_audit_log
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS "Audit-log: service_role full" ON public.rate_card_audit_log;
CREATE POLICY "Audit-log: service_role full"
  ON public.rate_card_audit_log
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- Geen INSERT-policy voor authenticated: alleen de triggers schrijven,
-- en die draaien SECURITY DEFINER zodat ze de check omzeilen. Expliciet
-- geen UPDATE/DELETE-policy: log is append-only.

GRANT SELECT ON public.rate_card_audit_log TO authenticated;
GRANT ALL    ON public.rate_card_audit_log TO service_role;

-- ─── Helper: welke kolommen zijn veranderd? ─────────────────────────
CREATE OR REPLACE FUNCTION public.rate_card_changed_fields(old_row JSONB, new_row JSONB)
RETURNS TEXT[] AS $$
DECLARE
  result TEXT[] := ARRAY[]::TEXT[];
  k TEXT;
BEGIN
  FOR k IN SELECT jsonb_object_keys(new_row) LOOP
    IF k IN ('updated_at', 'created_at') THEN CONTINUE; END IF;
    IF (old_row -> k) IS DISTINCT FROM (new_row -> k) THEN
      result := array_append(result, k);
    END IF;
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ─── Trigger: rate_cards ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_rate_card_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.rate_card_audit_log
      (tenant_id, rate_card_id, action, actor_user_id, after_data)
    VALUES
      (NEW.tenant_id, NEW.id, 'card_created', auth.uid(), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.rate_card_audit_log
      (tenant_id, rate_card_id, action, actor_user_id, before_data, after_data, changed_fields)
    VALUES
      (NEW.tenant_id, NEW.id, 'card_updated', auth.uid(),
       to_jsonb(OLD), to_jsonb(NEW),
       public.rate_card_changed_fields(to_jsonb(OLD), to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.rate_card_audit_log
      (tenant_id, rate_card_id, action, actor_user_id, before_data)
    VALUES
      (OLD.tenant_id, OLD.id, 'card_deleted', auth.uid(), to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS rate_cards_audit_trg ON public.rate_cards;
CREATE TRIGGER rate_cards_audit_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.rate_cards
  FOR EACH ROW EXECUTE FUNCTION public.log_rate_card_change();

-- ─── Trigger: rate_rules ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_rate_rule_change()
RETURNS TRIGGER AS $$
DECLARE
  _tenant_id UUID;
  _card_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _card_id := OLD.rate_card_id;
  ELSE
    _card_id := NEW.rate_card_id;
  END IF;

  SELECT tenant_id INTO _tenant_id FROM public.rate_cards WHERE id = _card_id;
  -- Als de kaart al weg is, valt de rule-delete buiten scope (kaart-trigger dekt het al).
  IF _tenant_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.rate_card_audit_log
      (tenant_id, rate_card_id, rule_id, action, actor_user_id, after_data)
    VALUES
      (_tenant_id, _card_id, NEW.id, 'rule_created', auth.uid(), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.rate_card_audit_log
      (tenant_id, rate_card_id, rule_id, action, actor_user_id, before_data, after_data, changed_fields)
    VALUES
      (_tenant_id, _card_id, NEW.id, 'rule_updated', auth.uid(),
       to_jsonb(OLD), to_jsonb(NEW),
       public.rate_card_changed_fields(to_jsonb(OLD), to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.rate_card_audit_log
      (tenant_id, rate_card_id, rule_id, action, actor_user_id, before_data)
    VALUES
      (_tenant_id, _card_id, OLD.id, 'rule_deleted', auth.uid(), to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS rate_rules_audit_trg ON public.rate_rules;
CREATE TRIGGER rate_rules_audit_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.rate_rules
  FOR EACH ROW EXECUTE FUNCTION public.log_rate_rule_change();

-- --- ROLLBACK -------------------------------------------------------
-- DROP TRIGGER IF EXISTS rate_rules_audit_trg ON public.rate_rules;
-- DROP TRIGGER IF EXISTS rate_cards_audit_trg ON public.rate_cards;
-- DROP FUNCTION IF EXISTS public.log_rate_rule_change();
-- DROP FUNCTION IF EXISTS public.log_rate_card_change();
-- DROP FUNCTION IF EXISTS public.rate_card_changed_fields(JSONB, JSONB);
-- DROP POLICY IF EXISTS "Audit-log: service_role full" ON public.rate_card_audit_log;
-- DROP POLICY IF EXISTS "Audit-log: tenant select"      ON public.rate_card_audit_log;
-- DROP INDEX IF EXISTS idx_rate_card_audit_log_tenant;
-- DROP INDEX IF EXISTS idx_rate_card_audit_log_card;
-- DROP TABLE IF EXISTS public.rate_card_audit_log;
