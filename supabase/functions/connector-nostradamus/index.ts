import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getUserAuth, isTrustedCaller } from "../_shared/auth.ts";
import { corsFor, handleOptions } from "../_shared/cors.ts";
import {
  credentialValue,
  loadConfig,
  mappingValue,
  runConnectorAction,
  type ConnectorConfig,
  type ConnectorPullResult,
  type ConnectorTestResult,
} from "../_shared/connectors/runtime.ts";

const PROVIDER = "nostradamus";

interface RequestBody {
  action: "test" | "pull";
  tenant_id: string;
  since?: string | null;
  until?: string | null;
}

interface PullActionResult extends ConnectorPullResult {
  recordsCount?: number;
  imported?: number;
  skipped?: number;
  message?: string;
  updatedDrivers?: number;
  availabilityRows?: number;
  documentRows?: number;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  const cors = corsFor(req);
  const headers = { ...cors, "Content-Type": "application/json" };

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers });
  }

  if (!isTrustedCaller(req)) {
    const auth = await getUserAuth(req);
    if (!auth.ok) {
      return new Response(JSON.stringify({ error: auth.error }), { status: auth.status, headers });
    }
    if (auth.tenantId !== body.tenant_id) {
      return new Response(JSON.stringify({ error: "Tenant mismatch" }), { status: 403, headers });
    }
  }

  if (!body.tenant_id) {
    return new Response(JSON.stringify({ error: "tenant_id verplicht" }), { status: 400, headers });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  let config: ConnectorConfig;
  try {
    config = await loadConfig(supabase, body.tenant_id, PROVIDER);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 200, headers });
  }

  if (body.action === "test") {
    const result = await runConnectorAction(
      supabase,
      { tenantId: body.tenant_id, provider: PROVIDER, direction: "test" },
      () => testConnection(config),
    );
    return new Response(JSON.stringify(result), { status: 200, headers });
  }

  if (body.action === "pull") {
    const until = body.until ?? new Date().toISOString().slice(0, 10);
    const since = body.since ?? daysAgoIso(14);
    const result = await runConnectorAction(
      supabase,
      { tenantId: body.tenant_id, provider: PROVIDER, direction: "pull" },
      () => pullHours(supabase, config, since, until),
    );
    return new Response(JSON.stringify(result), { status: 200, headers });
  }

  return new Response(JSON.stringify({ error: `Onbekende action: ${body.action}` }), {
    status: 400,
    headers,
  });
});

async function testConnection(config: ConnectorConfig): Promise<ConnectorTestResult> {
  if (config.credentials.mockMode === true) {
    return { ok: true, message: "Mock-modus actief: voorbeeldimport klaar voor test." };
  }

  const response = await fetchNostradamus(config, daysAgoIso(1), new Date().toISOString().slice(0, 10));
  if (!response.ok) {
    return { ok: false, message: response.error ?? "Verbinding mislukt" };
  }

  return {
    ok: true,
    message: "Verbinding gelukt",
    details: { sampleCount: response.records.length },
  };
}

