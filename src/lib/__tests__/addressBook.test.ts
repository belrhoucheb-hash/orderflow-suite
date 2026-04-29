import { describe, expect, it } from "vitest";
import { buildAddressBookKey, isAddressBookReady, toAddressBookPayload } from "@/lib/addressBook";

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
    expect(payload.address).toContain("Changiweg");
    expect(payload.location_type).toBe("pickup");
  });
});
