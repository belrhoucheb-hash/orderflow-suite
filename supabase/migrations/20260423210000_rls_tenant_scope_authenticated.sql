-- Tenant-scope RLS-policies die nu cross-tenant lezen toestaan.
-- Vervangt USING (true) voor SELECT/UPDATE op authenticated-rol door tenant-checks.
-- Service-role-policies blijven ongewijzigd.

-- ai_decisions: heeft tenant_id-kolom
DROP POLICY IF EXISTS "Anyone can read ai_decisions" ON "public"."ai_decisions";
CREATE POLICY "Anyone can read ai_decisions" ON "public"."ai_decisions"
  FOR SELECT USING ("tenant_id" = "public"."current_tenant_id"());

DROP POLICY IF EXISTS "Anyone can update ai_decisions" ON "public"."ai_decisions";
CREATE POLICY "Anyone can update ai_decisions" ON "public"."ai_decisions"
  FOR UPDATE USING ("tenant_id" = "public"."current_tenant_id"());

-- anomalies: heeft tenant_id-kolom
DROP POLICY IF EXISTS "Anyone can read anomalies" ON "public"."anomalies";
CREATE POLICY "Anyone can read anomalies" ON "public"."anomalies"
  FOR SELECT USING ("tenant_id" = "public"."current_tenant_id"());

DROP POLICY IF EXISTS "Anyone can update anomalies" ON "public"."anomalies";
CREATE POLICY "Anyone can update anomalies" ON "public"."anomalies"
  FOR UPDATE USING ("tenant_id" = "public"."current_tenant_id"());

-- confidence_metrics: heeft tenant_id-kolom
DROP POLICY IF EXISTS "Anyone can read confidence_metrics" ON "public"."confidence_metrics";
CREATE POLICY "Anyone can read confidence_metrics" ON "public"."confidence_metrics"
  FOR SELECT USING ("tenant_id" = "public"."current_tenant_id"());

DROP POLICY IF EXISTS "Anyone can update confidence_metrics" ON "public"."confidence_metrics";
CREATE POLICY "Anyone can update confidence_metrics" ON "public"."confidence_metrics"
  FOR UPDATE USING ("tenant_id" = "public"."current_tenant_id"());

-- disruptions: heeft tenant_id-kolom
DROP POLICY IF EXISTS "Anyone can read disruptions" ON "public"."disruptions";
CREATE POLICY "Anyone can read disruptions" ON "public"."disruptions"
  FOR SELECT USING ("tenant_id" = "public"."current_tenant_id"());

DROP POLICY IF EXISTS "Anyone can update disruptions" ON "public"."disruptions";
CREATE POLICY "Anyone can update disruptions" ON "public"."disruptions"
  FOR UPDATE USING ("tenant_id" = "public"."current_tenant_id"());

-- order_events: heeft tenant_id-kolom
DROP POLICY IF EXISTS "Anyone can read order_events" ON "public"."order_events";
CREATE POLICY "Anyone can read order_events" ON "public"."order_events"
  FOR SELECT USING ("tenant_id" = "public"."current_tenant_id"());

DROP POLICY IF EXISTS "Anyone can update order_events" ON "public"."order_events";
CREATE POLICY "Anyone can update order_events" ON "public"."order_events"
  FOR UPDATE USING ("tenant_id" = "public"."current_tenant_id"());

-- replan_suggestions: heeft tenant_id-kolom
DROP POLICY IF EXISTS "Anyone can read replan_suggestions" ON "public"."replan_suggestions";
CREATE POLICY "Anyone can read replan_suggestions" ON "public"."replan_suggestions"
  FOR SELECT USING ("tenant_id" = "public"."current_tenant_id"());

DROP POLICY IF EXISTS "Anyone can update replan_suggestions" ON "public"."replan_suggestions";
CREATE POLICY "Anyone can update replan_suggestions" ON "public"."replan_suggestions"
  FOR UPDATE USING ("tenant_id" = "public"."current_tenant_id"());

-- vehicle_positions: heeft tenant_id-kolom (alleen SELECT-policy was open)
DROP POLICY IF EXISTS "Anyone can read vehicle_positions" ON "public"."vehicle_positions";
CREATE POLICY "Anyone can read vehicle_positions" ON "public"."vehicle_positions"
  FOR SELECT USING ("tenant_id" = "public"."current_tenant_id"());

-- vehicle_check_retention_log: GEEN tenant_id en GEEN vehicle_id (globale audit-log van prune-runs).
-- Alleen owners/admins binnen een tenant mogen retention-runs zien; gewone users niet.
DROP POLICY IF EXISTS "Authenticated read on retention_log" ON "public"."vehicle_check_retention_log";
CREATE POLICY "Authenticated read on retention_log" ON "public"."vehicle_check_retention_log"
  FOR SELECT TO "authenticated"
  USING (EXISTS (
    SELECT 1 FROM "public"."tenant_members" "tm"
    WHERE "tm"."user_id" = ( SELECT "auth"."uid"() )
      AND "tm"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])
  ));

-- user_roles: heeft user_id maar geen tenant_id. Een gebruiker mag alleen zijn eigen rollen zien.
DROP POLICY IF EXISTS "Authenticated users can view roles" ON "public"."user_roles";
CREATE POLICY "Authenticated users can view roles" ON "public"."user_roles"
  FOR SELECT TO "authenticated"
  USING ("user_id" = ( SELECT "auth"."uid"() ));
