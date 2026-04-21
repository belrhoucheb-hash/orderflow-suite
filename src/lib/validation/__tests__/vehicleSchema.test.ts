import { describe, it, expect } from "vitest";
import {
  vehicleInputSchema,
  vehicleDocumentInputSchema,
  vehicleMaintenanceInputSchema,
} from "@/lib/validation/vehicleSchema";

describe("vehicleInputSchema", () => {
  it("accepteert een volledig geldig voertuig", () => {
    const res = vehicleInputSchema.safeParse({
      code: "VH-04",
      name: "Mercedes Sprinter",
      plate: "AB-123-CD",
      type: "busje",
      brand: "Mercedes",
      capacity_kg: 3500,
      capacity_pallets: 6,
    });
    expect(res.success).toBe(true);
  });

  it("meldt fouten op verplichte velden", () => {
    const res = vehicleInputSchema.safeParse({
      code: "",
      name: "",
      plate: "",
      type: "",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const paths = res.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("code");
      expect(paths).toContain("name");
      expect(paths).toContain("plate");
      expect(paths).toContain("type");
    }
  });

  it("wijst negatieve capaciteit af", () => {
    const res = vehicleInputSchema.safeParse({
      code: "VH-01",
      name: "Test",
      plate: "AB-123-CD",
      type: "busje",
      capacity_kg: -100,
      capacity_pallets: -1,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const paths = res.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("capacity_kg");
      expect(paths).toContain("capacity_pallets");
    }
  });
});

describe("vehicleDocumentInputSchema", () => {
  it("accepteert een document met alleen type", () => {
    const res = vehicleDocumentInputSchema.safeParse({
      doc_type: "apk",
    });
    expect(res.success).toBe(true);
  });

  it("eist een type document", () => {
    const res = vehicleDocumentInputSchema.safeParse({
      doc_type: "",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const paths = res.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("doc_type");
    }
  });

  it("wijst een ongeldige vervaldatum af", () => {
    const res = vehicleDocumentInputSchema.safeParse({
      doc_type: "apk",
      expiry_date: "31-12-2026",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const paths = res.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("expiry_date");
    }
  });
});

describe("vehicleMaintenanceInputSchema", () => {
  it("accepteert een volledig geldig onderhoudsregel", () => {
    const res = vehicleMaintenanceInputSchema.safeParse({
      maintenance_type: "apk",
      scheduled_date: "2026-05-01",
      cost: 250.5,
      description: "APK-keuring",
    });
    expect(res.success).toBe(true);
  });

  it("eist een geplande datum", () => {
    const res = vehicleMaintenanceInputSchema.safeParse({
      maintenance_type: "apk",
      scheduled_date: "",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const paths = res.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("scheduled_date");
    }
  });

  it("wijst negatieve kosten af", () => {
    const res = vehicleMaintenanceInputSchema.safeParse({
      maintenance_type: "grote_beurt",
      scheduled_date: "2026-06-15",
      cost: -50,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const paths = res.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("cost");
    }
  });
});