async function pullHours(
  supabase: ReturnType<typeof createClient>,
  config: ConnectorConfig,
  since: string,
  until: string,
): Promise<PullActionResult> {
  const response = config.credentials.mockMode === true
    ? mockResponse()
    : await fetchNostradamus(config, since, until);

  if (!response.ok) {
    return { ok: false, error: response.error, recordsCount: 0 };
  }

  const personnelField = mappingValue(config, "personnel_number_field", "employeeNumber");
  const dateField = mappingValue(config, "work_date_field", "date");
  const hoursField = mappingValue(config, "hours_field", "workedHours");
  const detailsPath = mappingValue(config, "details_path", "details");
  const contractPath = mappingValue(config, "contract_path", "contract");
  const hoursPath = mappingValue(config, "hours_path", "hours");
  const leavePath = mappingValue(config, "leave_path", "leave");
  const sicknessPath = mappingValue(config, "sickness_path", "sickness");
  const filesPath = mappingValue(config, "files_path", "files");

  const rawPersonnelNumbers = new Set<string>();
  for (const row of response.records) {
    const personnelNumber = stringValue(readPath(row, personnelField));
    if (personnelNumber) rawPersonnelNumbers.add(personnelNumber);
  }

  const personnelNumbers = Array.from(rawPersonnelNumbers);
  if (personnelNumbers.length === 0) {
    return {
      ok: true,
      recordsCount: 0,
      imported: 0,
      skipped: response.records.length,
      message: "Geen bruikbare personeelsnummers in response gevonden.",
      records: [],
    };
  }

  const { data: drivers, error: driversError } = await supabase
    .from("drivers")
    .select("id, personnel_number")
    .eq("tenant_id", config.tenantId)
    .in("personnel_number", personnelNumbers);
  if (driversError) throw new Error(`drivers lookup failed: ${driversError.message}`);

  const driverByPersonnelNumber = new Map<string, string>();
  for (const row of drivers ?? []) {
    const personnelNumber = stringValue((row as { personnel_number?: unknown }).personnel_number);
    const driverId = stringValue((row as { id?: unknown }).id);
    if (personnelNumber && driverId) driverByPersonnelNumber.set(personnelNumber, driverId);
  }

  const driverUpdates = new Map<string, Record<string, unknown>>();
  const availabilityRows = new Map<string, {
    tenant_id: string;
    driver_id: string;
    date: string;
    status: "verlof" | "ziek";
    hours_available: number | null;
    reason: string | null;
  }>();
  const documentRows = new Map<string, {
    tenant_id: string;
    driver_id: string;
    provider: string;
    category: string;
    title: string;
    document_url: string | null;
    external_file_id: string | null;
    metadata: Record<string, unknown>;
  }>();

  const aggregates = new Map<string, {
    tenant_id: string;
    provider: string;
    driver_id: string;
    work_date: string;
    hours_worked: number;
    external_employee_id: string | null;
    source_payload: Record<string, unknown>;
    synced_at: string;
  }>();
  const personnelCards = new Map<string, {
    tenant_id: string;
    provider: string;
    driver_id: string;
    external_employee_id: string | null;
    details_json: Record<string, unknown>;
    contract_json: Record<string, unknown>;
    hours_json: Record<string, unknown>;
    leave_json: unknown[];
    sickness_json: unknown[];
    files_json: unknown[];
    raw_payload: Record<string, unknown>;
    synced_at: string;
  }>();

  let skipped = 0;
  for (const row of response.records) {
    const personnelNumber = stringValue(readPath(row, personnelField));
    const driverId = personnelNumber ? driverByPersonnelNumber.get(personnelNumber) : undefined;
    const workDate = toIsoDate(readPath(row, dateField));
    const hoursWorked = toNumber(readPath(row, hoursField));

    if (personnelNumber && driverId) {
      const details = asRecord(readPath(row, detailsPath));
      const contract = asRecord(readPath(row, contractPath));
      const leave = asArray(readPath(row, leavePath));
      const sickness = asArray(readPath(row, sicknessPath));
      const files = asArray(readPath(row, filesPath));

      const driverPatch = buildDriverPatch(personnelNumber, details, contract);
      if (Object.keys(driverPatch).length > 0) {
        const existingPatch = driverUpdates.get(driverId) ?? {};
        driverUpdates.set(driverId, { ...existingPatch, ...driverPatch });
      }

      for (const leaveRow of expandAvailabilityRows(config.tenantId, driverId, "verlof", leave)) {
        availabilityRows.set(`${leaveRow.driver_id}:${leaveRow.date}:${leaveRow.status}`, leaveRow);
      }
      for (const sickRow of expandAvailabilityRows(config.tenantId, driverId, "ziek", sickness)) {
        availabilityRows.set(`${sickRow.driver_id}:${sickRow.date}:${sickRow.status}`, sickRow);
      }
      for (const documentRow of buildDocumentRows(config.tenantId, driverId, files)) {
        documentRows.set(
          `${driverId}:${documentRow.external_file_id ?? documentRow.title}`,
          documentRow,
        );
      }

      personnelCards.set(driverId, {
        tenant_id: config.tenantId,
        provider: PROVIDER,
        driver_id: driverId,
        external_employee_id: personnelNumber,
        details_json: details,
        contract_json: contract,
        hours_json: asRecord(readPath(row, hoursPath)),
        leave_json: leave,
        sickness_json: sickness,
        files_json: files,
        raw_payload: row,
        synced_at: new Date().toISOString(),
      });
    }

    if (!personnelNumber || !driverId || !workDate || hoursWorked === null) {
      skipped += 1;
      continue;
    }

    const key = `${driverId}:${workDate}`;
    const existing = aggregates.get(key);
    if (existing) {
      existing.hours_worked += hoursWorked;
      continue;
    }

    aggregates.set(key, {
      tenant_id: config.tenantId,
      provider: PROVIDER,
      driver_id: driverId,
      work_date: workDate,
      hours_worked: hoursWorked,
      external_employee_id: personnelNumber,
      source_payload: row,
      synced_at: new Date().toISOString(),
    });
  }

  const rows = Array.from(aggregates.values());
  const cardRows = Array.from(personnelCards.values());
  let updatedDrivers = 0;
  for (const [driverId, patch] of driverUpdates.entries()) {
    const { error } = await supabase
      .from("drivers")
      .update(patch)
      .eq("tenant_id", config.tenantId)
      .eq("id", driverId);
    if (error) throw new Error(`driver update failed: ${error.message}`);
    updatedDrivers += 1;
  }
  if (rows.length > 0) {
    const { error } = await supabase
      .from("driver_external_hours")
      .upsert(rows, { onConflict: "tenant_id,provider,driver_id,work_date" });
    if (error) throw new Error(`upsert failed: ${error.message}`);
  }
  if (cardRows.length > 0) {
    const { error } = await supabase
      .from("driver_external_personnel_cards")
      .upsert(cardRows, { onConflict: "tenant_id,provider,driver_id" });
    if (error) throw new Error(`personnel card upsert failed: ${error.message}`);
  }
  const availabilityPayload = Array.from(availabilityRows.values());
  if (availabilityPayload.length > 0) {
    const { error } = await supabase
      .from("driver_availability")
      .upsert(availabilityPayload, { onConflict: "tenant_id,driver_id,date" });
    if (error) throw new Error(`availability upsert failed: ${error.message}`);
  }
  const documentsPayload = Array.from(documentRows.values());
  if (documentsPayload.length > 0) {
    const identifiableDocuments = documentsPayload.filter((row) => !!row.external_file_id);
    if (identifiableDocuments.length > 0) {
      const { error } = await supabase
        .from("driver_documents")
        .upsert(identifiableDocuments, { onConflict: "tenant_id,driver_id,provider,external_file_id" });
      if (error) throw new Error(`driver documents upsert failed: ${error.message}`);
    }

    const titleOnlyDocuments = documentsPayload.filter((row) => !row.external_file_id);
    for (const documentRow of titleOnlyDocuments) {
      const { data: existing, error: existingError } = await supabase
        .from("driver_documents")
        .select("id")
        .eq("tenant_id", documentRow.tenant_id)
        .eq("driver_id", documentRow.driver_id)
        .eq("provider", documentRow.provider)
        .eq("title", documentRow.title)
        .maybeSingle();
      if (existingError) {
        throw new Error(`driver documents lookup failed: ${existingError.message}`);
      }

      if (existing?.id) {
        const { error } = await supabase
          .from("driver_documents")
          .update({
            category: documentRow.category,
            document_url: documentRow.document_url,
            metadata: documentRow.metadata,
          })
          .eq("id", existing.id);
        if (error) throw new Error(`driver document update failed: ${error.message}`);
      } else {
        const { error } = await supabase
          .from("driver_documents")
          .insert(documentRow);
        if (error) throw new Error(`driver document insert failed: ${error.message}`);
      }
    }
  }

  return {
    ok: true,
    recordsCount: rows.length,
    imported: rows.length,
    skipped,
    updatedDrivers,
    availabilityRows: availabilityPayload.length,
    documentRows: documentsPayload.length,
    records: rows,
    message: `${rows.length} dagtotalen geimporteerd, ${updatedDrivers} chauffeurs bijgewerkt, ${availabilityPayload.length} beschikbaarheidsregels verwerkt en ${documentsPayload.length} documenten gekoppeld.`,
  };
}

