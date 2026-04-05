// src/__tests__/components/ConsolidationMap.test.tsx
import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect } from "vitest";

// Mock leaflet
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: any) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div data-testid="tile-layer" />,
  Marker: ({ children }: any) => <div data-testid="map-marker">{children}</div>,
  Popup: ({ children }: any) => <div data-testid="map-popup">{children}</div>,
  Circle: ({ children }: any) => <div data-testid="map-circle">{children}</div>,
}));

vi.mock("leaflet", () => ({
  default: {
    icon: vi.fn().mockReturnValue({}),
    divIcon: vi.fn().mockReturnValue({}),
    latLng: vi.fn(),
  },
  icon: vi.fn().mockReturnValue({}),
  divIcon: vi.fn().mockReturnValue({}),
  latLng: vi.fn(),
}));

import { ConsolidationMap } from "@/components/planning/ConsolidationMap";
import type { ConsolidationGroup } from "@/types/consolidation";

describe("ConsolidationMap", () => {
  const groups: ConsolidationGroup[] = [
    {
      id: "g1", tenant_id: "t1", name: "Amsterdam", planned_date: "2026-04-04",
      status: "VOORSTEL", vehicle_id: null, total_weight_kg: 5000, total_pallets: 12,
      total_distance_km: 85, estimated_duration_min: 180, utilization_pct: 72,
      created_by: null, created_at: "", updated_at: "",
      orders: [
        { id: "co1", group_id: "g1", order_id: "o1", stop_sequence: 1, pickup_sequence: null, created_at: "",
          order: { id: "o1", order_number: 101, client_name: "Client A", delivery_address: "Amsterdam", weight_kg: 2000, quantity: 4, requirements: [], time_window_start: null, time_window_end: null } },
      ],
    },
  ];

  const coordMap = new Map([["o1", { lat: 52.37, lng: 4.89 }]]);

  it("renders map container", () => {
    render(<ConsolidationMap groups={groups} coordMap={coordMap} />);
    expect(screen.getByTestId("map-container")).toBeDefined();
  });

  it("renders markers for orders with coordinates", () => {
    render(<ConsolidationMap groups={groups} coordMap={coordMap} />);
    const markers = screen.getAllByTestId("map-marker");
    expect(markers.length).toBeGreaterThanOrEqual(1);
  });
});
