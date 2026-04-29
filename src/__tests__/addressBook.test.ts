import { describe, expect, it } from "vitest";
import { isSameAddressBookCompany } from "@/lib/addressBook";

describe("isSameAddressBookCompany", () => {
  it("herkent juridische suffixen als hetzelfde bedrijf", () => {
    expect(isSameAddressBookCompany("Royalty Cargo Solutions B.V.", "Royalty Cargo Solutions")).toBe(true);
  });

  it("herkent een afkorting als hetzelfde bedrijf", () => {
    expect(isSameAddressBookCompany("Royalty Cargo Solutions B.V.", "RCS")).toBe(true);
  });

  it("laat een ander bedrijf op hetzelfde adres toe", () => {
    expect(isSameAddressBookCompany("Royalty Cargo Solutions B.V.", "SquidInk")).toBe(false);
  });
});
