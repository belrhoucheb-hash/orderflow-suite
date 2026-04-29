import { describe, expect, it } from "vitest";
import {
  buildAddressBookCompanyKey,
  isSameAddressBookCompany,
  normalizeCompanyName,
  toAddressBookPayload,
} from "@/lib/addressBook";

describe("isSameAddressBookCompany", () => {
  it("herkent juridische suffixen als hetzelfde bedrijf", () => {
    expect(isSameAddressBookCompany("Royalty Cargo Solutions B.V.", "Royalty Cargo Solutions")).toBe(true);
  });

  it("herkent een afkorting als hetzelfde bedrijf", () => {
    expect(isSameAddressBookCompany("Royalty Cargo Solutions B.V.", "RCS")).toBe(true);
  });

  it("herkent handelsnamen en aliassen", () => {
    expect(isSameAddressBookCompany("Royalty Cargo Solutions B.V.", "RCS", ["Royalty Cargo"], ["RCS"])).toBe(true);
  });

  it("laat een ander bedrijf op hetzelfde adres toe", () => {
    expect(isSameAddressBookCompany("Royalty Cargo Solutions B.V.", "SquidInk")).toBe(false);
  });
});

describe("address book identity", () => {
  it("maakt dezelfde company key voor namen met en zonder juridische suffix", () => {
    expect(normalizeCompanyName("Royalty Cargo Solutions B.V.")).toBe("royalty cargo solutions");
    expect(buildAddressBookCompanyKey({ company_name: "Royalty Cargo Solutions BV" })).toBe("royalty cargo solutions");
    expect(buildAddressBookCompanyKey({ company_name: "Royalty Cargo Solutions" })).toBe("royalty cargo solutions");
  });

  it("houdt verschillende bedrijven op hetzelfde fysieke adres gescheiden", () => {
    const baseAddress = {
      tenant_id: "tenant-1",
      street: "Bijlmermeerstraat",
      house_number: "28",
      zipcode: "2131 HG",
      city: "Hoofddorp",
      country: "NL",
      address: "Bijlmermeerstraat 28, 2131 HG Hoofddorp",
    };

    const royalty = toAddressBookPayload({
      ...baseAddress,
      company_name: "Royalty Cargo Solutions B.V.",
      label: "Royalty Cargo Solutions B.V.",
    });
    const squidInk = toAddressBookPayload({
      ...baseAddress,
      company_name: "SquidInk",
      label: "SquidInk",
    });

    expect(royalty.normalized_key).toBe(squidInk.normalized_key);
    expect(royalty.normalized_company_key).toBe("royalty cargo solutions");
    expect(squidInk.normalized_company_key).toBe("squidink");
    expect(`${royalty.normalized_company_key}|${royalty.normalized_key}`).not.toBe(
      `${squidInk.normalized_company_key}|${squidInk.normalized_key}`,
    );
  });
});
