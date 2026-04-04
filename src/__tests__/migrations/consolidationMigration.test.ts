import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Consolidation Migration SQL", () => {
  const sql = fs.readFileSync(
    path.resolve(__dirname, "../../../supabase/migrations/20260404110000_consolidation_groups.sql"), "utf-8"
  );

  it("creates consolidation_groups table", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.consolidation_groups");
    expect(sql).toContain("tenant_id UUID NOT NULL REFERENCES public.tenants(id)");
    expect(sql).toContain("name TEXT NOT NULL");
    expect(sql).toContain("planned_date DATE NOT NULL");
    expect(sql).toContain("status TEXT NOT NULL DEFAULT 'VOORSTEL'");
    expect(sql).toContain("vehicle_id UUID REFERENCES public.vehicles(id)");
    expect(sql).toContain("total_weight_kg NUMERIC(10,2)");
    expect(sql).toContain("total_pallets INTEGER");
    expect(sql).toContain("total_distance_km NUMERIC(10,2)");
    expect(sql).toContain("estimated_duration_min INTEGER");
    expect(sql).toContain("utilization_pct NUMERIC(5,2)");
    expect(sql).toContain("created_by UUID REFERENCES auth.users(id)");
  });

  it("creates consolidation_orders table", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.consolidation_orders");
    expect(sql).toContain("group_id UUID NOT NULL REFERENCES public.consolidation_groups(id)");
    expect(sql).toContain("order_id UUID NOT NULL REFERENCES public.orders(id)");
    expect(sql).toContain("stop_sequence INTEGER");
    expect(sql).toContain("pickup_sequence INTEGER");
  });

  it("enables RLS on both tables", () => {
    expect(sql).toContain("ALTER TABLE public.consolidation_groups ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE public.consolidation_orders ENABLE ROW LEVEL SECURITY");
  });

  it("uses get_user_tenant_id() for RLS", () => {
    expect(sql).toContain("get_user_tenant_id()");
  });
});
