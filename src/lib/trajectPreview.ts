// ─── Traject Preview ──────────────────────────────────────────────────────
// Renders a non-persisted leg-preview for the NewOrder form so the planner
// can see how a booking is going to be split before hitting "opslaan".
// Reuses `evaluateMatch` from trajectRouter so the preview and the actual
// save follow the exact same matching logic.

import { supabase } from "@/integrations/supabase/client";
import {
  evaluateMatch,
  resolveHubAddress,
  type BookingInput,
  type LegTemplate,
  type TrajectRule,
} from "./trajectRouter";

export interface PreviewLeg {
  sequence: number;
  from: string | null;
  to: string | null;
  department_code: string;
  leg_role: string;
}

export interface TrajectPreview {
  matched: boolean;
  rule?: TrajectRule | null;
  legs: PreviewLeg[];
  reason?: string;
}

function resolveEndpoint(
  endpoint: LegTemplate["from"],
  booking: BookingInput,
  hubAddress: string,
): string | null {
  switch (endpoint) {
    case "pickup":
      return booking.pickup_address ?? null;
    case "delivery":
      return booking.delivery_address ?? null;
    case "hub":
      return hubAddress;
    default:
      return null;
  }
}

/**
 * Builds a non-persisted preview of the legs that would be created if the
 * planner saves this booking. Reads `traject_rules` and (if needed) the
 * tenant's hub address, but writes nothing.
 */
export async function previewLegs(
  booking: BookingInput,
  tenantId: string,
): Promise<TrajectPreview> {
  if (!booking.pickup_address || !booking.delivery_address) {
    return {
      matched: false,
      legs: [],
      reason: "Ophaal- en afleveradres zijn beide verplicht voor traject-preview.",
    };
  }

  const { data, error } = await (supabase as any)
    .from("traject_rules")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("priority", { ascending: true });

  if (error) {
    return { matched: false, legs: [], reason: `Fout bij ophalen regels: ${error.message}` };
  }

  const rules = (data || []) as TrajectRule[];
  const rule = rules.find((r) => evaluateMatch(booking, r.match_conditions));

  if (!rule) {
    return {
      matched: false,
      legs: [],
      reason:
        "Geen passende traject-regel gevonden. Configureer een default regel in traject_rules.",
    };
  }

  const legsTemplate = Array.isArray(rule.legs_template) ? rule.legs_template : [];
  const needsHub = legsTemplate.some((l) => l.from === "hub" || l.to === "hub");
  const hubAddress = needsHub ? await resolveHubAddress(tenantId) : "";

  const legs: PreviewLeg[] = [...legsTemplate]
    .sort((a, b) => a.sequence - b.sequence)
    .map((l) => ({
      sequence: l.sequence,
      from: resolveEndpoint(l.from, booking, hubAddress),
      to: resolveEndpoint(l.to, booking, hubAddress),
      department_code: l.department_code,
      leg_role: l.leg_role,
    }));

  return { matched: true, rule, legs };
}
