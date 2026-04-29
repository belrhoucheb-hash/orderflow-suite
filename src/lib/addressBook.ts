import { composeAddressString } from "@/lib/validation/clientSchema";

export interface AddressBookValue {
  street: string;
  house_number?: string | null;
  house_number_suffix?: string | null;
  zipcode?: string | null;
  city?: string | null;
  country?: string | null;
  lat?: number | null;
  lng?: number | null;
  coords_manual?: boolean | null;
}

export interface AddressBookEntryInput extends AddressBookValue {
  tenant_id: string;
  label?: string | null;
  company_name?: string | null;
  address?: string | null;
  location_type?: "pickup" | "delivery" | "both";
  notes?: string | null;
  time_window_start?: string | null;
  time_window_end?: string | null;
  source?: string;
}

export function normalizeAddressPart(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeZipcode(value: string | null | undefined): string {
  return normalizeAddressPart(value).replace(/\s+/g, "");
}

export function normalizeCompanyName(value: string | null | undefined): string {
  const normalized = normalizeAddressPart(value).replace(/\bb v\b/g, "bv");
  const legalSuffixes = new Set(["bv", "nv", "vof", "cv", "ltd", "llc", "inc", "gmbh", "sa", "sarl", "plc"]);
  return normalized
    .split(" ")
    .filter((part) => part && !legalSuffixes.has(part))
    .join(" ")
    .trim();
}

export function buildAddressBookKey(value: AddressBookValue): string {
  return [
    normalizeAddressPart(value.country || "NL").toUpperCase(),
    normalizeZipcode(value.zipcode),
    normalizeAddressPart(value.city),
    normalizeAddressPart(value.street),
    normalizeAddressPart(value.house_number),
    normalizeAddressPart(value.house_number_suffix),
  ].join("|");
}

export function buildAddressBookCompanyKey(value: Pick<AddressBookEntryInput, "company_name" | "label" | "address">): string {
  return normalizeCompanyName(value.company_name || value.label || value.address);
}

export function buildAddressBookIdentityKey(value: AddressBookEntryInput): string {
  return `${buildAddressBookCompanyKey(value)}|${buildAddressBookKey(value)}`;
}

export function isSameAddressBookCompany(
  existingName: string | null | undefined,
  nextName: string | null | undefined,
): boolean {
  const existing = normalizeCompanyName(existingName);
  const next = normalizeCompanyName(nextName);
  if (!existing || !next) return existing === next;
  if (existing === next) return true;

  const existingParts = existing.split(" ").filter(Boolean);
  const nextParts = next.split(" ").filter(Boolean);
  if (existingParts.length === 0 || nextParts.length === 0) return false;
  if (existingParts[0] !== nextParts[0]) return false;

  const existingSet = new Set(existingParts);
  const nextSet = new Set(nextParts);
  return nextParts.every((part) => existingSet.has(part)) || existingParts.every((part) => nextSet.has(part));
}

export function isAddressBookReady(value: AddressBookValue): boolean {
  return Boolean(
    value.street?.trim() &&
      (value.house_number?.trim() || /\d/.test(value.street)) &&
      (value.zipcode?.trim() || value.city?.trim()),
  );
}

export function toAddressBookPayload(input: AddressBookEntryInput) {
  const country = (input.country || "NL").trim().toUpperCase();
  const normalized_key = buildAddressBookKey({ ...input, country });
  const address =
    input.address?.trim() ||
    composeAddressString(
      {
        street: input.street,
        house_number: input.house_number || "",
        house_number_suffix: input.house_number_suffix || "",
        zipcode: input.zipcode || "",
        city: input.city || "",
        country,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        coords_manual: Boolean(input.coords_manual),
      },
      { includeLocality: true },
  );
  const label = input.label?.trim() || input.company_name?.trim() || address;
  const company_name = input.company_name?.trim() || label;
  const normalized_company_key = buildAddressBookCompanyKey({ company_name, label, address });

  return {
    tenant_id: input.tenant_id,
    label,
    company_name,
    address,
    street: input.street.trim(),
    house_number: input.house_number?.trim() || "",
    house_number_suffix: input.house_number_suffix?.trim() || "",
    zipcode: input.zipcode?.trim().toUpperCase() || "",
    city: input.city?.trim() || "",
    country,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    coords_manual: Boolean(input.coords_manual),
    location_type: input.location_type || "both",
    notes: input.notes?.trim() || null,
    time_window_start: input.time_window_start || null,
    time_window_end: input.time_window_end || null,
    normalized_company_key,
    normalized_key,
    source: input.source || "manual",
    usage_count: 1,
    last_used_at: new Date().toISOString(),
  };
}
