/**
 * Few-Shot Builder — converts corrected AI decisions into Gemini-compatible
 * few-shot examples grouped by field type.
 *
 * Used by the feedback loop to teach the AI from planner corrections.
 */

import type { AIDecision } from "@/types/confidence";

// ── Field type groups ──────────────────────────────────────────

const FIELD_GROUPS: Record<string, string[]> = {
  addresses: [
    "pickup_address",
    "delivery_address",
    "pickupAddress",
    "deliveryAddress",
  ],
  quantities: ["quantity", "unit", "weight_kg", "weight", "dimensions"],
  requirements: ["requirements", "transport_type", "transportType"],
  dates: [
    "pickup_date",
    "delivery_date",
    "time_window_start",
    "time_window_end",
  ],
  identity: ["client_name", "reference_number", "contact_name"],
};

const MAX_PER_GROUP = 5;

// ── Types ───────────────────────────────────────���──────────────

export interface FewShotExample {
  fieldGroup: string;
  field: string;
  aiValue: string;
  correctedValue: string;
  inputSnippet?: string;
}

// ── Core builder ───────────────────────────────────────────────

/**
 * Extracts per-field corrections from AIDecision rows where was_corrected=true,
 * groups them by field type, limits to MAX_PER_GROUP per group, and formats
 * them as a Gemini-compatible few-shot prompt section.
 */
export function buildFewShotExamples(decisions: AIDecision[]): string {
  if (!decisions || decisions.length === 0) return "";

  const corrected = decisions.filter((d) => d.was_corrected && d.final_values);
  if (corrected.length === 0) return "";

  const examples = extractExamples(corrected);
  if (examples.length === 0) return "";

  return formatExamples(examples);
}

/**
 * Extract individual field-level corrections from decisions.
 */
export function extractExamples(decisions: AIDecision[]): FewShotExample[] {
  const examples: FewShotExample[] = [];

  for (const d of decisions) {
    if (!d.ai_suggestion || !d.final_values) continue;

    const suggestion = d.ai_suggestion as Record<string, unknown>;
    const final = d.final_values as Record<string, unknown>;

    for (const [key, aiVal] of Object.entries(suggestion)) {
      const correctedVal = final[key];
      // Skip if values are the same (no correction for this field)
      if (correctedVal === undefined || correctedVal === null) continue;
      if (stringify(aiVal) === stringify(correctedVal)) continue;
      // Skip internal/meta fields
      if (
        key === "confidence_score" ||
        key === "field_confidence" ||
        key === "field_sources"
      )
        continue;

      const group = getFieldGroup(key);
      examples.push({
        fieldGroup: group,
        field: key,
        aiValue: stringify(aiVal),
        correctedValue: stringify(correctedVal),
      });
    }
  }

  return examples;
}

/**
 * Group examples by field type and limit to MAX_PER_GROUP each.
 */
export function groupAndLimit(
  examples: FewShotExample[],
): Map<string, FewShotExample[]> {
  const grouped = new Map<string, FewShotExample[]>();

  for (const ex of examples) {
    const list = grouped.get(ex.fieldGroup) ?? [];
    list.push(ex);
    grouped.set(ex.fieldGroup, list);
  }

  // Limit each group to most recent N
  for (const [group, list] of grouped) {
    if (list.length > MAX_PER_GROUP) {
      grouped.set(group, list.slice(0, MAX_PER_GROUP));
    }
  }

  return grouped;
}

/**
 * Format grouped examples into a Gemini prompt section.
 */
export function formatExamples(examples: FewShotExample[]): string {
  const grouped = groupAndLimit(examples);
  if (grouped.size === 0) return "";

  const sections: string[] = [];

  const groupLabels: Record<string, string> = {
    addresses: "Adressen",
    quantities: "Hoeveelheden & Gewicht",
    requirements: "Vereisten & Type",
    dates: "Datums & Tijden",
    identity: "Klant & Referentie",
    other: "Overig",
  };

  for (const [group, exs] of grouped) {
    const label = groupLabels[group] ?? group;
    const lines = exs.map(
      (ex) =>
        `  - ${ex.field}: AI "${ex.aiValue}" -> Corrected "${ex.correctedValue}"`,
    );
    sections.push(`${label}:\n${lines.join("\n")}`);
  }

  return [
    "Here are previous corrections for this client (apply these patterns!):",
    ...sections,
  ].join("\n");
}

// ── Helpers ────────────────────────────────────────────────────

function getFieldGroup(field: string): string {
  for (const [group, fields] of Object.entries(FIELD_GROUPS)) {
    if (fields.includes(field)) return group;
  }
  return "other";
}

function stringify(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val;
  if (Array.isArray(val)) return val.join(", ");
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}
