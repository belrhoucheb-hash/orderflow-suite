import { describe, it, expect } from "vitest";
import {
  ORDER_SOURCE_LABELS,
  ORDER_SOURCE_COLORS,
  PORTAL_ROLE_LABELS,
  PORTAL_MODULE_LABELS,
} from "@/types/clientPortal";

describe("Client Portal Types", () => {
  it("has all 4 order source labels", () => {
    expect(Object.keys(ORDER_SOURCE_LABELS)).toEqual(["INTERN", "EMAIL", "PORTAL", "EDI"]);
  });

  it("has all 4 order source colors", () => {
    expect(Object.keys(ORDER_SOURCE_COLORS)).toEqual(["INTERN", "EMAIL", "PORTAL", "EDI"]);
  });

  it("has all 3 portal role labels", () => {
    expect(Object.keys(PORTAL_ROLE_LABELS)).toEqual(["viewer", "editor", "admin"]);
    expect(PORTAL_ROLE_LABELS.viewer).toBe("Alleen bekijken");
  });

  it("has all 6 portal module labels", () => {
    expect(Object.keys(PORTAL_MODULE_LABELS)).toHaveLength(6);
    expect(PORTAL_MODULE_LABELS.orders).toBe("Orders");
    expect(PORTAL_MODULE_LABELS.invoicing).toBe("Facturatie");
  });

  it("PORTAL source color contains purple", () => {
    expect(ORDER_SOURCE_COLORS.PORTAL).toContain("purple");
  });

  it("EMAIL source color contains blue", () => {
    expect(ORDER_SOURCE_COLORS.EMAIL).toContain("blue");
  });

  it("PORTAL source label is Portaal", () => {
    expect(ORDER_SOURCE_LABELS.PORTAL).toBe("Portaal");
  });

  it("admin role label is Beheerder", () => {
    expect(PORTAL_ROLE_LABELS.admin).toBe("Beheerder");
  });

  it("all portal modules are defined", () => {
    const modules = ["orders", "tracking", "documents", "invoicing", "reporting", "settings"];
    modules.forEach((mod) => {
      expect(PORTAL_MODULE_LABELS[mod as keyof typeof PORTAL_MODULE_LABELS]).toBeTruthy();
    });
  });
});
