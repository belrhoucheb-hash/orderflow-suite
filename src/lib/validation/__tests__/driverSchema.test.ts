import { describe, it, expect } from "vitest";
import {
  driverSchema,
  isValidBsn,
  isValidIban,
  maskBsn,
  daysUntil,
} from "@/lib/validation/driverSchema";

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoToday(): string {
  return formatLocalDate(new Date());
}

function isoOffsetDays(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return formatLocalDate(d);
}

function isoOffsetYears(years: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setFullYear(d.getFullYear() + years);
  return formatLocalDate(d);
}

describe("isValidBsn", () => {
  it("accepteert een geldig test-BSN (111222333)", () => {
    expect(isValidBsn("111222333")).toBe(true);
  });

  it("accepteert nog een geldig test-BSN (123456782)", () => {
    expect(isValidBsn("123456782")).toBe(true);
  });

  it("weigert te korte input van 8 cijfers", () => {
    expect(isValidBsn("12345678")).toBe(false);
  });

  it("weigert te lange input van 10 cijfers", () => {
    expect(isValidBsn("1234567890")).toBe(false);
  });

  it("weigert niet-numerieke input", () => {
    expect(isValidBsn("abcdefghi")).toBe(false);
  });

  it("weigert een BSN dat de 11-proef niet doorstaat", () => {
    expect(isValidBsn("111222334")).toBe(false);
  });
});

describe("isValidIban", () => {
  it("accepteert NL91ABNA0417164300", () => {
    expect(isValidIban("NL91ABNA0417164300")).toBe(true);
  });

  it("accepteert IBAN met spaties", () => {
    expect(isValidIban("NL91 ABNA 0417 1643 00")).toBe(true);
  });

  it("weigert te korte input", () => {
    expect(isValidIban("NL91")).toBe(false);
  });

  it("weigert verkeerd formaat (begint niet met landcode)", () => {
    expect(isValidIban("1234ABNA0417164300")).toBe(false);
  });

  it("weigert kapotte checksum", () => {
    expect(isValidIban("NL92ABNA0417164300")).toBe(false);
  });
});

describe("maskBsn", () => {
  it("geeft lege string voor null", () => {
    expect(maskBsn(null)).toBe("");
  });

  it("geeft lege string voor undefined", () => {
    expect(maskBsn(undefined)).toBe("");
  });

  it("geeft '***' voor een kort nummer", () => {
    expect(maskBsn("12")).toBe("***");
  });

  it("maskeert alle behalve de laatste 4 cijfers bij 9 cijfers", () => {
    expect(maskBsn("111222333")).toBe("*****2333");
  });
});

describe("daysUntil", () => {
  it("geeft null voor null", () => {
    expect(daysUntil(null)).toBeNull();
  });

  it("geeft null voor undefined", () => {
    expect(daysUntil(undefined)).toBeNull();
  });

  it("geeft 0 voor vandaag", () => {
    expect(daysUntil(isoToday())).toBe(0);
  });

  it("geeft een positief getal voor een toekomstige datum", () => {
    expect(daysUntil(isoOffsetDays(10))).toBe(10);
  });

  it("geeft een negatief getal voor een datum in het verleden", () => {
    expect(daysUntil(isoOffsetDays(-5))).toBe(-5);
  });
});

describe("driverSchema", () => {
  it("accepteert een minimaal object met alleen naam en employment_type", () => {
    const res = driverSchema.safeParse({
      name: "Jan",
      employment_type: "vast",
    });
    expect(res.success).toBe(true);
  });

  it("weigert een lege naam", () => {
    const res = driverSchema.safeParse({
      name: "   ",
      employment_type: "vast",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.join(".") === "name")).toBe(true);
    }
  });

  it("weigert een BSN met onjuist aantal cijfers", () => {
    const res = driverSchema.safeParse({
      name: "Jan",
      employment_type: "vast",
      bsn: "12345678",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.join(".") === "bsn")).toBe(true);
    }
  });

  it("weigert een BSN waarvan de 11-proef mislukt", () => {
    const res = driverSchema.safeParse({
      name: "Jan",
      employment_type: "vast",
      bsn: "111222334",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.join(".") === "bsn")).toBe(true);
    }
  });

  it("weigert een ongeldig IBAN", () => {
    const res = driverSchema.safeParse({
      name: "Jan",
      employment_type: "vast",
      iban: "NL92ABNA0417164300",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.join(".") === "iban")).toBe(true);
    }
  });

  it("weigert een geboortedatum jonger dan 18 jaar", () => {
    const res = driverSchema.safeParse({
      name: "Jan",
      employment_type: "vast",
      birth_date: isoOffsetYears(-17),
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.join(".") === "birth_date")).toBe(true);
    }
  });

  it("weigert contracturen boven 48", () => {
    const res = driverSchema.safeParse({
      name: "Jan",
      employment_type: "vast",
      contract_hours_per_week: 49,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(
        res.error.issues.some((i) => i.path.join(".") === "contract_hours_per_week"),
      ).toBe(true);
    }
  });

  it("weigert een uitdienstdatum voor de indienstdatum", () => {
    const res = driverSchema.safeParse({
      name: "Jan",
      employment_type: "vast",
      hire_date: "2024-06-01",
      termination_date: "2024-01-01",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(
        res.error.issues.some((i) => i.path.join(".") === "termination_date"),
      ).toBe(true);
    }
  });

  it("weigert een indienstdatum in de toekomst", () => {
    const res = driverSchema.safeParse({
      name: "Jan",
      employment_type: "vast",
      hire_date: isoOffsetDays(30),
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.join(".") === "hire_date")).toBe(true);
    }
  });

  it("accepteert employment_type 'zzp'", () => {
    const res = driverSchema.safeParse({
      name: "Jan",
      employment_type: "zzp",
    });
    expect(res.success).toBe(true);
  });

  it("accepteert employment_type 'uitzendkracht'", () => {
    const res = driverSchema.safeParse({
      name: "Jan",
      employment_type: "uitzendkracht",
    });
    expect(res.success).toBe(true);
  });

  it("accepteert lege strings voor optionele velden", () => {
    const res = driverSchema.safeParse({
      name: "Jan",
      employment_type: "vast",
      email: "",
      phone: "",
      street: "",
      house_number: "",
      house_number_suffix: "",
      zipcode: "",
      city: "",
      license_number: "",
      legitimation_expiry_date: "",
      code95_expiry_date: "",
      birth_date: "",
      bsn: "",
      iban: "",
      personnel_number: "",
      hire_date: "",
      termination_date: "",
      emergency_contact_name: "",
      emergency_contact_phone: "",
    });
    expect(res.success).toBe(true);
  });
});
