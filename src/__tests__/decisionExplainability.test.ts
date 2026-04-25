import { describe, expect, it } from "vitest";

import {
  explainDecision,
  getConfidenceLabel,
  getConfidenceTone,
} from "@/lib/decisionExplainability";

describe("decisionExplainability", () => {
  it("classifies high confidence decisions", () => {
    expect(getConfidenceTone(94)).toBe("high");
    expect(getConfidenceLabel(94)).toBe("Hoge zekerheid");
  });

  it("classifies medium confidence decisions", () => {
    expect(getConfidenceTone(82)).toBe("medium");
    expect(getConfidenceLabel(82)).toBe("Redelijke zekerheid");
  });

  it("classifies low confidence decisions", () => {
    expect(getConfidenceTone(61)).toBe("low");
    expect(getConfidenceLabel(61)).toBe("Lage zekerheid");
  });

  it("builds readable explanation text", () => {
    const explanation = explainDecision({
      decision_type: "PLANNING",
      resolution: "AUTO_EXECUTED",
      proposed_action: "Chauffeur Jan toegewezen aan rit 42",
      input_confidence: 91,
    });

    expect(explanation.summary).toContain("Chauffeur Jan");
    expect(explanation.reason).toContain("Planning is automatisch uitgevoerd");
    expect(explanation.confidenceLabel).toBe("Hoge zekerheid");
  });

  it("shows actual action for modified decisions", () => {
    const explanation = explainDecision({
      decision_type: "PRICING",
      resolution: "MODIFIED",
      proposed_action: "Prijsvoorstel 125 EUR",
      actual_action: "Prijs aangepast naar 145 EUR",
      input_confidence: 78,
    });

    expect(explanation.title).toContain("->");
    expect(explanation.reason).toContain("Prijsvoorstel is aangepast");
  });
});
