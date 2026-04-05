// src/__tests__/slotAvailability.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));

import { computeSlotAvailability } from "@/hooks/useSlotBookings";
import type { LocationTimeWindow, SlotBooking } from "@/types/timeWindows";

function makeTW(overrides: Partial<LocationTimeWindow> = {}): LocationTimeWindow {
  return {
    id: "tw1",
    client_location_id: "loc1",
    tenant_id: "t1",
    day_of_week: 0,
    open_time: "08:00",
    close_time: "10:00",
    slot_duration_min: 30,
    max_concurrent_slots: 2,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeBooking(slotStart: string, status = "GEBOEKT"): SlotBooking {
  return {
    id: `sb-${slotStart}`,
    tenant_id: "t1",
    client_location_id: "loc1",
    order_id: "o1",
    trip_stop_id: null,
    slot_date: "2026-04-04",
    slot_start: slotStart,
    slot_end: "unused",
    status: status as any,
    booked_by: null,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("computeSlotAvailability", () => {
  it("generates correct number of slots", () => {
    const tw = makeTW(); // 08:00-10:00, 30min = 4 slots
    const result = computeSlotAvailability(tw, []);
    expect(result).toHaveLength(4);
    expect(result[0].slot.start).toBe("08:00");
    expect(result[0].slot.end).toBe("08:30");
    expect(result[3].slot.start).toBe("09:30");
    expect(result[3].slot.end).toBe("10:00");
  });

  it("all slots fully available when no bookings", () => {
    const tw = makeTW();
    const result = computeSlotAvailability(tw, []);
    for (const s of result) {
      expect(s.available).toBe(2);
      expect(s.bookedCount).toBe(0);
    }
  });

  it("reduces availability for booked slots", () => {
    const tw = makeTW();
    const bookings = [makeBooking("08:00"), makeBooking("08:00")];
    const result = computeSlotAvailability(tw, bookings);
    expect(result[0].bookedCount).toBe(2);
    expect(result[0].available).toBe(0);
    expect(result[1].available).toBe(2); // 08:30 unaffected
  });

  it("ignores cancelled and expired bookings", () => {
    const tw = makeTW();
    const bookings = [makeBooking("08:00", "GEANNULEERD"), makeBooking("08:00", "VERLOPEN")];
    const result = computeSlotAvailability(tw, bookings);
    expect(result[0].bookedCount).toBe(0);
    expect(result[0].available).toBe(2);
  });

  it("handles 15-minute slot duration", () => {
    const tw = makeTW({ slot_duration_min: 15 }); // 08:00-10:00 = 8 slots
    const result = computeSlotAvailability(tw, []);
    expect(result).toHaveLength(8);
    expect(result[0].slot.start).toBe("08:00");
    expect(result[0].slot.end).toBe("08:15");
  });

  it("handles single concurrent slot", () => {
    const tw = makeTW({ max_concurrent_slots: 1 });
    const bookings = [makeBooking("09:00")];
    const result = computeSlotAvailability(tw, bookings);
    const slot0900 = result.find((s) => s.slot.start === "09:00")!;
    expect(slot0900.available).toBe(0);
  });
});
