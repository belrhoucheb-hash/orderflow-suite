import { describe, expect, it } from "vitest";
import {
  buildAddressBookCompanyKey,
  buildAddressBookIdentityKey,
  buildAddressBookKey,
  isAddressBookReady,
  isSameAddressBookCompany,
  toAddressBookPayload,
} from "@/lib/addressBook";

describe("addressBook", () => {
  it("builds the same key for equivalent addresses with different casing and spacing", () => {
    const a = buildAddressBookKey({
      street: "Changiweg",
      house_number: "2",
      zipcode: "1437 EP",
      city: "Rozenburg",
      country: "NL",
    });
    const b = buildAddressBookKey({
      street: " changiweg ",
      house_number: "2",
      zipcode: "1437EP",
      city: "ROZENBURG",
      country: "nl",
    });

    expect(a).toBe(b);
  });

  it("requires enough address identity before storing", () => {
    expect(isAddressBookReady({ street: "Amsterdam", city: "Amsterdam" })).toBe(false);
    expect(isAddressBookReady({ street: "Changiweg", house_number: "2", zipcode: "1437 EP" })).toBe(true);
  });

  it("creates a payload with a stable normalized key and display address", () => {
    const payload = toAddressBookPayload({
      tenant_id: "tenant-1",
      label: "Rutges",
      street: "Changiweg",
      house_number: "2",
      zipcode: "1437 EP",
      city: "Rozenburg",
      country: "nl",
      location_type: "pickup",
    });

    expect(payload.country).toBe("NL");
    expect(payload.normalized_key).toContain("1437ep");
    expect(payload.normalized_company_key).toBe("rutges");
    expect(payload.company_name).toBe("Rutges");
    expect(payload.address).toContain("Changiweg");
    expect(payload.location_type).toBe("pickup");
  });

  it("uses company plus address as the address-book identity", () => {
    const address = {
      tenant_id: "tenant-1",
      street: "Bijlmermeerstraat",
      house_number: "28",
      zipcode: "2131 HG",
      city: "Hoofddorp",
      country: "NL",
    };

    const royalty = buildAddressBookIdentityKey({
      ...address,
      company_name: "Royalty Cargo Solutions B.V.",
    });
    const royaltyAlias = buildAddressBookIdentityKey({
      ...address,
      company_name: "Royalty",
    });
    const squidInk = buildAddressBookIdentityKey({
      ...address,
      company_name: "SquidInk",
    });

    expect(buildAddressBookCompanyKey({ company_name: "Royalty Cargo Solutions B.V." })).toBe("royalty cargo solutions");
    expect(buildAddressBookCompanyKey({ company_name: "Royalty Cargo Solutions BV" })).toBe("royalty cargo solutions");
    expect(buildAddressBookCompanyKey({ company_name: "Royalty Cargo Solutions   b.v." })).toBe("royalty cargo solutions");
    expect(isSameAddressBookCompany("Royalty Cargo Solutions B.V.", "Royalty")).toBe(true);
    expect(isSameAddressBookCompany("Royalty Cargo Solutions B.V.", "SquidInk")).toBe(false);
    expect(royalty).not.toBe(squidInk);
    expect(royaltyAlias).not.toBe(squidInk);

    const royaltyPayload = toAddressBookPayload({ ...address, company_name: "Royalty Cargo Solutions B.V." });
    const squidInkPayload = toAddressBookPayload({ ...address, company_name: "SquidInk" });
    expect(royaltyPayload.normalized_key).toBe(squidInkPayload.normalized_key);
    expect(royaltyPayload.normalized_company_key).not.toBe(squidInkPayload.normalized_company_key);
  });
});
