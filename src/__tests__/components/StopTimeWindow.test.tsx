// src/__tests__/components/StopTimeWindow.test.tsx
import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { StopTimeWindow } from "@/components/chauffeur/StopTimeWindow";

describe("StopTimeWindow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-04T09:30:00"));
  });

  it("shows countdown when window is in the future", () => {
    render(<StopTimeWindow windowStart="10:00" windowEnd="11:00" windowStatus="ONBEKEND" waitingTimeMin={null} />);
    expect(screen.getByText(/nog/i)).toBeDefined();
    expect(screen.getByText("10:00")).toBeDefined();
    expect(screen.getByText("11:00")).toBeDefined();
  });

  it("shows green status when OP_TIJD", () => {
    const { container } = render(
      <StopTimeWindow windowStart="09:00" windowEnd="11:00" windowStatus="OP_TIJD" waitingTimeMin={null} />
    );
    expect(container.querySelector(".text-green-700")).toBeTruthy();
  });

  it("shows red warning when TE_LAAT", () => {
    render(<StopTimeWindow windowStart="08:00" windowEnd="09:00" windowStatus="TE_LAAT" waitingTimeMin={null} />);
    expect(screen.getAllByText(/te laat/i).length).toBeGreaterThanOrEqual(1);
  });

  it("shows waiting time when provided", () => {
    render(<StopTimeWindow windowStart="10:00" windowEnd="11:00" windowStatus="TE_VROEG" waitingTimeMin={15} />);
    expect(screen.getByText(/15 min/i)).toBeDefined();
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
