import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Consolidation Migration SQL", () => {
  const migrationsDir = path.resolve(__dirname, "../../../supabase/migrations");
  const sql = fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => fs.readFileSync(path.join(migrationsDir, name), "utf-8"))
    .join("\n");
  const normalizedSql = sql.replace(/"/g, "").replace(/\s+/g, " ");

  function expectSql(fragment: string) {
    expect(normalizedSql).toContain(fragment.replace(/\s+/g, " "));
  }

  it("creates consolidation_groups table", () => {
    expectSql("CREATE TABLE IF NOT EXISTS public.consolidation_groups");
    expectSql("tenant_id uuid NOT NULL");
    expectSql("name text NOT NULL");
    expectSql("planned_date date NOT NULL");
    expectSql("status text DEFAULT 'VOORSTEL'::text NOT NULL");
    expectSql("vehicle_id uuid");
    expectSql("total_weight_kg numeric(10,2)");
    expectSql("total_pallets integer");
    expectSql("total_distance_km numeric(10,2)");
    expectSql("estimated_duration_min integer");
    expectSql("utilization_pct numeric(5,2)");
    expectSql("created_by uuid");
  });

  it("creates consolidation_orders table", () => {
    expectSql("CREATE TABLE IF NOT EXISTS public.consolidation_orders");
    expectSql("group_id uuid NOT NULL");
    expectSql("order_id uuid NOT NULL");
    expectSql("stop_sequence integer");
    expectSql("pickup_sequence integer");
  });

  it("enables RLS on both tables", () => {
    expectSql("ALTER TABLE public.consolidation_groups ENABLE ROW LEVEL SECURITY");
    expectSql("ALTER TABLE public.consolidation_orders ENABLE ROW LEVEL SECURITY");
  });

  it("uses get_user_tenant_id() for RLS", () => {
    expect(normalizedSql).toContain("get_user_tenant_id()");
  });
});
