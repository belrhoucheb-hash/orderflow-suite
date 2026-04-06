import { describe, it, expect } from "vitest";
import {
  buildFewShotExamples,
  extractExamples,
  groupAndLimit,
  formatExamples,
} from "@/utils/fewShotBuilder";
import type { AIDecision } from "@/types/confidence";

// ── Test helpers ───────────────────────────────────────────────

function makeDecision(
  overrides: Partial<AIDecision> = {},
): AIDecision {
  return {
    id: "d-1",
    tenant_id: "t-1",
    decision_type: "order_extraction",
    entity_id: "o-1",
    entity_type: "order",
    confidence_score: 78,
    field_confidences: {},
    ai_suggestion: {
      pickup_address: "Amsterdam",
      delivery_address: "Rotterdam",
      quantity: 2,
      unit: "Pallets",
      requirements: [],
    },
    final_values: {
      pickup_address: "Keizersgracht 100, Amsterdam",
      delivery_address: "Rotterdam",
      quantity: 3,
      unit: "Pallets",
      requirements: ["Koeling"],
    },
    was_auto_approved: false,
    was_corrected: true,
    correction_summary: { pickupChanged: true, quantityChanged: true },
    outcome: "corrected",
    processing_time_ms: 1200,
    model_version: "gemini-2.5-flash",
    created_at: "2026-04-01T10:00:00Z",
    resolved_at: "2026-04-01T10:05:00Z",
  } satisfies AIDecision as AIDecision;
}

// ── Tests ──────────────────────────────────────────────────────

describe("buildFewShotExamples", () => {
  it("returns empty string for empty array", () => {
    expect(buildFewShotExamples([])).toBe("");
  });

  it("returns empty string for null/undefined input", () => {
    expect(buildFewShotExamples(null as unknown as AIDecision[])).toBe("");
    expect(buildFewShotExamples(undefined as unknown as AIDecision[])).toBe("");
  });

  it("returns empty string when no decisions are corrected", () => {
    const d = makeDecision();
    d.was_corrected = false;
    d.final_values = null;
    const decisions = [d];
    expect(buildFewShotExamples(decisions)).toBe("");
  });

  it("produces formatted output for corrected decisions", () => {
    const decisions = [makeDecision()];
    const result = buildFewShotExamples(decisions);

    expect(result).toContain("previous corrections");
    expect(result).toContain("pickup_address");
    expect(result).toContain("Amsterdam");
    expect(result).toContain("Keizersgracht 100, Amsterdam");
  });

  it("groups corrections by field type", () => {
    const decisions = [makeDecision()];
    const result = buildFewShotExamples(decisions);

    // pickup_address should be under Adressen
    expect(result).toContain("Adressen");
    // quantity should be under Hoeveelheden
    expect(result).toContain("Hoeveelheden");
    // requirements should be under Vereisten
    expect(result).toContain("Vereisten");
  });

  it("skips fields that were not corrected (same value)", () => {
    const decisions = [
      makeDecision({
        ai_suggestion: { delivery_address: "Rotterdam", quantity: 5 },
        final_values: { delivery_address: "Rotterdam", quantity: 10 },
      }),
    ];
    const result = buildFewShotExamples(decisions);

    // delivery_address unchanged, should not appear
    expect(result).not.toContain('delivery_address: AI "Rotterdam"');
    // quantity was changed, should appear
    expect(result).toContain("quantity");
  });

  it("skips confidence/meta fields", () => {
    const decisions = [
      makeDecision({
        ai_suggestion: {
          pickup_address: "A",
          confidence_score: 80,
          field_confidence: { pickup_address: 70 },
        },
        final_values: {
          pickup_address: "B",
          confidence_score: 95,
          field_confidence: { pickup_address: 90 },
        },
      }),
    ];
    const result = buildFewShotExamples(decisions);

    expect(result).not.toContain("confidence_score");
    expect(result).not.toContain("field_confidence");
  });
});

describe("extractExamples", () => {
  it("extracts per-field corrections", () => {
    const examples = extractExamples([makeDecision()]);

    // Should have pickup_address (changed), quantity (changed), requirements (changed)
    // delivery_address unchanged, unit unchanged
    const fields = examples.map((e) => e.field);
    expect(fields).toContain("pickup_address");
    expect(fields).toContain("quantity");
    expect(fields).toContain("requirements");
    expect(fields).not.toContain("delivery_address");
    expect(fields).not.toContain("unit");
  });

  it("returns empty array for decisions without final_values", () => {
    const d = makeDecision();
    d.final_values = null;
    const examples = extractExamples([d]);
    expect(examples).toHaveLength(0);
  });
});

describe("groupAndLimit", () => {
  it("limits each group to 5 examples", () => {
    const examples = Array.from({ length: 8 }, (_, i) => ({
      fieldGroup: "addresses",
      field: `addr_${i}`,
      aiValue: `old_${i}`,
      correctedValue: `new_${i}`,
    }));

    const grouped = groupAndLimit(examples);
    const addressExamples = grouped.get("addresses");

    expect(addressExamples).toBeDefined();
    expect(addressExamples!.length).toBe(5);
  });

  it("keeps groups under limit untouched", () => {
    const examples = [
      { fieldGroup: "addresses", field: "pickup", aiValue: "A", correctedValue: "B" },
      { fieldGroup: "quantities", field: "qty", aiValue: "1", correctedValue: "2" },
    ];

    const grouped = groupAndLimit(examples);
    expect(grouped.get("addresses")!.length).toBe(1);
    expect(grouped.get("quantities")!.length).toBe(1);
  });
});

describe("formatExamples", () => {
  it("formats examples into a readable prompt", () => {
    const examples = [
      { fieldGroup: "addresses", field: "pickup_address", aiValue: "Amsterdam", correctedValue: "Keizersgracht 100, Amsterdam" },
      { fieldGroup: "quantities", field: "quantity", aiValue: "2", correctedValue: "3" },
    ];

    const result = formatExamples(examples);

    expect(result).toContain("previous corrections");
    expect(result).toContain("Adressen");
    expect(result).toContain("Hoeveelheden");
    expect(result).toContain('pickup_address: AI "Amsterdam" -> Corrected "Keizersgracht 100, Amsterdam"');
    expect(result).toContain('quantity: AI "2" -> Corrected "3"');
  });

  it("returns empty string for empty array", () => {
    expect(formatExamples([])).toBe("");
  });
});
