import { describe, it, expect } from "vitest";
import { DEFAULT_COMPANY, getCompanyConfig } from "@/lib/companyConfig";

describe("DEFAULT_COMPANY", () => {
  it("has the correct company name", () => {
    expect(DEFAULT_COMPANY.name).toBe("Royalty Cargo");
  });

  it("has a legal name ending in B.V.", () => {
    expect(DEFAULT_COMPANY.legalName).toBe("Royalty Cargo B.V.");
  });

  it("has a full address string", () => {
    expect(DEFAULT_COMPANY.address).toBe("Industrieweg 42, 3044 AT Rotterdam");
  });

  it("has a street name", () => {
    expect(DEFAULT_COMPANY.streetName).toBe("Industrieweg 42");
  });

  it("has city set to Rotterdam", () => {
    expect(DEFAULT_COMPANY.city).toBe("Rotterdam");
  });

  it("has a valid postal zone", () => {
    expect(DEFAULT_COMPANY.postalZone).toBe("3044 AT");
  });

  it("has country code NL", () => {
    expect(DEFAULT_COMPANY.country).toBe("NL");
  });

  it("has a phone number", () => {
    expect(DEFAULT_COMPANY.phone).toBe("+31 20 123 4567");
  });

  it("has an email address", () => {
    expect(DEFAULT_COMPANY.email).toBe("info@royaltycargo.nl");
  });

  it("has a planning email address", () => {
    expect(DEFAULT_COMPANY.planningEmail).toBe("planning@royaltycargo.nl");
  });

  it("has an IBAN", () => {
    expect(DEFAULT_COMPANY.iban).toBe("NL00 INGB 0000 0000 00");
  });

  it("has a KVK number", () => {
    expect(DEFAULT_COMPANY.kvk).toBe("12345678");
  });

  it("has a BTW number", () => {
    expect(DEFAULT_COMPANY.btw).toBe("NL001234567B01");
  });

  it("has a website", () => {
    expect(DEFAULT_COMPANY.website).toBe("www.royaltycargo.nl");
  });

  it("is frozen (const assertion makes it readonly)", () => {
    // Verify all expected keys are present
    const keys = Object.keys(DEFAULT_COMPANY);
    expect(keys).toContain("name");
    expect(keys).toContain("legalName");
    expect(keys).toContain("address");
    expect(keys).toContain("streetName");
    expect(keys).toContain("city");
    expect(keys).toContain("postalZone");
    expect(keys).toContain("country");
    expect(keys).toContain("phone");
    expect(keys).toContain("email");
    expect(keys).toContain("planningEmail");
    expect(keys).toContain("iban");
    expect(keys).toContain("kvk");
    expect(keys).toContain("btw");
    expect(keys).toContain("website");
    expect(keys).toHaveLength(14);
  });
});

describe("getCompanyConfig", () => {
  it("returns DEFAULT_COMPANY when called without tenantId", async () => {
    const config = await getCompanyConfig();
    expect(config).toEqual(DEFAULT_COMPANY);
  });

  it("returns DEFAULT_COMPANY when called with a tenantId", async () => {
    const config = await getCompanyConfig("some-tenant-id");
    expect(config).toEqual(DEFAULT_COMPANY);
  });

  it("returns DEFAULT_COMPANY when called with undefined tenantId", async () => {
    const config = await getCompanyConfig(undefined);
    expect(config).toEqual(DEFAULT_COMPANY);
  });

  it("returns a promise that resolves to CompanyConfig", async () => {
    const promise = getCompanyConfig();
    expect(promise).toBeInstanceOf(Promise);
    const config = await promise;
    expect(config.name).toBe("Royalty Cargo");
  });
});
