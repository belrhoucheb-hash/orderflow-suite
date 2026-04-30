// src/__tests__/components/ConsolidationCard.test.tsx
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, afterEach } from "vitest";
import { ConsolidationCard } from "@/components/planning/ConsolidationCard";
import type { ConsolidationGroup } from "@/types/consolidation";

function makeGroup(overrides: Partial<ConsolidationGroup> = {}): ConsolidationGroup {
  return {
    id: "g1",
    tenant_id: "t1",
    name: "Regio Amsterdam 04-apr",
    planned_date: "2026-04-04",
    status: "VOORSTEL",
    vehicle_id: null,
    total_weight_kg: 5000,
    total_pallets: 12,
    total_distance_km: 85.5,
    estimated_duration_min: 180,
    utilization_pct: 72.5,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    orders: [
      { id: "co1", group_id: "g1", order_id: "o1", stop_sequence: 1, pickup_sequence: null, created_at: "", order: { id: "o1", order_number: 101, client_name: "Bakkerij B", delivery_address: "Amsterdam", weight_kg: 2000, quantity: 4, requirements: [], time_window_start: "08:00", time_window_end: "12:00" } },
      { id: "co2", group_id: "g1", order_id: "o2", stop_sequence: 2, pickup_sequence: null, created_at: "", order: { id: "o2", order_number: 102, client_name: "Slagerij S", delivery_address: "Amsterdam", weight_kg: 3000, quantity: 8, requirements: ["KOELING"], time_window_start: null, time_window_end: null } },
    ],
    ...overrides,
  };
}

describe("ConsolidationCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders group name and region", () => {
    render(<ConsolidationCard group={makeGroup()} onApprove={vi.fn()} onReject={vi.fn()} />);
    expect(screen.getByText("Regio Amsterdam 04-apr")).toBeDefined();
  });

  it("shows weight, pallets, and utilization", () => {
    render(<ConsolidationCard group={makeGroup()} onApprove={vi.fn()} onReject={vi.fn()} />);
    expect(screen.getByText(/5000/)).toBeDefined();
    expect(screen.getByText(/12/)).toBeDefined();
    expect(screen.getByText(/72\.5%/)).toBeDefined();
  });

  it("lists orders inside the group", () => {
    render(<ConsolidationCard group={makeGroup()} onApprove={vi.fn()} onReject={vi.fn()} />);
    expect(screen.getByText(/Bakkerij B/)).toBeDefined();
    expect(screen.getByText(/Slagerij S/)).toBeDefined();
  });

  it("calls onApprove when approve button is clicked", () => {
    const onApprove = vi.fn();
    render(<ConsolidationCard group={makeGroup()} onApprove={onApprove} onReject={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /goedkeuren/i }));
    expect(onApprove).toHaveBeenCalledWith("g1");
  });

  it("calls onReject when reject button is clicked", () => {
    const onReject = vi.fn();
    render(<ConsolidationCard group={makeGroup()} onApprove={vi.fn()} onReject={onReject} />);
    fireEvent.click(screen.getByRole("button", { name: /verwerpen/i }));
    expect(onReject).toHaveBeenCalledWith("g1");
  });

  it("hides action buttons when status is not VOORSTEL", () => {
    render(<ConsolidationCard group={makeGroup({ status: "GOEDGEKEURD" })} onApprove={vi.fn()} onReject={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /goedkeuren/i })).toBeNull();
  });
});
