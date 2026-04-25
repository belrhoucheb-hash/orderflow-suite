import type { DecisionType } from "@/types/confidence";

interface ExplainableDecision {
  decision_type: DecisionType;
  resolution: string;
  proposed_action: string;
  actual_action?: string | null;
  input_confidence?: number | null;
}

export interface DecisionExplanation {
  title: string;
  summary: string;
  reason: string;
  confidenceLabel: string;
  confidenceTone: "high" | "medium" | "low";
}

function normalizeAction(action: string | null | undefined): string {
  const trimmed = (action ?? "").trim();
  if (!trimmed) return "Geen actieomschrijving beschikbaar";
  return trimmed;
}

export function getConfidenceTone(confidence?: number | null): "high" | "medium" | "low" {
  const value = confidence ?? 0;
  if (value >= 90) return "high";
  if (value >= 75) return "medium";
  return "low";
}

export function getConfidenceLabel(confidence?: number | null): string {
  const tone = getConfidenceTone(confidence);
  if (tone === "high") return "Hoge zekerheid";
  if (tone === "medium") return "Redelijke zekerheid";
  return "Lage zekerheid";
}

function buildReason(decisionType: DecisionType, resolution: string, confidence?: number | null): string {
  const confidenceLabel = getConfidenceLabel(confidence).toLowerCase();

  switch (decisionType) {
    case "ORDER_INTAKE":
      return resolution === "AUTO_EXECUTED"
        ? `Order intake is autonoom doorgezet op basis van ${confidenceLabel} en herkenbare orderdata.`
        : `Order intake vraagt menselijke controle omdat de invoer niet zeker genoeg was of is aangepast.`;
    case "PLANNING":
      return resolution === "AUTO_EXECUTED"
        ? `Planning is automatisch uitgevoerd omdat match tussen capaciteit, chauffeur en volgorde voldoende sterk was.`
        : `Planning bleef onder menselijke regie omdat de voorgestelde inzet of timing bevestiging nodig had.`;
    case "DISPATCH":
      return resolution === "AUTO_EXECUTED"
        ? `Dispatch is automatisch gestart omdat ritstatus en vertrekmoment voldoende betrouwbaar waren.`
        : `Dispatch is niet volledig autonoom afgehandeld omdat vrijgave of timing extra controle vroeg.`;
    case "PRICING":
      return resolution === "AUTO_EXECUTED"
        ? `Prijsvoorstel is automatisch gevolgd omdat prijsregels en toeslagen eenduidig toepasbaar waren.`
        : `Prijsvoorstel is aangepast of bevestigd omdat de marge- of toeslaglogica controle vroeg.`;
    case "INVOICING":
      return resolution === "AUTO_EXECUTED"
        ? `Facturatie liep automatisch door omdat ritafhandeling en prijsinformatie compleet genoeg waren.`
        : `Facturatie bleef deels handmatig omdat afronding of factuurcontrole nodig was.`;
    case "CONSOLIDATION":
      return resolution === "AUTO_EXECUTED"
        ? `Consolidatie is automatisch voorgesteld op basis van compatibele stops, tijdvensters en capaciteit.`
        : `Consolidatievoorstel vroeg extra beoordeling vanwege cluster-risico of plannerkeuze.`;
    default:
      return "Deze beslissing is genomen op basis van de beschikbare operationele data en confidence-score.";
  }
}

export function explainDecision(decision: ExplainableDecision): DecisionExplanation {
  const summary = normalizeAction(decision.proposed_action);
  const title =
    decision.resolution === "MODIFIED" && decision.actual_action
      ? `${summary} -> ${normalizeAction(decision.actual_action)}`
      : summary;

  return {
    title,
    summary,
    reason: buildReason(decision.decision_type, decision.resolution, decision.input_confidence),
    confidenceLabel: getConfidenceLabel(decision.input_confidence),
    confidenceTone: getConfidenceTone(decision.input_confidence),
  };
}
