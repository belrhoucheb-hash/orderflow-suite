import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";

import type { Driver } from "@/hooks/useDrivers";
import type { VehicleAvailability } from "@/hooks/useVehicleAvailability";

/**
 * Pure helpers voor planner-eligibility-checks op rooster-cellen. Geen
 * Supabase- of React-side-effects, zodat ze los testbaar blijven en in
 * een hook of een server-job hergebruikt kunnen worden.
 *
 * Drie checks:
 *   1. Voertuig-onbeschikbaarheid op de gekozen datum.
 *   2. Code 95 / rijbewijs-conflict tussen chauffeur en voertuigtype.
 *   3. Contracturen-overschrijding bij het bijplannen van extra uren.
 */

export type EligibilitySeverity = "error" | "warn";

export interface CheckResult {
  ok: boolean;
  severity: EligibilitySeverity;
  message?: string;
}

const DUTCH_DATE = "d MMMM yyyy";

function fmtDate(iso: string): string {
  try {
    return format(parseISO(iso), DUTCH_DATE, { locale: nl });
  } catch {
    return iso;
  }
}

function startOfUtcDay(iso: string): Date {
  // Vergelijkingen op kalenderdag, niet op uur. parseISO interpreteert
  // 'YYYY-MM-DD' als lokale middernacht; voor zuivere date-vergelijking
  // werken we via UTC-jaar/maand/dag uit de Date.
  const d = parseISO(iso);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function diffDays(fromIso: string, toIso: string): number {
  const a = startOfUtcDay(fromIso).getTime();
  const b = startOfUtcDay(toIso).getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function normaliseType(type: string | null | undefined): string {
  return (type ?? "").toLowerCase().trim();
}

/**
 * Voertuigtypes waarvoor Code 95 (vakbekwaamheid C/CE) verplicht is.
 * Code 95 geldt vanaf rijbewijs C, dus voor zware bedrijfsvoertuigen.
 * Conform de NL-vehicle_types-seed bevat dit "trekker" en "bakwagen".
 */
const CODE95_VEHICLE_TYPES = new Set(["trekker", "bakwagen", "vrachtwagen"]);

export function vehicleTypeRequiresCode95(type: string | null | undefined): boolean {
  return CODE95_VEHICLE_TYPES.has(normaliseType(type));
}

/**
 * Status-waarden uit `vehicle_availability` die het voertuig blokkeren.
 * "beschikbaar" = expliciet vrijgegeven, alle andere statussen tellen
 * als niet-bruikbaar voor planning.
 */
const BLOCKED_AVAILABILITY_STATUSES = new Set([
  "onderhoud",
  "defect",
  "niet_beschikbaar",
]);

const STATUS_LABELS: Record<string, string> = {
  onderhoud: "In onderhoud",
  defect: "Defect",
  niet_beschikbaar: "Niet beschikbaar",
};

export interface VehicleAvailabilityCheck {
  ok: boolean;
  reason?: string;
}

export function checkVehicleAvailability(
  vehicleId: string | null | undefined,
  date: string,
  rows: ReadonlyArray<VehicleAvailability> | null | undefined,
): VehicleAvailabilityCheck {
  if (!vehicleId) return { ok: true };
  const list = rows ?? [];
  const match = list.find(
    (r) => r.vehicle_id === vehicleId && r.date === date,
  );
  if (!match) return { ok: true };
  const status = (match.status ?? "").toLowerCase();
  if (!BLOCKED_AVAILABILITY_STATUSES.has(status)) return { ok: true };
  const label = STATUS_LABELS[status] ?? "Niet beschikbaar";
  const reason = match.reason
    ? `${label} op ${fmtDate(date)}: ${match.reason}`
    : `${label} op ${fmtDate(date)}`;
  return { ok: false, reason };
}

export interface CertificationCheck {
  ok: boolean;
  warnings: string[];
}

/**
 * Controleert of de chauffeur de juiste papieren heeft voor het gekozen
 * voertuigtype op de geplande datum. Onbekende of ontbrekende velden
 * geven geen waarschuwing, omdat de planner anders bij elke nieuwe
 * chauffeur lawine-meldingen krijgt voor data die nog niet ingevoerd is.
 */
export function checkDriverCertificationForVehicle(
  driver: Pick<Driver, "code95_expiry_date" | "legitimation_expiry_date"> | null | undefined,
  vehicleType: string | null | undefined,
  date: string,
): CertificationCheck {
  if (!driver) return { ok: true, warnings: [] };
  const warnings: string[] = [];

  if (driver.legitimation_expiry_date) {
    const days = diffDays(date, driver.legitimation_expiry_date);
    if (days < 0) {
      warnings.push(
        `Rijbewijs verlopen sinds ${fmtDate(driver.legitimation_expiry_date)}`,
      );
    } else if (days <= 30) {
      warnings.push(
        `Rijbewijs verloopt op ${fmtDate(driver.legitimation_expiry_date)}`,
      );
    }
  }

  if (vehicleTypeRequiresCode95(vehicleType)) {
    if (!driver.code95_expiry_date) {
      warnings.push("Code 95 niet geregistreerd voor dit voertuigtype");
    } else {
      const days = diffDays(date, driver.code95_expiry_date);
      if (days < 0) {
        warnings.push(
          `Code 95 verlopen sinds ${fmtDate(driver.code95_expiry_date)}`,
        );
      } else if (days <= 30) {
        warnings.push(
          `Code 95 verloopt op ${fmtDate(driver.code95_expiry_date)}`,
        );
      }
    }
  }

  return { ok: warnings.length === 0, warnings };
}

export interface ContractHoursCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Vergelijkt totaal-uren-na-inplannen tegen `contract_hours_per_week`.
 * `hoursThisWeek` is de huidige som van geplande uren in dezelfde
 * ISO-week, exclusief de nieuwe waarde voor `date`. `addedHours` is de
 * uren die deze cel toevoegt (eind - start).
 *
 * Geen contract-uren ingevuld? Dan kunnen we niets aan vergelijken en
 * sla we de check stil over.
 */
export function checkContractHoursOverflow(
  driver: Pick<Driver, "contract_hours_per_week"> | null | undefined,
  hoursThisWeek: number,
  addedHours: number,
): ContractHoursCheck {
  if (!driver) return { ok: true };
  const contract = driver.contract_hours_per_week;
  if (contract == null || contract <= 0) return { ok: true };
  const total = (hoursThisWeek ?? 0) + (addedHours ?? 0);
  if (total <= contract) return { ok: true };
  return {
    ok: false,
    reason: `${contract} uur contract, na inplannen ${roundHours(total)} uur`,
  };
}

function roundHours(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 10) / 10;
  return rounded.toString().replace(".", ",");
}

/**
 * Berekent het aantal uren tussen twee `HH:mm`-strings. Eind-tijd vóór
 * start-tijd telt als nul (defensieve fallback). Geen poging tot
 * over-middernacht-correctie omdat rooster-shifts daar in deze codebase
 * geen ondersteuning voor hebben.
 */
export function durationHours(
  start: string | null | undefined,
  end: string | null | undefined,
): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map((n) => Number.parseInt(n, 10));
  const [eh, em] = end.split(":").map((n) => Number.parseInt(n, 10));
  if (
    !Number.isFinite(sh) ||
    !Number.isFinite(sm) ||
    !Number.isFinite(eh) ||
    !Number.isFinite(em)
  ) {
    return 0;
  }
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  if (endMin <= startMin) return 0;
  return (endMin - startMin) / 60;
}
