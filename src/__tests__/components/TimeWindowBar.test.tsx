// src/__tests__/components/TimeWindowBar.test.tsx
import { cleanup, render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TimeWindowBar } from "@/components/planning/TimeWindowBar";

describe("TimeWindowBar", () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows green bar when ETA is within window", () => {
    const { container } = render(
      <TimeWindowBar windowStart="09:00" windowEnd="11:00" eta="10:00" />
    );
    const bar = container.querySelector("[data-status='OP_TIJD']");
    expect(bar).toBeTruthy();
  });

  it("shows orange bar when ETA is before window (te vroeg)", () => {
    const { container } = render(
      <TimeWindowBar windowStart="09:00" windowEnd="11:00" eta="08:00" />
    );
    const bar = container.querySelector("[data-status='TE_VROEG']");
    expect(bar).toBeTruthy();
  });

  it("shows red bar when ETA is after window (te laat)", () => {
    const { container } = render(
      <TimeWindowBar windowStart="09:00" windowEnd="11:00" eta="12:00" />
    );
    const bar = container.querySelector("[data-status='TE_LAAT']");
    expect(bar).toBeTruthy();
  });

  it("shows gray bar when no window is set", () => {
    const { container } = render(
      <TimeWindowBar windowStart={null} windowEnd={null} eta="10:00" />
    );
    const bar = container.querySelector("[data-status='ONBEKEND']");
    expect(bar).toBeTruthy();
  });

  it("displays time labels", () => {
    render(<TimeWindowBar windowStart="09:00" windowEnd="11:00" eta="10:00" />);
    expect(screen.getByText("09:00")).toBeDefined();
    expect(screen.getByText("11:00")).toBeDefined();
    expect(screen.getByText("ETA 10:00")).toBeDefined();
  });
});
