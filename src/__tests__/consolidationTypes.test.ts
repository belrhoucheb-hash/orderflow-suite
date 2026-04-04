import { describe, it, expect } from "vitest";
import type { ConsolidationGroup, ConsolidationOrder, ConsolidationStatus, ConsolidationProposal } from "@/types/consolidation";
import { CONSOLIDATION_STATUSES, CONSOLIDATION_STATUS_LABELS } from "@/types/consolidation";

describe("consolidation types", () => {
  it("exports all consolidation statuses", () => {
    expect(CONSOLIDATION_STATUSES).toEqual(["VOORSTEL", "GOEDGEKEURD", "INGEPLAND", "VERWORPEN"]);
  });
  it("has Dutch labels for every status", () => {
    for (const s of CONSOLIDATION_STATUSES) {
      expect(CONSOLIDATION_STATUS_LABELS[s]).toBeDefined();
      expect(CONSOLIDATION_STATUS_LABELS[s].label).toBeTruthy();
      expect(CONSOLIDATION_STATUS_LABELS[s].color).toBeTruthy();
    }
  });
  it("ConsolidationGroup interface is structurally valid", () => {
    const group: ConsolidationGroup = {
      id: "uuid-1", tenant_id: "uuid-2", name: "Regio Amsterdam 04-apr", planned_date: "2026-04-04",
      status: "VOORSTEL", vehicle_id: null, total_weight_kg: 5000, total_pallets: 12,
      total_distance_km: 85.5, estimated_duration_min: 180, utilization_pct: 72.5,
      created_by: "uuid-3", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    };
    expect(group.status).toBe("VOORSTEL");
  });
});
