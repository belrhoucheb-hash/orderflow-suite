import { describe, it, expect } from "vitest";
import { clientInputSchema, composeAddressString } from "@/lib/validation/clientSchema";
import { clientContactInputSchema } from "@/lib/validation/clientContactSchema";

const validAddress = {
  street: "Winthontlaan",
  house_number: "30",
  house_number_suffix: "B",
  zipcode: "3526 KV",
  city: "Utrecht",
  country: "NL",
  lat: 52.0580297,
  lng: 5.1099545,
  coords_manual: false,
};

const emptyAddress = {
  street: "",
  house_number: "",
  house_number_suffix: "",
  zipcode: "",
  city: "",
  country: "NL",
  lat: null,
  lng: null,
  coords_manual: false,
};

describe("clientInputSchema", () => {
  it("eist een bedrijfsnaam", () => {
    const res = clientInputSchema.safeParse({
      name: "   ",
      main_address: validAddress,
      billing_address: emptyAddress,
      shipping_address: emptyAddress,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.join(".") === "name")).toBe(true);
    }
  });

  it("blokkeert opslaan zonder coordinaten op het hoofdadres", () => {
    const res = clientInputSchema.safeParse({
      name: "Acme BV",
      main_address: emptyAddress,
      billing_address: emptyAddress,
      shipping_address: emptyAddress,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const paths = res.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("main_address.lat");
    }
  });

  it("accepteert een compleet hoofdadres met coordinaten", () => {
    const res = clientInputSchema.safeParse({
      name: "Acme BV",
      main_address: validAddress,
      billing_address: emptyAddress,
      shipping_address: emptyAddress,
    });
    expect(res.success).toBe(true);
  });

  it("verplicht coordinaten op factuuradres als billing_same_as_main=false", () => {
    const res = clientInputSchema.safeParse({
      name: "Acme BV",
      main_address: validAddress,
      billing_same_as_main: false,
      billing_address: { ...emptyAddress, street: "Keizersgracht" },
      shipping_address: emptyAddress,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const paths = res.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("billing_address.lat");
    }
  });

  it("verplicht postadres met coordinaten als shipping_same_as_main=false", () => {
    const res = clientInputSchema.safeParse({
      name: "Acme BV",
      main_address: validAddress,
      shipping_same_as_main: false,
      billing_address: emptyAddress,
      shipping_address: emptyAddress,
    });
    expect(res.success).toBe(false);
  });

  it("accepteert compleet afwijkend factuuradres", () => {
    const res = clientInputSchema.safeParse({
      name: "Acme BV",
      main_address: validAddress,
      billing_same_as_main: false,
      billing_address: {
        ...validAddress,
        street: "Keizersgracht",
        house_number: "1",
        house_number_suffix: "",
        city: "Amsterdam",
        zipcode: "1015 CJ",
        lat: 52.3676,
        lng: 4.9041,
      },
      shipping_address: emptyAddress,
    });
    expect(res.success).toBe(true);
  });

  it("wijst ongeldig factuur-emailadres af", () => {
    const res = clientInputSchema.safeParse({
      name: "Acme BV",
      main_address: validAddress,
      billing_email: "niet-een-email",
      billing_address: emptyAddress,
      shipping_address: emptyAddress,
    });
    expect(res.success).toBe(false);
  });

  it("accepteert leeg factuur-emailveld", () => {
    const res = clientInputSchema.safeParse({
      name: "Acme BV",
      main_address: validAddress,
      billing_email: "",
      billing_address: emptyAddress,
      shipping_address: emptyAddress,
    });
    expect(res.success).toBe(true);
  });
});

describe("composeAddressString", () => {
  it("voegt straat, huisnummer en bijvoegsel samen", () => {
    expect(composeAddressString(validAddress)).toBe("Winthontlaan 30 B");
  });

  it("laat lege delen weg", () => {
    expect(
      composeAddressString({ ...validAddress, house_number_suffix: "" })
    ).toBe("Winthontlaan 30");
  });

  it("retourneert lege string voor leeg adres", () => {
    expect(composeAddressString(emptyAddress)).toBe("");
  });
});

describe("clientContactInputSchema", () => {
  it("eist een naam", () => {
    const res = clientContactInputSchema.safeParse({
      name: "",
      role: "primary",
    });
    expect(res.success).toBe(false);
  });

  it("eist een geldige rol", () => {
    const res = clientContactInputSchema.safeParse({
      name: "Jan",
      role: "unknown",
    });
    expect(res.success).toBe(false);
  });

  it("accepteert primary met email en phone", () => {
    const res = clientContactInputSchema.safeParse({
      name: "Jan",
      email: "jan@acme.nl",
      phone: "+31 6 12345678",
      role: "primary",
    });
    expect(res.success).toBe(true);
  });

  it("accepteert lege email", () => {
    const res = clientContactInputSchema.safeParse({
      name: "Jan",
      email: "",
      role: "backup",
    });
    expect(res.success).toBe(true);
  });

  it("wijst ongeldig email af", () => {
    const res = clientContactInputSchema.safeParse({
      name: "Jan",
      email: "fout-email",
      role: "other",
    });
    expect(res.success).toBe(false);
  });
});
