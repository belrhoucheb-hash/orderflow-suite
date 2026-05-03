import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

const migrationsDir = path.resolve(__dirname, "../../../supabase/migrations");
const sqlByName = fs
  .readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .reduce<Record<string, string>>((acc, name) => {
    acc[name] = fs.readFileSync(path.join(migrationsDir, name), "utf-8");
    return acc;
  }, {});

const allSql = Object.values(sqlByName).join("\n");
const normalizedSql = allSql.replace(/"/g, "").replace(/\s+/g, " ");

function expectSql(fragment: string) {
  expect(normalizedSql).toContain(fragment.replace(/\s+/g, " "));
}

describe("compliance governance migrations", () => {
  it("keeps compliance hidden from primary app navigation", () => {
    const appPath = path.resolve(__dirname, "../../App.tsx");
    const app = fs.readFileSync(appPath, "utf-8");

    expect(app).not.toContain('path="/compliance"');
    expect(app).not.toContain("Compliance");
  });

  it("registers daily retention execution and evidence logging", () => {
    expectSql("CREATE TABLE IF NOT EXISTS public.compliance_job_schedules");
    expectSql("INSERT INTO public.compliance_job_schedules");
    expectSql("run-compliance-retention");
    expectSql("15 2 * * *");
    expectSql("CREATE TABLE IF NOT EXISTS public.retention_runs");
    expectSql("CREATE OR REPLACE FUNCTION public.run_compliance_retention");
    expectSql("auth.role() <> 'service_role'");
  });

  it("protects audit timelines as append-only evidence", () => {
    expectSql("prevent_compliance_module_event_mutation");
    expectSql("prevent_order_compliance_evidence_event_mutation");
    expectSql("prevent_cmr_evidence_mutation");
    expectSql("BEFORE UPDATE OR DELETE ON public.cmr_events");
    expectSql("BEFORE UPDATE OR DELETE ON public.order_compliance_evidence_events");
  });

  it("enforces tenant scoped admin access for compliance foundations", () => {
    [
      "public.data_retention_policies",
      "public.legal_holds",
      "public.order_compliance_evidence",
      "public.order_compliance_checks",
      "public.compliance_modules",
      "public.compliance_job_schedules",
    ].forEach((tableName) => {
      expectSql(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`);
    });

    expectSql("tenant_id = (SELECT public.current_tenant_id())");
    expectSql("tm.role = ANY (ARRAY['owner'::text, 'admin'::text])");
    expectSql("TO service_role USING (true) WITH CHECK (true)");
  });

  it("evaluates order compliance from accepted, verified and unexpired evidence", () => {
    expectSql("CREATE TABLE IF NOT EXISTS public.order_compliance_evidence");
    expectSql("CREATE OR REPLACE FUNCTION public.upsert_order_compliance_evidence");
    expectSql("p_expires_at TIMESTAMPTZ DEFAULT NULL");
    expectSql("CREATE OR REPLACE FUNCTION public.evaluate_order_compliance");
    expectSql("oce.status IN ('accepted', 'verified')");
    expectSql("oce.expires_at IS NULL OR oce.expires_at > now()");
    expectSql("status = 'not_applicable'");
  });

  it("keeps external compliance claims conservative", () => {
    const sprintLine = fs.readFileSync(
      path.resolve(__dirname, "../../../docs/compliance-sprint-line.md"),
      "utf-8",
    );

    expect(sprintLine).toContain("Juridische toets blijft nodig");
    expect(sprintLine).toContain('Product claim blijft "eFTI-ready"');
  });
});