async function fetchNostradamus(
  config: ConnectorConfig,
  since: string,
  until: string,
): Promise<{ ok: true; records: Array<Record<string, unknown>> } | { ok: false; error: string }> {
  const baseUrl = credentialValue(config, "baseUrl");
  const endpointPath = credentialValue(config, "endpointPath");
  const apiToken = credentialValue(config, "apiToken");
  if (!baseUrl || !endpointPath || !apiToken) {
    return { ok: false, error: "Basis-URL, endpoint-pad of API-token ontbreekt." };
  }

  const tokenHeader = credentialValue(config, "tokenHeader") ?? "Authorization";
  const tokenPrefix = credentialValue(config, "tokenPrefix") ?? "Bearer";
  const sinceParam = credentialValue(config, "sinceParam") ?? "since";
  const untilParam = credentialValue(config, "untilParam") ?? "until";

  const url = new URL(endpointPath, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (sinceParam) url.searchParams.set(sinceParam, since);
  if (untilParam) url.searchParams.set(untilParam, until);

  const headers = new Headers({ Accept: "application/json" });
  headers.set(tokenHeader, tokenPrefix ? `${tokenPrefix} ${apiToken}`.trim() : apiToken);

  const response = await fetch(url.toString(), { method: "GET", headers });
  if (!response.ok) {
    return { ok: false, error: `HTTP ${response.status} bij ophalen uren` };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { ok: false, error: "Response is geen geldige JSON." };
  }

  const arrayPath = mappingValue(config, "response_array_path", "");
  const records = extractRecords(json, arrayPath);
  if (!records) {
    return { ok: false, error: "Kon geen records-array vinden in response." };
  }

  return { ok: true, records };
}

function extractRecords(input: unknown, path: string): Array<Record<string, unknown>> | null {
  const candidate = path ? readPath(input, path) : input;
  if (!Array.isArray(candidate)) return null;
  return candidate.filter((row): row is Record<string, unknown> => !!row && typeof row === "object");
}

function readPath(input: unknown, path: string): unknown {
  if (!path) return input;
  return path.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[part];
  }, input);
}

