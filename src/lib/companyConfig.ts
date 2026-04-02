/**
 * Central company configuration.
 *
 * All company-specific details (name, address, IBAN, KVK, BTW, etc.) live here
 * so they are easy to swap per tenant. In production these values should come
 * from the `tenant_settings` table via `getCompanyConfig()`.
 */

export const DEFAULT_COMPANY = {
  name: "Royalty Cargo",
  legalName: "Royalty Cargo B.V.",
  address: "Industrieweg 42, 3044 AT Rotterdam",
  streetName: "Industrieweg 42",
  city: "Rotterdam",
  postalZone: "3044 AT",
  country: "NL",
  phone: "+31 20 123 4567",
  email: "info@royaltycargo.nl",
  planningEmail: "planning@royaltycargo.nl",
  iban: "NL00 INGB 0000 0000 00",
  kvk: "12345678",
  btw: "NL001234567B01",
  website: "www.royaltycargo.nl",
} as const;

export type CompanyConfig = typeof DEFAULT_COMPANY;

/**
 * Fetch company configuration for a given tenant.
 *
 * TODO: fetch from tenant_settings when multi-tenant is fully wired up.
 */
export async function getCompanyConfig(
  _tenantId?: string,
): Promise<CompanyConfig> {
  // TODO: fetch from tenant_settings when available
  return DEFAULT_COMPANY;
}
