import { describe, it, expect } from "vitest";
import { buildStripStats, getConnectorTenants } from "../marketplaceStats";

describe("buildStripStats", () => {
  it("kiest top-connector op basis van tenants", () => {
    const stats = buildStripStats([
      { slug: "snelstart", name: "Snelstart" },
      { slug: "exact_online", name: "Exact Online" },
    ]);
    expect(stats.topConnector.name).toBe("Snelstart");
    expect(stats.topConnector.tenants).toBe(getConnectorTenants("snelstart"));
  });

  it("telt 'nieuw'-badges als nieuw-deze-maand", () => {
    const stats = buildStripStats([
      { slug: "a", name: "A", badge: "nieuw" },
      { slug: "b", name: "B", badge: "nieuw" },
      { slug: "c", name: "C", badge: "populair" },
    ]);
    expect(stats.newSinceLastMonth).toBe(2);
  });

  it("garandeert minimaal 1 nieuw bij lege lijst", () => {
    const stats = buildStripStats([]);
    expect(stats.newSinceLastMonth).toBeGreaterThanOrEqual(1);
  });

  it("levert bundles speedup als percentage", () => {
    const stats = buildStripStats([]);
    expect(stats.bundlesSpeedup).toBe(60);
  });
});

describe("getConnectorTenants", () => {
  it("geeft 0 voor onbekende slug", () => {
    expect(getConnectorTenants("non-existent")).toBe(0);
  });

  it("geeft tenants terug voor bekende slug", () => {
    expect(getConnectorTenants("snelstart")).toBeGreaterThan(0);
  });
});