function stringValue(input: unknown): string | null {
  if (typeof input === "string" && input.trim()) return input.trim();
  if (typeof input === "number" && Number.isFinite(input)) return String(input);
  return null;
}

function toNumber(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input === "string" && input.trim()) {
    const normalized = input.replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toIsoDate(input: unknown): string | null {
  const value = stringValue(input);
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function daysAgoIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function mockResponse(): { ok: true; records: Array<Record<string, unknown>> } {
  const today = new Date().toISOString().slice(0, 10);
  return {
    ok: true,
    records: [
      {
        employeeNumber: "1001",
        date: today,
        workedHours: 8,
        details: { name: "Demo Chauffeur", email: "demo@orderflow.nl", phone: "+31 6 12345678" },
        contract: { type: "vast", weeklyHours: 40, startDate: "2024-01-01" },
        hours: { workedThisWeek: 32, saldo: -1.5 },
        leave: [],
        sickness: [],
        files: [],
      },
      {
        employeeNumber: "1002",
        date: today,
        workedHours: 7.5,
        details: { name: "Tweede Chauffeur", email: "twee@orderflow.nl" },
        contract: { type: "flex", weeklyHours: 24, startDate: "2025-03-01" },
        hours: { workedThisWeek: 19.5, saldo: 0 },
        leave: [],
        sickness: [],
        files: [],
      },
      {
        employeeNumber: "1001",
        date: today,
        workedHours: 0.5,
        details: { name: "Demo Chauffeur" },
        contract: { type: "vast" },
        hours: { workedThisWeek: 32.5 },
        leave: [],
        sickness: [],
        files: [],
      },
    ],
  };
}

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

function asArray(input: unknown): unknown[] {
  return Array.isArray(input) ? input : [];
}

function buildDriverPatch(
  personnelNumber: string,
  details: Record<string, unknown>,
  contract: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  assignIfPresent(patch, "personnel_number", personnelNumber);
  assignIfPresent(patch, "name", firstString(details, ["name", "fullName", "employeeName"]));
  assignIfPresent(patch, "email", firstString(details, ["email", "emailAddress"]));
  assignIfPresent(patch, "phone", firstString(details, ["phone", "mobile", "mobilePhone"]));
  assignIfPresent(patch, "birth_date", firstDate(details, ["birthDate", "birth_date", "dateOfBirth"]));
  assignIfPresent(patch, "street", firstString(details, ["street", "addressStreet"]));
  assignIfPresent(patch, "house_number", firstString(details, ["houseNumber", "addressNumber"]));
  assignIfPresent(patch, "house_number_suffix", firstString(details, ["houseNumberSuffix", "addressSuffix"]));
  assignIfPresent(patch, "zipcode", firstString(details, ["zipcode", "postalCode"]));
  assignIfPresent(patch, "city", firstString(details, ["city", "addressCity"]));
  assignIfPresent(patch, "country", firstString(details, ["country", "countryCode"]));
  assignIfPresent(patch, "emergency_contact_name", firstString(details, ["emergencyContactName"]));
  assignIfPresent(patch, "emergency_contact_relation", firstEnum(details, ["emergencyContactRelation"], ["partner", "ouder", "kind", "broer-zus", "overig"]));
  assignIfPresent(patch, "emergency_contact_phone", firstString(details, ["emergencyContactPhone"]));

  assignIfPresent(patch, "hire_date", firstDate(contract, ["startDate", "hireDate", "contractStartDate"]));
  assignIfPresent(patch, "termination_date", firstDate(contract, ["endDate", "terminationDate", "contractEndDate"]));
  assignIfPresent(patch, "contract_hours_per_week", firstInteger(contract, ["weeklyHours", "contractHours", "hoursPerWeek"]));
  assignIfPresent(patch, "employment_type", mapEmploymentType(firstString(contract, ["type", "employmentType", "contractType"])));

  return patch;
}

function expandAvailabilityRows(
  tenantId: string,
  driverId: string,
  status: "verlof" | "ziek",
  rows: unknown[],
): Array<{
  tenant_id: string;
  driver_id: string;
  date: string;
  status: "verlof" | "ziek";
  hours_available: number | null;
  reason: string | null;
}> {
  const output: Array<{
    tenant_id: string;
    driver_id: string;
    date: string;
    status: "verlof" | "ziek";
    hours_available: number | null;
    reason: string | null;
  }> = [];

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const singleDate = firstDate(record, ["date", "day"]);
    const startDate = firstDate(record, ["startDate", "from", "fromDate"]) ?? singleDate;
    const endDate = firstDate(record, ["endDate", "to", "toDate"]) ?? singleDate;
    if (!startDate || !endDate) continue;
    const reason = firstString(record, ["reason", "description", "note"]);
    const hours = firstNumber(record, ["hoursAvailable", "availableHours", "hours"]);

    for (const date of eachIsoDate(startDate, endDate)) {
      output.push({
        tenant_id: tenantId,
        driver_id: driverId,
        date,
        status,
        hours_available: hours === null ? null : Math.max(0, Math.round(hours)),
        reason,
      });
    }
  }

  return output;
}

function buildDocumentRows(
  tenantId: string,
  driverId: string,
  rows: unknown[],
): Array<{
  tenant_id: string;
  driver_id: string;
  provider: string;
  category: string;
  title: string;
  document_url: string | null;
  external_file_id: string | null;
  metadata: Record<string, unknown>;
}> {
  const output: Array<{
    tenant_id: string;
    driver_id: string;
    provider: string;
    category: string;
    title: string;
    document_url: string | null;
    external_file_id: string | null;
    metadata: Record<string, unknown>;
  }> = [];

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const title = firstString(record, ["name", "title", "filename", "fileName"]);
    if (!title) continue;
    output.push({
      tenant_id: tenantId,
      driver_id: driverId,
      provider: PROVIDER,
      category: firstString(record, ["category", "type"]) ?? "algemeen",
      title,
      document_url: firstString(record, ["url", "downloadUrl", "documentUrl"]),
      external_file_id: firstString(record, ["id", "fileId", "externalId"]),
      metadata: record,
    });
  }

  return output;
}

