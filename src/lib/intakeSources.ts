export type IntakeSource = "EMAIL" | "PORTAL" | "MANUAL" | "API" | "UNKNOWN";

export interface IntakeSourceMeta {
  key: IntakeSource;
  label: string;
  description: string;
  className: string;
}

const SOURCE_META: Record<IntakeSource, IntakeSourceMeta> = {
  EMAIL: {
    key: "EMAIL",
    label: "Mail",
    description: "Binnengekomen via inbox of e-mailimport",
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  PORTAL: {
    key: "PORTAL",
    label: "Portaal",
    description: "Ingediend door klant via portal",
    className: "bg-purple-50 text-purple-700 border-purple-200",
  },
  MANUAL: {
    key: "MANUAL",
    label: "Handmatig",
    description: "Aangemaakt door planner of backoffice",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  API: {
    key: "API",
    label: "API",
    description: "Binnengekomen via koppeling of externe client",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  UNKNOWN: {
    key: "UNKNOWN",
    label: "Onbekend",
    description: "Bron niet expliciet geregistreerd",
    className: "bg-gray-100 text-gray-600 border-gray-200",
  },
};

export function getIntakeSourceMeta(source?: string | null, fallbackHasEmail = false): IntakeSourceMeta {
  const normalized = (source ?? "").trim().toUpperCase();

  if (normalized === "EMAIL" || fallbackHasEmail) return SOURCE_META.EMAIL;
  if (normalized === "PORTAL") return SOURCE_META.PORTAL;
  if (normalized === "MANUAL") return SOURCE_META.MANUAL;
  if (normalized === "API") return SOURCE_META.API;
  return SOURCE_META.UNKNOWN;
}
