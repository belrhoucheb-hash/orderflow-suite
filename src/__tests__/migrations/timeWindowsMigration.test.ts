// src/__tests__/migrations/timeWindowsMigration.test.ts
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Time Windows Migration SQL", () => {
  const sql = fs.readFileSync(
    path.resolve(__dirname, "../../../supabase/migrations/20260404100000_time_windows_and_slots.sql"),
    "utf-8"
  );

  it("creates location_time_windows table with all columns", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.location_time_windows");
    expect(sql).toContain("client_location_id UUID NOT NULL REFERENCES public.client_locations(id)");
    expect(sql).toContain("tenant_id UUID NOT NULL REFERENCES public.tenants(id)");
    expect(sql).toContain("day_of_week INTEGER NOT NULL");
    expect(sql).toContain("open_time TIME NOT NULL");
    expect(sql).toContain("close_time TIME NOT NULL");
    expect(sql).toContain("slot_duration_min INTEGER NOT NULL DEFAULT 30");
    expect(sql).toContain("max_concurrent_slots INTEGER NOT NULL DEFAULT 1");
  });

  it("creates slot_bookings table with all columns", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.slot_bookings");
    expect(sql).toContain("client_location_id UUID NOT NULL REFERENCES public.client_locations(id)");
    expect(sql).toContain("order_id UUID REFERENCES public.orders(id)");
    expect(sql).toContain("trip_stop_id UUID REFERENCES public.trip_stops(id)");
    expect(sql).toContain("slot_date DATE NOT NULL");
    expect(sql).toContain("slot_start TIME NOT NULL");
    expect(sql).toContain("slot_end TIME NOT NULL");
    expect(sql).toContain("status TEXT NOT NULL DEFAULT 'GEBOEKT'");
    expect(sql).toContain("booked_by UUID REFERENCES auth.users(id)");
  });

  it("alters trip_stops with time window columns", () => {
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS planned_window_start TIME");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS planned_window_end TIME");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS waiting_time_min INTEGER");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS window_status TEXT DEFAULT 'ONBEKEND'");
  });

  it("enables RLS on both new tables", () => {
    expect(sql).toContain("ALTER TABLE public.location_time_windows ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE public.slot_bookings ENABLE ROW LEVEL SECURITY");
  });

  it("creates tenant-scoped RLS policies using get_user_tenant_id()", () => {
    expect(sql).toContain("get_user_tenant_id()");
    expect(sql).toContain("location_time_windows_select");
    expect(sql).toContain("slot_bookings_select");
  });

  it("creates index on slot_bookings for availability lookups", () => {
    expect(sql).toContain("CREATE INDEX");
    expect(sql).toContain("idx_slot_bookings_location_date");
  });
});
