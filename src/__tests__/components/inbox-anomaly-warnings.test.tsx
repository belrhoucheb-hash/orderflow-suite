import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import "./inbox-test-setup";

// ═══════════════════════════════════════════════════════════════
// InboxAnomalyWarnings
// ═══════════════════════════════════════════════════════════════
describe("AnomalyWarnings", () => {
  it("returns null for empty anomalies", async () => {
    const { AnomalyWarnings } = await import("@/components/inbox/InboxAnomalyWarnings");
    const { container } = render(<AnomalyWarnings anomalies={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("returns null for null anomalies", async () => {
    const { AnomalyWarnings } = await import("@/components/inbox/InboxAnomalyWarnings");
    const { container } = render(<AnomalyWarnings anomalies={null as any} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders anomaly messages", async () => {
    const { AnomalyWarnings } = await import("@/components/inbox/InboxAnomalyWarnings");
    render(<AnomalyWarnings anomalies={[
      { field: "weight", value: 50000, avg_value: 5000, message: "Gewicht is 10x hoger dan normaal" },
    ]} />);
    expect(screen.getByText("Gewicht is 10x hoger dan normaal")).toBeInTheDocument();
    // Values are inside <strong> tags within text nodes
    expect(screen.getByText("50000")).toBeInTheDocument();
    expect(screen.getByText("5000")).toBeInTheDocument();
  });

  it("renders multiple anomalies", async () => {
    const { AnomalyWarnings } = await import("@/components/inbox/InboxAnomalyWarnings");
    render(<AnomalyWarnings anomalies={[
      { field: "weight", value: 50000, avg_value: 5000, message: "Te zwaar" },
      { field: "quantity", value: 100, avg_value: 10, message: "Te veel" },
    ]} />);
    expect(screen.getByText("Te zwaar")).toBeInTheDocument();
    expect(screen.getByText("Te veel")).toBeInTheDocument();
  });
});