function assignIfPresent(target: Record<string, unknown>, key: string, value: unknown) {
  if (value === undefined || value === null) return;
  if (typeof value === "string" && !value.trim()) return;
  target[key] = value;
}

function firstString(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = stringValue(source[key]);
    if (value) return value;
  }
  return null;
}

function firstDate(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = toIsoDate(source[key]);
    if (value) return value;
  }
  return null;
}

function firstInteger(source: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = toNumber(source[key]);
    if (value !== null) return Math.round(value);
  }
  return null;
}

function firstNumber(source: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = toNumber(source[key]);
    if (value !== null) return value;
  }
  return null;
}

function firstEnum(
  source: Record<string, unknown>,
  keys: string[],
  values: string[],
): string | null {
  const allowed = new Set(values);
  for (const key of keys) {
    const raw = stringValue(source[key])?.toLowerCase();
    if (!raw) continue;
    if (allowed.has(raw)) return raw;
  }
  return null;
}

function mapEmploymentType(raw: string | null): string | null {
  if (!raw) return null;
  const normalized = raw.toLowerCase();
  if (["vast", "fixed", "permanent"].includes(normalized)) return "vast";
  if (["flex", "oproep", "call"].includes(normalized)) return "flex";
  if (["ingehuurd", "extern", "contractor"].includes(normalized)) return "ingehuurd";
  if (["zzp", "freelance"].includes(normalized)) return "zzp";
  if (["uitzendkracht", "agency"].includes(normalized)) return "uitzendkracht";
  return null;
}

function eachIsoDate(start: string, end: string): string[] {
  const result: string[] = [];
  const cursor = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime()) || cursor > last) return result;
  while (cursor <= last) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}
