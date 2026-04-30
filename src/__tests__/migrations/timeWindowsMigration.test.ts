// src/__tests__/migrations/timeWindowsMigration.test.ts
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Time Windows Migration SQL", () => {
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

  it("creates location_time_windows table with all columns", () => {
    expectSql("CREATE TABLE IF NOT EXISTS public.location_time_windows");
    expectSql("client_location_id uuid NOT NULL");
    expectSql("tenant_id uuid NOT NULL");
    expectSql("day_of_week integer NOT NULL");
    expectSql("open_time time without time zone NOT NULL");
    expectSql("close_time time without time zone NOT NULL");
    expectSql("slot_duration_min integer DEFAULT 30 NOT NULL");
    expectSql("max_concurrent_slots integer DEFAULT 1 NOT NULL");
  });

  it("creates slot_bookings table with all columns", () => {
    expectSql("CREATE TABLE IF NOT EXISTS public.slot_bookings");
    expectSql("client_location_id uuid NOT NULL");
    expectSql("order_id uuid");
    expectSql("trip_stop_id uuid");
    expectSql("slot_date date NOT NULL");
    expectSql("slot_start time without time zone NOT NULL");
    expectSql("slot_end time without time zone NOT NULL");
    expectSql("status text DEFAULT 'GEBOEKT'::text NOT NULL");
    expectSql("booked_by uuid");
  });

  it("alters trip_stops with time window columns", () => {
    expectSql("planned_window_start time without time zone");
    expectSql("planned_window_end time without time zone");
    expectSql("waiting_time_min integer");
    expectSql("window_status text DEFAULT 'ONBEKEND'::text");
  });

  it("enables RLS on both new tables", () => {
    expectSql("ALTER TABLE public.location_time_windows ENABLE ROW LEVEL SECURITY");
    expectSql("ALTER TABLE public.slot_bookings ENABLE ROW LEVEL SECURITY");
  });

  it("creates tenant-scoped RLS policies using get_user_tenant_id()", () => {
    expect(normalizedSql).toContain("get_user_tenant_id()");
    expect(normalizedSql).toContain("location_time_windows_select");
    expect(normalizedSql).toContain("slot_bookings_select");
  });

  it("creates index on slot_bookings for availability lookups", () => {
    expect(normalizedSql).toContain("CREATE INDEX");
    expect(normalizedSql).toContain("idx_slot_bookings_location_date");
  });
});
