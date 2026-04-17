import { describe, it, expect } from "vitest";
import { clientInputSchema } from "@/lib/validation/clientSchema";
import { clientContactInputSchema } from "@/lib/validation/clientContactSchema";

describe("clientInputSchema", () => {
  it("eist een bedrijfsnaam", () => {
    const res = clientInputSchema.safeParse({ name: "   " });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.join(".") === "name")).toBe(true);
    }
  });

  it("accepteert minimale input met default country NL", () => {
    const res = clientInputSchema.safeParse({ name: "Acme BV" });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.country).toBe("NL");
      expect(res.data.billing_same_as_main).toBe(true);
      expect(res.data.shipping_same_as_main).toBe(true);
    }
  });

  it("verplicht factuuradres als billing_same_as_main=false", () => {
    const res = clientInputSchema.safeParse({
      name: "Acme BV",
      billing_same_as_main: false,
      billing_address: "",
      billing_city: "",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const paths = res.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("billing_address");
      expect(paths).toContain("billing_city");
    }
  });

  it("verplicht postadres als shipping_same_as_main=false", () => {
    const res = clientInputSchema.safeParse({
      name: "Acme BV",
      shipping_same_as_main: false,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const paths = res.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("shipping_address");
      expect(paths).toContain("shipping_city");
    }
  });

  it("accepteert compleet afwijkend factuuradres", () => {
    const res = clientInputSchema.safeParse({
      name: "Acme BV",
      billing_same_as_main: false,
      billing_address: "Keizersgracht 1",
      billing_zipcode: "1015 CJ",
      billing_city: "Amsterdam",
      billing_country: "NL",
    });
    expect(res.success).toBe(true);
  });

  it("wijst ongeldig e-mailadres af", () => {
    const res = clientInputSchema.safeParse({
      name: "Acme BV",
      billing_email: "niet-een-email",
    });
    expect(res.success).toBe(false);
  });

  it("accepteert leeg e-mailveld", () => {
    const res = clientInputSchema.safeParse({
      name: "Acme BV",
      billing_email: "",
    });
    expect(res.success).toBe(true);
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
