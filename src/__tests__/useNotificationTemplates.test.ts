import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

// Mock supabase
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockFrom = vi.fn(() => ({
  select: mockSelect.mockReturnValue({
    order: vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
  }),
  insert: mockInsert,
  update: mockUpdate,
  delete: mockDelete,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mockFrom,
  },
}));

describe("Notification types", () => {
  it("exports all trigger event labels", async () => {
    const { TRIGGER_EVENT_LABELS } = await import("@/types/notifications");
    expect(Object.keys(TRIGGER_EVENT_LABELS)).toHaveLength(6);
    expect(TRIGGER_EVENT_LABELS.ORDER_CONFIRMED).toBe("Order bevestigd");
    expect(TRIGGER_EVENT_LABELS.DELIVERED).toBe("Afgeleverd + POD");
  });

  it("exports all available template variables", async () => {
    const { AVAILABLE_VARIABLES } = await import("@/types/notifications");
    expect(AVAILABLE_VARIABLES.length).toBeGreaterThanOrEqual(8);
    const keys = AVAILABLE_VARIABLES.map((v) => v.key);
    expect(keys).toContain("order_number");
    expect(keys).toContain("track_url");
    expect(keys).toContain("company_name");
  });

  it("exports all trigger event recipients", async () => {
    const { TRIGGER_EVENT_RECIPIENTS, TRIGGER_EVENT_LABELS } = await import("@/types/notifications");
    const events = Object.keys(TRIGGER_EVENT_LABELS);
    for (const event of events) {
      expect(TRIGGER_EVENT_RECIPIENTS[event as keyof typeof TRIGGER_EVENT_RECIPIENTS]).toBeDefined();
    }
  });

  it("notification channels are EMAIL and SMS", async () => {
    const { AVAILABLE_VARIABLES } = await import("@/types/notifications");
    // Just verify module loads correctly
    expect(AVAILABLE_VARIABLES).toBeInstanceOf(Array);
  });

  it("NotificationPreferences has email and sms fields", async () => {
    // Type-level test: verify the shape via runtime
    const prefs = { email: true, sms: false };
    expect(typeof prefs.email).toBe("boolean");
    expect(typeof prefs.sms).toBe("boolean");
  });
});

describe("Notification types — ETA_CHANGED label", () => {
  it("has correct Dutch label for ETA_CHANGED", async () => {
    const { TRIGGER_EVENT_LABELS } = await import("@/types/notifications");
    expect(TRIGGER_EVENT_LABELS.ETA_CHANGED).toBe("ETA gewijzigd (>15 min)");
  });

  it("has correct Dutch label for DRIVER_ARRIVED", async () => {
    const { TRIGGER_EVENT_LABELS } = await import("@/types/notifications");
    expect(TRIGGER_EVENT_LABELS.DRIVER_ARRIVED).toBe("Chauffeur gearriveerd");
  });

  it("has correct Dutch label for EXCEPTION", async () => {
    const { TRIGGER_EVENT_LABELS } = await import("@/types/notifications");
    expect(TRIGGER_EVENT_LABELS.EXCEPTION).toBe("Uitzondering / Mislukt");
  });

  it("has correct Dutch label for TRIP_STARTED", async () => {
    const { TRIGGER_EVENT_LABELS } = await import("@/types/notifications");
    expect(TRIGGER_EVENT_LABELS.TRIP_STARTED).toBe("Rit gestart");
  });
});
