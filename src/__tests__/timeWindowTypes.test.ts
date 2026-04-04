// src/__tests__/timeWindowTypes.test.ts
import { describe, it, expect } from "vitest";
import type {
  LocationTimeWindow,
  SlotBooking,
  SlotBookingStatus,
  WindowStatus,
  TimeSlot,
  SlotAvailability,
} from "@/types/timeWindows";
import {
  SLOT_BOOKING_STATUSES,
  WINDOW_STATUSES,
  WINDOW_STATUS_LABELS,
  SLOT_BOOKING_STATUS_LABELS,
} from "@/types/timeWindows";

describe("timeWindows types", () => {
  it("exports all slot booking statuses", () => {
    expect(SLOT_BOOKING_STATUSES).toEqual(["GEBOEKT", "BEVESTIGD", "GEANNULEERD", "VERLOPEN"]);
  });

  it("exports all window statuses", () => {
    expect(WINDOW_STATUSES).toEqual(["ONBEKEND", "OP_TIJD", "TE_VROEG", "TE_LAAT", "GEMIST"]);
  });

  it("has Dutch labels for every window status", () => {
    for (const s of WINDOW_STATUSES) {
      expect(WINDOW_STATUS_LABELS[s]).toBeDefined();
      expect(WINDOW_STATUS_LABELS[s].label).toBeTruthy();
      expect(WINDOW_STATUS_LABELS[s].color).toBeTruthy();
    }
  });

  it("has Dutch labels for every slot booking status", () => {
    for (const s of SLOT_BOOKING_STATUSES) {
      expect(SLOT_BOOKING_STATUS_LABELS[s]).toBeDefined();
      expect(SLOT_BOOKING_STATUS_LABELS[s].label).toBeTruthy();
      expect(SLOT_BOOKING_STATUS_LABELS[s].color).toBeTruthy();
    }
  });

  it("LocationTimeWindow interface is structurally valid", () => {
    const tw: LocationTimeWindow = {
      id: "uuid-1",
      client_location_id: "uuid-2",
      tenant_id: "uuid-3",
      day_of_week: 0,
      open_time: "08:00",
      close_time: "17:00",
      slot_duration_min: 30,
      max_concurrent_slots: 2,
      notes: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    expect(tw.day_of_week).toBe(0);
  });

  it("SlotBooking interface is structurally valid", () => {
    const sb: SlotBooking = {
      id: "uuid-1",
      tenant_id: "uuid-2",
      client_location_id: "uuid-3",
      order_id: "uuid-4",
      trip_stop_id: null,
      slot_date: "2026-04-04",
      slot_start: "09:00",
      slot_end: "09:30",
      status: "GEBOEKT",
      booked_by: "uuid-5",
      notes: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    expect(sb.status).toBe("GEBOEKT");
  });
});
