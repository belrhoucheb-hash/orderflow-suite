import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import "./inbox-test-setup";
import { baseDraft } from "./inbox-test-setup";

// ═══════════════════════════════════════════════════════════════
// InboxThreadBanner
// ═══════════════════════════════════════════════════════════════
describe("ThreadDiffBanner", () => {
  it("returns null for new thread type", async () => {
    const { ThreadDiffBanner } = await import("@/components/inbox/InboxThreadBanner");
    const { container } = render(<ThreadDiffBanner order={{ ...baseDraft, thread_type: "new" } as any} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders update banner with changes", async () => {
    const { ThreadDiffBanner } = await import("@/components/inbox/InboxThreadBanner");
    render(<ThreadDiffBanner order={{
      ...baseDraft,
      thread_type: "update",
      changes_detected: [{ field: "weight_kg", old_value: "500", new_value: "800" }],
    } as any} />);
    expect(screen.getByText(/Wijziging/)).toBeInTheDocument();
    expect(screen.getByText("Gewicht")).toBeInTheDocument();
    expect(screen.getByText("500")).toBeInTheDocument();
    expect(screen.getByText("800")).toBeInTheDocument();
  });

  it("shows cancellation warning", async () => {
    const { ThreadDiffBanner } = await import("@/components/inbox/InboxThreadBanner");
    render(<ThreadDiffBanner order={{ ...baseDraft, thread_type: "cancellation", changes_detected: [] } as any} />);
    expect(screen.getByText(/annuleren/)).toBeInTheDocument();
  });
});
