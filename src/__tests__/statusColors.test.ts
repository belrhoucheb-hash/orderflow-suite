import { describe, it, expect } from "vitest";
import { getStatusColor, STATUS_COLORS, getStatusStyle } from "@/lib/statusColors";

describe("getStatusColor", () => {
  // ─── All 6 known statuses return their specific colors ─────────────
  const knownStatuses = ["DRAFT", "PENDING", "PLANNED", "IN_TRANSIT", "DELIVERED", "CANCELLED"];

  it.each(knownStatuses)("returns defined colors for %s", (status) => {
    const color = getStatusColor(status);
    expect(color).toBeDefined();
    expect(color.bg).toBeTruthy();
    expect(color.text).toBeTruthy();
    expect(color.dot).toBeTruthy();
    expect(color.label).toBeTruthy();
  });

  // ─── Specific label checks ─────────────────────────────────────────
  it("DRAFT has label 'Nieuw'", () => {
    expect(getStatusColor("DRAFT").label).toBe("Nieuw");
  });

  it("PENDING has label 'In behandeling'", () => {
    expect(getStatusColor("PENDING").label).toBe("In behandeling");
  });

  it("PLANNED has label 'Ingepland'", () => {
    expect(getStatusColor("PLANNED").label).toBe("Ingepland");
  });

  it("IN_TRANSIT has label 'Onderweg'", () => {
    expect(getStatusColor("IN_TRANSIT").label).toBe("Onderweg");
  });

  it("DELIVERED has label 'Afgeleverd'", () => {
    expect(getStatusColor("DELIVERED").label).toBe("Afgeleverd");
  });

  it("CANCELLED has label 'Geannuleerd'", () => {
    expect(getStatusColor("CANCELLED").label).toBe("Geannuleerd");
  });

  // ─── Fallback for unknown status ───────────────────────────────────
  it("returns DRAFT colors as fallback for unknown status", () => {
    const fallback = getStatusColor("NONEXISTENT");
    expect(fallback).toEqual(STATUS_COLORS.DRAFT);
  });

  it("returns DRAFT colors for empty string", () => {
    const fallback = getStatusColor("");
    expect(fallback).toEqual(STATUS_COLORS.DRAFT);
  });

  // ─── Each status has unique styling ────────────────────────────────
  it("all statuses have distinct bg classes", () => {
    const bgs = knownStatuses.map((s) => getStatusColor(s).bg);
    const unique = new Set(bgs);
    expect(unique.size).toBe(knownStatuses.length);
  });
});

describe("getStatusStyle", () => {
  it("returns combined bg and text classes", () => {
    const style = getStatusStyle("DELIVERED");
    const color = getStatusColor("DELIVERED");
    expect(style).toBe(`${color.bg} ${color.text}`);
  });

  it("returns fallback style for unknown status", () => {
    const style = getStatusStyle("UNKNOWN");
    const fallback = getStatusColor("UNKNOWN");
    expect(style).toBe(`${fallback.bg} ${fallback.text}`);
  });
});
