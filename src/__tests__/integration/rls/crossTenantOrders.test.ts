// RLS integratietest: cross-tenant order isolation.
//
// Bewijst dat een geauthenticeerde user van tenant B GEEN orders van
// tenant A kan lezen, ook niet als ze de query handmatig op tenant_id
// laten filteren of `tenant_id` proberen te overschrijven bij insert.
//
// Skipt automatisch als SUPABASE_TEST_URL ontbreekt.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hasTestDb, setupTenants, type TestContext } from "./setup";

describe.skipIf(!hasTestDb)("RLS: orders zijn tenant-geisoleerd", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTenants();

    // Tenant A maakt een order via service-role.
    await ctx.admin.from("orders").insert({
      tenant_id: ctx.tenantA.id,
      client_name: "Order van A",
      status: "DRAFT",
    });
  }, 30_000);

  afterAll(async () => {
    await ctx?.cleanup();
  });

  it("tenant B ziet geen orders van tenant A", async () => {
    const { data, error } = await ctx.tenantB.authedClient
      .from("orders")
      .select("id, client_name, tenant_id");
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  it("tenant B kan zelfs met expliciete A-filter geen rows krijgen", async () => {
    const { data, error } = await ctx.tenantB.authedClient
      .from("orders")
      .select("id")
      .eq("tenant_id", ctx.tenantA.id);
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  it("tenant B kan geen order voor tenant A inserten", async () => {
    const { error } = await ctx.tenantB.authedClient
      .from("orders")
      .insert({
        tenant_id: ctx.tenantA.id,
        client_name: "Spoof",
        status: "DRAFT",
      });
    expect(error).not.toBeNull();
  });

  it("tenant A ziet zijn eigen order wel", async () => {
    const { data, error } = await ctx.tenantA.authedClient
      .from("orders")
      .select("id, client_name");
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
    expect(data?.[0].client_name).toBe("Order van A");
  });
});
