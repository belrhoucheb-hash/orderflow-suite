import { describe, it, expect } from "vitest";
import { driverCertificateRecordSchema } from "@/lib/validation/driverCertificateRecordSchema";

describe("driverCertificateRecordSchema", () => {
  it("accepteert een minimaal record met alleen een type", () => {
    const res = driverCertificateRecordSchema.safeParse({
      certification_code: "vog",
      issued_date: "",
      expiry_date: "",
      notes: "",
    });
    expect(res.success).toBe(true);
  });

  it("verwerpt een leeg certification_code", () => {
    const res = driverCertificateRecordSchema.safeParse({
      certification_code: "",
      issued_date: "",
      expiry_date: "",
      notes: "",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const paths = res.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("certification_code");
    }
  });

  it("verwerpt een ongeldig datum-formaat", () => {
    const res = driverCertificateRecordSchema.safeParse({
      certification_code: "vog",
      issued_date: "01-01-2026",
      expiry_date: "",
      notes: "",
    });
    expect(res.success).toBe(false);
  });

  it("verwerpt een vervaldatum voor de uitgiftedatum", () => {
    const res = driverCertificateRecordSchema.safeParse({
      certification_code: "adr",
      issued_date: "2026-06-01",
      expiry_date: "2026-05-01",
      notes: "",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const issue = res.error.issues.find((i) => i.path.join(".") === "expiry_date");
      expect(issue).toBeDefined();
    }
  });

  it("accepteert gelijke uitgifte- en vervaldatum", () => {
    // Een certificaat dat op de dag van uitgifte al verloopt is onzin,
    // maar technisch mogen de datums wel gelijk zijn; de UI toont dan
    // vanzelf een "Verlopen"-badge.
    const res = driverCertificateRecordSchema.safeParse({
      certification_code: "vgb",
      issued_date: "2026-04-22",
      expiry_date: "2026-04-22",
      notes: "",
    });
    expect(res.success).toBe(true);
  });

  it("accepteert alleen uitgiftedatum zonder vervaldatum", () => {
    // Sommige diploma's verlopen niet, dan is expiry_date leeg.
    const res = driverCertificateRecordSchema.safeParse({
      certification_code: "medewerker_luchtvracht",
      issued_date: "2020-01-15",
      expiry_date: "",
      notes: "",
    });
    expect(res.success).toBe(true);
  });

  it("verwerpt een notitie langer dan 500 tekens", () => {
    const res = driverCertificateRecordSchema.safeParse({
      certification_code: "code_95",
      issued_date: "",
      expiry_date: "",
      notes: "x".repeat(501),
    });
    expect(res.success).toBe(false);
  });
});
