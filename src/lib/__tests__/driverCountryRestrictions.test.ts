import { describe, expect, it } from "vitest";
import {
  formatDriverCountryRestrictionIssue,
  getDriverCountryRestrictionIssue,
  getOrderCountryCodes,
  inferCountryCodeFromAddress,
  normalizeCountryCode,
} from "@/lib/driverCountryRestrictions";

describe("driverCountryRestrictions", () => {
  it("normaliseert landcodes en landnamen", () => {
    expect(normalizeCountryCode("de")).toBe("DE");
    expect(normalizeCountryCode("Duitsland")).toBe("DE");
    expect(normalizeCountryCode("België")).toBe("BE");
  });

  it("leidt DE af uit een adres wanneer country velden ontbreken", () => {
    expect(inferCountryCodeFromAddress("Industriestrasse 12, 46446 Emmerich, Duitsland")).toBe("DE");
    expect(getOrderCountryCodes({ id: "o1", delivery_address: "Berlin, DE" })).toEqual(["DE"]);
  });

  it("blokkeert chauffeur met DE-blokkade op Duitse rit", () => {
    const issue = getDriverCountryRestrictionIssue(
      "driver-1",
      [
        {
          id: "order-1",
          order_number: 1001,
          pickup_country: "NL",
          delivery_country: "DE",
          pickup_address: "Amsterdam",
          delivery_address: "Dusseldorf",
        },
      ],
      [
        {
          driver_id: "driver-1",
          country_code: "DE",
          restriction_type: "block",
          reason: "Alcoholverbod in Duitsland",
          is_active: true,
        },
      ],
      "2026-05-01",
    );

    expect(issue).toEqual({
      type: "block",
      countryCode: "DE",
      reason: "Alcoholverbod in Duitsland",
      orderIds: ["order-1"],
      orderNumbers: [1001],
    });
    expect(formatDriverCountryRestrictionIssue(issue!)).toContain("Blokkade");
  });

  it("laat verlopen restricties buiten beschouwing", () => {
    const issue = getDriverCountryRestrictionIssue(
      "driver-1",
      [{ id: "order-1", delivery_country: "DE" }],
      [
        {
          driver_id: "driver-1",
          country_code: "DE",
          restriction_type: "block",
          active_until: "2026-04-01",
          is_active: true,
        },
      ],
      "2026-05-01",
    );

    expect(issue).toBeNull();
  });
});
