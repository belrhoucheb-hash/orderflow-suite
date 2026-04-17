import { describe, it, expect } from "vitest";
import {
  getOrderIncompleteSummary,
  isOrderIncomplete,
} from "@/lib/orderDisplay";

describe("getOrderIncompleteSummary", () => {
  it("returns not-incomplete when everything compleet is", () => {
    const res = getOrderIncompleteSummary({
      missing_fields: [],
      info_status: "COMPLETE",
    });
    expect(res.incomplete).toBe(false);
    expect(res.fields).toEqual([]);
    expect(res.infoLabel).toBeNull();
  });

  it("markeert incomplete bij missing_fields", () => {
    const res = getOrderIncompleteSummary({
      missing_fields: ["mrn_document", "pickup_time_window"],
      info_status: "COMPLETE",
    });
    expect(res.incomplete).toBe(true);
    expect(res.fields).toEqual(["MRN-document", "Ophaalvenster"]);
    expect(res.infoLabel).toBeNull();
  });

  it("markeert incomplete bij info_status AWAITING_INFO", () => {
    const res = getOrderIncompleteSummary({
      missing_fields: [],
      info_status: "AWAITING_INFO",
    });
    expect(res.incomplete).toBe(true);
    expect(res.infoLabel).toBe("Openstaand");
  });

  it("markeert incomplete bij info_status OVERDUE", () => {
    const res = getOrderIncompleteSummary({
      missing_fields: [],
      info_status: "OVERDUE",
    });
    expect(res.incomplete).toBe(true);
    expect(res.infoLabel).toBe("Verlopen");
  });

  it("combineert beide signalen", () => {
    const res = getOrderIncompleteSummary({
      missing_fields: ["contact_person"],
      info_status: "OVERDUE",
    });
    expect(res.incomplete).toBe(true);
    expect(res.fields).toEqual(["Contactpersoon"]);
    expect(res.infoLabel).toBe("Verlopen");
  });

  it("accepteert camelCase-alias voor UI-objecten", () => {
    const res = getOrderIncompleteSummary({
      missingFields: ["weight_kg"],
      infoStatus: "AWAITING_INFO",
    });
    expect(res.incomplete).toBe(true);
    expect(res.fields).toEqual(["Gewicht"]);
    expect(res.infoLabel).toBe("Openstaand");
  });

  it("valt terug op de raw key als er geen label is", () => {
    const res = getOrderIncompleteSummary({
      missing_fields: ["exotic_unknown_field"],
      info_status: "COMPLETE",
    });
    expect(res.incomplete).toBe(true);
    expect(res.fields).toEqual(["exotic_unknown_field"]);
  });
});

describe("isOrderIncomplete", () => {
  it("convenience-wrapper geeft boolean", () => {
    expect(isOrderIncomplete({ missing_fields: [], info_status: "COMPLETE" })).toBe(false);
    expect(isOrderIncomplete({ missing_fields: ["mrn"] })).toBe(true);
    expect(isOrderIncomplete({ info_status: "OVERDUE" })).toBe(true);
  });
});
