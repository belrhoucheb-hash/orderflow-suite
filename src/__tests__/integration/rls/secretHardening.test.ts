import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasTestDb, setupTenants, type TestContext } from "./setup";

describe.skipIf(!hasTestDb)("RLS/RPC: secret hardening", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTenants();
  }, 30_000);

  afterAll(async () => {
    if (ctx) {
      await ctx.admin.from("integration_credentials").delete().in("tenant_id", [ctx.tenantA.id, ctx.tenantB.id]);
      await ctx.admin.from("tenant_settings").delete().in("tenant_id", [ctx.tenantA.id, ctx.tenantB.id]);
      await ctx.cleanup();
    }
  });

  it("owner kan integration secrets opslaan zonder plaintext terug in tabel", async () => {
    const { error: saveError } = await ctx.tenantA.authedClient.rpc("save_integration_credentials_secure", {
      p_provider: "snelstart",
      p_enabled: true,
      p_credentials: {
        clientKey: "client-secret-value",
        subscriptionKey: "subscription-secret-value",
        administratieId: "adm-123",
      },
    });
    expect(saveError).toBeNull();

    const { data, error } = await ctx.admin
      .from("integration_credentials")
      .select("credentials")
      .eq("tenant_id", ctx.tenantA.id)
      .eq("provider", "snelstart")
      .single();

    expect(error).toBeNull();
    expect(data?.credentials).toMatchObject({
      administratieId: "adm-123",
    });
    expect(data?.credentials).toHaveProperty("clientKeySecretId");
    expect(data?.credentials).toHaveProperty("subscriptionKeySecretId");
    expect(data?.credentials).not.toHaveProperty("clientKey");
    expect(data?.credentials).not.toHaveProperty("subscriptionKey");
  });

  it("UI RPC geeft geen plaintext integration secrets terug", async () => {
    const { data, error } = await ctx.tenantA.authedClient.rpc("get_integration_credentials_ui", {
      p_provider: "snelstart",
    });

    expect(error).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    expect(row?.credentials).toHaveProperty("__hasStoredSecrets", true);
    expect(row?.credentials).not.toHaveProperty("clientKey");
    expect(row?.credentials).not.toHaveProperty("subscriptionKey");
  });

  it("tenant B kan tenant A runtime secret RPC niet aanroepen", async () => {
    const { data, error } = await ctx.tenantB.authedClient.rpc("get_sms_settings_runtime", {
      p_tenant_id: ctx.tenantA.id,
    });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });
});
