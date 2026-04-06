import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import "./inbox-test-setup";

// ═══════════════════════════════════════════════════════════════
// InboxConfidenceIndicators
// ═══════════════════════════════════════════════════════════════
describe("ConfidenceDot", () => {
  it("renders emerald dot for high score", async () => {
    const { ConfidenceDot } = await import("@/components/inbox/InboxConfidenceIndicators");
    const { container } = render(<ConfidenceDot score={90} />);
    expect(container.firstChild).toHaveClass("bg-emerald-500");
  });

  it("renders amber dot for medium score", async () => {
    const { ConfidenceDot } = await import("@/components/inbox/InboxConfidenceIndicators");
    const { container } = render(<ConfidenceDot score={70} />);
    expect(container.firstChild).toHaveClass("bg-amber-500");
  });

  it("renders destructive dot for low score", async () => {
    const { ConfidenceDot } = await import("@/components/inbox/InboxConfidenceIndicators");
    const { container } = render(<ConfidenceDot score={30} />);
    expect(container.firstChild).toHaveClass("bg-destructive");
  });
});

describe("ConfidenceRing", () => {
  it("shows AI Score label", async () => {
    const { ConfidenceRing } = await import("@/components/inbox/InboxConfidenceIndicators");
    render(<ConfidenceRing score={85} />);
    expect(screen.getByText("AI Score")).toBeInTheDocument();
    expect(screen.getByText("85")).toBeInTheDocument();
    expect(screen.getByText("Hoge zekerheid")).toBeInTheDocument();
  });

  it("shows Controleer velden for medium", async () => {
    const { ConfidenceRing } = await import("@/components/inbox/InboxConfidenceIndicators");
    render(<ConfidenceRing score={65} />);
    expect(screen.getByText("Controleer velden")).toBeInTheDocument();
  });

  it("shows Handmatig invoeren for low", async () => {
    const { ConfidenceRing } = await import("@/components/inbox/InboxConfidenceIndicators");
    render(<ConfidenceRing score={40} />);
    expect(screen.getByText("Handmatig invoeren")).toBeInTheDocument();
  });
});

describe("FieldConfidence", () => {
  it("returns null for high confidence", async () => {
    const { FieldConfidence } = await import("@/components/inbox/InboxConfidenceIndicators");
    const { container } = render(<FieldConfidence level="high" />);
    expect(container.innerHTML).toBe("");
  });

  it("shows Controleer for medium", async () => {
    const { FieldConfidence } = await import("@/components/inbox/InboxConfidenceIndicators");
    render(<FieldConfidence level="medium" />);
    expect(screen.getByText("Controleer")).toBeInTheDocument();
  });

  it("shows Onzeker for low", async () => {
    const { FieldConfidence } = await import("@/components/inbox/InboxConfidenceIndicators");
    render(<FieldConfidence level="low" />);
    expect(screen.getByText("Onzeker")).toBeInTheDocument();
  });

  it("shows Ontbreekt for missing", async () => {
    const { FieldConfidence } = await import("@/components/inbox/InboxConfidenceIndicators");
    render(<FieldConfidence level="missing" />);
    expect(screen.getByText("Ontbreekt")).toBeInTheDocument();
  });
});
