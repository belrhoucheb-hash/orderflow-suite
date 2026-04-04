import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect } from "vitest";

// Mock leaflet (same pattern as existing planning-components tests)
vi.mock("leaflet", () => ({
  default: {
    map: vi.fn().mockReturnValue({
      setView: vi.fn().mockReturnThis(),
      remove: vi.fn(),
      fitBounds: vi.fn(),
      addLayer: vi.fn(),
    }),
    tileLayer: vi.fn().mockReturnValue({ addTo: vi.fn() }),
    marker: vi.fn().mockReturnValue({
      addTo: vi.fn().mockReturnThis(),
      bindPopup: vi.fn().mockReturnThis(),
      remove: vi.fn(),
    }),
    circle: vi.fn().mockReturnValue({
      addTo: vi.fn().mockReturnThis(),
      remove: vi.fn(),
    }),
    divIcon: vi.fn().mockReturnValue({}),
    latLngBounds: vi.fn().mockReturnValue({
      extend: vi.fn().mockReturnThis(),
      isValid: vi.fn().mockReturnValue(true),
    }),
    layerGroup: vi.fn().mockReturnValue({
      addTo: vi.fn().mockReturnThis(),
      clearLayers: vi.fn(),
    }),
  },
}));
vi.mock("leaflet/dist/leaflet.css", () => ({}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

import { ConsolidationMap } from "@/components/planning/ConsolidationMap";
import type { ConsolidationGroup } from "@/types/consolidation";

const mockGroups: ConsolidationGroup[] = [
  {
    id: "g1",
    tenant_id: "t1",
    name: "Groep Amsterdam",
    planned_date: "2026-04-04",
    status: "VOORSTEL",
    vehicle_id: null,
    total_weight_kg: 800,
    total_pallets: 5,
    total_distance_km: 20,
    estimated_duration_min: 60,
    utilization_pct: 0.40,
    created_by: null,
    created_at: "2026-04-01T10:00:00Z",
    updated_at: "2026-04-01T10:00:00Z",
    orders: [
      {
        id: "co1",
        group_id: "g1",
        order_id: "o1",
        stop_sequence: 1,
        pickup_sequence: null,
        created_at: "2026-04-01T10:00:00Z",
        order: {
          id: "o1",
          order_number: 1001,
          client_name: "Klant A",
          delivery_address: "Damrak 1, Amsterdam",
          weight_kg: 400,
          quantity: 2,
          requirements: [],
          time_window_start: null,
          time_window_end: null,
        },
      },
    ],
  },
  {
    id: "g2",
    tenant_id: "t1",
    name: "Groep Rotterdam",
    planned_date: "2026-04-04",
    status: "GOEDGEKEURD",
    vehicle_id: "v1",
    total_weight_kg: 1200,
    total_pallets: 8,
    total_distance_km: 35,
    estimated_duration_min: 90,
    utilization_pct: 0.60,
    created_by: null,
    created_at: "2026-04-01T10:00:00Z",
    updated_at: "2026-04-01T10:00:00Z",
    orders: [
      {
        id: "co2",
        group_id: "g2",
        order_id: "o2",
        stop_sequence: 1,
        pickup_sequence: null,
        created_at: "2026-04-01T10:00:00Z",
        order: {
          id: "o2",
          order_number: 1002,
          client_name: "Klant B",
          delivery_address: "Coolsingel 5, Rotterdam",
          weight_kg: 600,
          quantity: 4,
          requirements: [],
          time_window_start: null,
          time_window_end: null,
        },
      },
    ],
  },
];

describe("ConsolidationMap", () => {
  it("renders the map container element", () => {
    render(<ConsolidationMap groups={mockGroups} coordMap={new Map()} />);
    expect(screen.getByTestId("consolidation-map-container")).toBeInTheDocument();
  });

  it("renders markers legend for each group", () => {
    render(<ConsolidationMap groups={mockGroups} coordMap={new Map()} />);
    // Legend should show group names
    expect(screen.getByText("Groep Amsterdam")).toBeInTheDocument();
    expect(screen.getByText("Groep Rotterdam")).toBeInTheDocument();
  });
});
