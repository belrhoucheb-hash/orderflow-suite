import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getSession: vi.fn(),
      getUser: vi.fn(),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));

import { calculateOnTimeMetrics, type StopMetric } from "@/hooks/useOnTimeReport";

function makeMetric(windowStatus: string, waitingTimeMin: number | null): StopMetric {
  return {
    id: `s-${Math.random()}`, window_status: windowStatus, waiting_time_min: waitingTimeMin,
    client_location_id: "loc1", planned_window_start: "08:00", planned_window_end: "10:00",
    actual_arrival_time: "2026-04-04T09:00:00Z",
  };
}

describe("calculateOnTimeMetrics", () => {
  it("calculates on-time percentage", () => {
    const stops = [makeMetric("OP_TIJD", 0), makeMetric("OP_TIJD", 0), makeMetric("TE_LAAT", null), makeMetric("TE_VROEG", 15)];
    const result = calculateOnTimeMetrics(stops);
    expect(result.totalStops).toBe(4);
    expect(result.onTimeCount).toBe(2);
    expect(result.onTimePct).toBe(50);
    expect(result.lateCount).toBe(1);
    expect(result.earlyCount).toBe(1);
  });

  it("calculates average wait time", () => {
    const stops = [makeMetric("TE_VROEG", 10), makeMetric("TE_VROEG", 20), makeMetric("OP_TIJD", 0)];
    const result = calculateOnTimeMetrics(stops);
    expect(result.avgWaitMin).toBe(10);
  });

  it("handles empty array", () => {
    const result = calculateOnTimeMetrics([]);
    expect(result.totalStops).toBe(0);
    expect(result.onTimePct).toBe(0);
    expect(result.avgWaitMin).toBe(0);
  });

  it("groups violations by location", () => {
    const stops = [
      { ...makeMetric("TE_LAAT", null), client_location_id: "loc1" },
      { ...makeMetric("TE_LAAT", null), client_location_id: "loc1" },
      { ...makeMetric("TE_LAAT", null), client_location_id: "loc2" },
    ];
    const result = calculateOnTimeMetrics(stops);
    expect(result.violationsByLocation["loc1"]).toBe(2);
    expect(result.violationsByLocation["loc2"]).toBe(1);
  });
});
