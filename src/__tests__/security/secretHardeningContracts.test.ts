import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const migration = readFileSync(
  resolve(ROOT, "supabase/migrations/20260429030000_secret_hardening.sql"),
  "utf-8",
);
const integrationHook = readFileSync(
  resolve(ROOT, "src/hooks/useIntegrationCredentials.ts"),
  "utf-8",
);
const smsHook = readFileSync(
  resolve(ROOT, "src/hooks/useSmsSettings.ts"),
  "utf-8",
);
const runtime = readFileSync(
  resolve(ROOT, "supabase/functions/_shared/connectors/runtime.ts"),
  "utf-8",
);
const sendNotification = readFileSync(
  resolve(ROOT, "supabase/functions/send-notification/index.ts"),
  "utf-8",
);

describe("secret hardening contracts", () => {
  it("migration defines secure RPCs for integration and SMS secrets", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.get_integration_credentials_runtime/);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.get_integration_credentials_ui/);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.save_integration_credentials_secure/);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.get_sms_settings_runtime/);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.get_sms_settings_ui/);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.save_sms_settings_secure/);
    expect(migration).toMatch(/vault\.create_secret/);
    expect(migration).toMatch(/vault\.update_secret/);
  });

  it("frontend hooks read secrets through RPCs instead of direct table queries", () => {
    expect(integrationHook).toMatch(/supabase\.rpc\("get_integration_credentials_ui"/);
    expect(integrationHook).toMatch(/supabase\.rpc\("save_integration_credentials_secure"/);
    expect(integrationHook).not.toMatch(/from\("integration_credentials"/);

    expect(smsHook).toMatch(/supabase\.rpc\("get_sms_settings_ui"/);
    expect(smsHook).toMatch(/supabase\.rpc\("save_sms_settings_secure"/);
    expect(smsHook).not.toMatch(/from\("tenant_settings"/);
  });

  it("backend runtime hydrates secrets through secure RPCs", () => {
    expect(runtime).toMatch(/rpc\("get_integration_credentials_runtime"/);
    expect(sendNotification).toMatch(/rpc\(\s*"get_sms_settings_runtime"/);
  });
});
