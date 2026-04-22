import { describe, expect, it } from "vitest";
import { orderFormSchema } from "@/lib/validation/orderSchema";

// Basis-payload die elk veld invult met geldige waarden. Tests overschrijven
// alleen wat ze willen testen en laten de rest staan.
const validBase = {
  client_name: "Acme Transport",
  pickup_address: "Teststraat 12, 1012 AB Amsterdam",
  delivery_address: "Havenweg 5, 3011 CD Rotterdam",
  quantity: 3,
  weight_kg: 120,
  unit: "Pallets" as const,
  afdeling: "OPS",
  pickup_structured: {
    street: "Teststraat",
    zipcode: "1012 AB",
    city: "Amsterdam",
  },
  delivery_structured: {
    street: "Havenweg",
    zipcode: "3011 CD",
    city: "Rotterdam",
  },
};

describe("orderFormSchema", () => {
  it("accepteert een volledige order", () => {
    const parsed = orderFormSchema.safeParse(validBase);
    expect(parsed.success).toBe(true);
  });

  it("zet pickup_address-fout als gestructureerd adres onvolledig is", () => {
    const parsed = orderFormSchema.safeParse({
      ...validBase,
      pickup_structured: { street: "", zipcode: "", city: "" },
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const paths = parsed.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("pickup_address");
    }
  });

  it("weigert een pickup_address dat slechts een plaatsnaam is", () => {
    const parsed = orderFormSchema.safeParse({
      ...validBase,
      pickup_address: "Amsterdam",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const addressIssue = parsed.error.issues.find(
        (i) => i.path[0] === "pickup_address",
      );
      expect(addressIssue?.message).toContain("Onvolledig ophaaladres");
    }
  });

  it("zet delivery_address-fout als structured-adres onvolledig is", () => {
    const parsed = orderFormSchema.safeParse({
      ...validBase,
      delivery_structured: { street: "Havenweg", zipcode: "", city: "Rotterdam" },
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const paths = parsed.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("delivery_address");
    }
  });

  it("faalt als klantnaam leeg is", () => {
    const parsed = orderFormSchema.safeParse({ ...validBase, client_name: "   " });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const issue = parsed.error.issues.find((i) => i.path[0] === "client_name");
      expect(issue?.message).toContain("Klantnaam");
    }
  });

  it("faalt bij onbekende eenheid", () => {
    const parsed = orderFormSchema.safeParse({ ...validBase, unit: "Stuks" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const issue = parsed.error.issues.find((i) => i.path[0] === "unit");
      expect(issue).toBeTruthy();
    }
  });

  it("faalt bij negatief gewicht en niet-positief aantal", () => {
    const parsed = orderFormSchema.safeParse({
      ...validBase,
      quantity: 0,
      weight_kg: -5,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const paths = parsed.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("quantity");
      expect(paths).toContain("weight_kg");
    }
  });
});
