import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect } from "vitest";

// Mocks
vi.mock("@/lib/utils", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }) },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(), insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(), delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
}));

import { ConsolidationCard } from "@/components/planning/ConsolidationCard";
import type { ConsolidationGroup } from "@/types/consolidation";

const mockGroup: ConsolidationGroup = {
  id: "g1",
  tenant_id: "t1",
  name: "Groep Rotterdam Noord",
  planned_date: "2026-04-04",
  status: "VOORSTEL",
  vehicle_id: null,
  total_weight_kg: 1200,
  total_pallets: 8,
  total_distance_km: 45,
  estimated_duration_min: 90,
  utilization_pct: 0.60,
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
        delivery_address: "Coolsingel 1, Rotterdam",
        weight_kg: 600,
        quantity: 4,
        requirements: [],
        time_window_start: "08:00",
        time_window_end: "12:00",
      },
    },
    {
      id: "co2",
      group_id: "g1",
      order_id: "o2",
      stop_sequence: 2,
      pickup_sequence: null,
      created_at: "2026-04-01T10:00:00Z",
      order: {
        id: "o2",
        order_number: 1002,
        client_name: "Klant B",
        delivery_address: "Blaak 10, Rotterdam",
        weight_kg: 600,
        quantity: 4,
        requirements: ["KOELING"],
        time_window_start: null,
        time_window_end: null,
      },
    },
  ],
};

describe("ConsolidationCard", () => {
  it("renders group name", () => {
    render(
      <ConsolidationCard
        group={mockGroup}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.getByText("Groep Rotterdam Noord")).toBeInTheDocument();
  });

  it("shows weight, pallets and utilization stats", () => {
    render(
      <ConsolidationCard
        group={mockGroup}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.getByText(/1200/)).toBeInTheDocument();
    expect(screen.getByText(/8/)).toBeInTheDocument();
    expect(screen.getByText(/60/)).toBeInTheDocument();
  });

  it("lists orders in the group", () => {
    render(
      <ConsolidationCard
        group={mockGroup}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.getByText("Klant A")).toBeInTheDocument();
    expect(screen.getByText("Klant B")).toBeInTheDocument();
  });

  it("calls onApprove callback when approve button clicked", () => {
    const onApprove = vi.fn();
    render(
      <ConsolidationCard
        group={mockGroup}
        onApprove={onApprove}
        onReject={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /goedkeuren/i }));
    expect(onApprove).toHaveBeenCalledWith("g1");
  });

  it("calls onReject callback when reject button clicked", () => {
    const onReject = vi.fn();
    render(
      <ConsolidationCard
        group={mockGroup}
        onApprove={vi.fn()}
        onReject={onReject}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /verwerpen/i }));
    expect(onReject).toHaveBeenCalledWith("g1");
  });

  it("hides approve/reject buttons when status is not VOORSTEL", () => {
    const approvedGroup: ConsolidationGroup = { ...mockGroup, status: "GOEDGEKEURD" };
    render(
      <ConsolidationCard
        group={approvedGroup}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: /goedkeuren/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /verwerpen/i })).not.toBeInTheDocument();
  });
});
