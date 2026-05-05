import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { FreightLine } from "@/lib/newOrder/types";
import type { FinancialTabPayload } from "@/components/orders/FinancialTab";

type WizardStep = "intake" | "route" | "cargo" | "financial" | "review";
type IntakeActiveQuestion = 1 | 2 | 3 | 4;
type RouteActiveQuestion = 1 | 2 | 3 | 4;
type CargoActiveQuestion = 1 | 2 | 3 | 4;
type ReviewActiveQuestion = 1 | 2 | 3;

export interface FinancialReviewCargoTotals {
  totAantal: number;
  totGewicht: number;
  primaryUnit: string;
}

export interface FinancialReviewSectionProps {
  // Wizard step state + navigation
  wizardStep: WizardStep;
  setWizardStep: Dispatch<SetStateAction<WizardStep>>;
  setIntakeManualBack: Dispatch<SetStateAction<boolean>>;
  setIntakeActiveQuestion: Dispatch<SetStateAction<IntakeActiveQuestion>>;
  setRouteManualBack: Dispatch<SetStateAction<boolean>>;
  setRouteActiveQuestion: Dispatch<SetStateAction<RouteActiveQuestion>>;
  setCargoManualBack: Dispatch<SetStateAction<boolean>>;
  setCargoActiveQuestion: Dispatch<SetStateAction<CargoActiveQuestion>>;
  reviewActiveQuestion: ReviewActiveQuestion;

  // Summary data
  clientName: string;
  routeLocationSummary: string;
  pickupLine: FreightLine | undefined;
  deliveryLine: FreightLine | undefined;
  cargoTotals: FinancialReviewCargoTotals;
  transportType: string;
  suggestedTransportType: string;
  showPmt: boolean;
  pmtLabel: string;
  pricingLabel: string;
  pricingPayload: FinancialTabPayload;

  // Validation flags driving the "edit jump" targets
  missingPickupAddress: boolean;
  missingDeliveryAddress: boolean;
  missingPickupTimeWindow: boolean;
  missingQuantity: boolean;
  missingWeight: boolean;
  cargoHasDimensions: boolean;

  // Planner reference textarea
  referentie: string;
  setReferentie: Dispatch<SetStateAction<string>>;

  // Class strings + render helpers shared with the other wizard sections
  uberFlowShellClass: string;
  conversationalCardClass: (level?: number) => string;
  flowLabelClass: string;
  renderUberStepHeader: (label: string, title: string, hint: string) => ReactNode;
  renderCollapsedAnswer: (
    label: string,
    value: string,
    onEdit: () => void,
    mutedValue?: string,
  ) => ReactNode;
  renderQuestionPrompt: (
    question: { step: string; title: string; hint: string },
    complete?: boolean,
    ready?: boolean,
  ) => ReactNode;
  renderWizardFooter: () => ReactNode;

  // Slot voor de lazy-loaded productie-FinancialTab (Suspense + lazy blijven in NewOrder.tsx)
  financialTabSlot: ReactNode;
}

export function FinancialReviewSection(props: FinancialReviewSectionProps): JSX.Element {
  const {
    wizardStep,
    setWizardStep,
    setIntakeManualBack,
    setIntakeActiveQuestion,
    setRouteManualBack,
    setRouteActiveQuestion,
    setCargoManualBack,
    setCargoActiveQuestion,
    reviewActiveQuestion,
    clientName,
    routeLocationSummary,
    pickupLine,
    deliveryLine,
    cargoTotals,
    transportType,
    suggestedTransportType,
    showPmt,
    pmtLabel,
    pricingLabel,
    pricingPayload,
    missingPickupAddress,
    missingDeliveryAddress,
    missingPickupTimeWindow,
    missingQuantity,
    missingWeight,
    cargoHasDimensions,
    referentie,
    setReferentie,
    uberFlowShellClass,
    conversationalCardClass,
    flowLabelClass,
    renderUberStepHeader,
    renderCollapsedAnswer,
    renderQuestionPrompt,
    renderWizardFooter,
    financialTabSlot,
  } = props;

  return (
    <>
      {wizardStep === "financial" && (
        <section className={uberFlowShellClass}>
          {renderUberStepHeader("04 · Financieel", "Controleer het tarief", "Dezelfde tariefmotor als productie, direct na transport.")}

          <div className="mb-5 space-y-3">
            {renderCollapsedAnswer("Klant", clientName || "Nog geen klant", () => {
              setWizardStep("intake");
              setIntakeManualBack(true);
              setIntakeActiveQuestion(1);
            })}
            {renderCollapsedAnswer("Route", routeLocationSummary || `${pickupLine?.locatie || "Ophaaladres"} -> ${deliveryLine?.locatie || "Afleveradres"}`, () => {
              setWizardStep("route");
              setRouteManualBack(true);
              setRouteActiveQuestion(missingPickupAddress ? 1 : missingDeliveryAddress ? 2 : missingPickupTimeWindow ? 3 : 4);
            })}
            {renderCollapsedAnswer("Transport", `${cargoTotals.totAantal || 0} ${cargoTotals.primaryUnit || "eenheden"} · ${cargoTotals.totGewicht || 0} kg · ${transportType || suggestedTransportType || "transport volgt"}`, () => {
              setWizardStep("cargo");
              setCargoManualBack(true);
              setCargoActiveQuestion(3);
            })}
            {showPmt && renderCollapsedAnswer("Security", pmtLabel, () => {
              setWizardStep("cargo");
              setCargoManualBack(true);
              setCargoActiveQuestion(3);
            })}
          </div>

          <div className={cn(conversationalCardClass(0), "mb-4 overflow-hidden")}>
            {renderQuestionPrompt(
              {
                step: "Tarief",
                title: "Klopt het financiele voorstel?",
                hint: "Controleer tarief, toeslagen en eventuele afwijking voordat je naar de eindcontrole gaat.",
              },
              pricingPayload.cents != null,
              true,
            )}
            <div className="-mx-6 -mb-6 md:-mx-9 md:-mb-9">
              {financialTabSlot}
            </div>
          </div>

          {renderWizardFooter()}
        </section>
      )}

      {wizardStep === "review" && (
        <section className={uberFlowShellClass}>
          {renderUberStepHeader("05 · Controle", "Klaar om te plannen?", "Laatste check op opdrachtgever, route, lading en plannerregels.")}

          <div className="mb-5 space-y-3">
            {renderCollapsedAnswer("Klant", clientName || "Nog geen klant", () => {
              setWizardStep("intake");
              setIntakeManualBack(true);
              setIntakeActiveQuestion(1);
            })}
            {renderCollapsedAnswer("Route", routeLocationSummary || `${pickupLine?.locatie || "Ophaaladres"} -> ${deliveryLine?.locatie || "Afleveradres"}`, () => {
              setWizardStep("route");
              setRouteManualBack(true);
              setRouteActiveQuestion(missingPickupAddress ? 1 : missingDeliveryAddress ? 2 : missingPickupTimeWindow ? 3 : 4);
            })}
            {renderCollapsedAnswer("Lading", `${cargoTotals.totAantal || 0} ${cargoTotals.primaryUnit || "eenheden"} · ${cargoTotals.totGewicht || 0} kg`, () => {
              setWizardStep("cargo");
              setCargoManualBack(true);
              setCargoActiveQuestion(missingQuantity ? 1 : !cargoHasDimensions ? 2 : missingWeight ? 3 : 4);
            })}
            {showPmt && renderCollapsedAnswer("Security", pmtLabel, () => {
              setWizardStep("cargo");
              setCargoManualBack(true);
              setCargoActiveQuestion(3);
            })}
            {renderCollapsedAnswer("Financieel", pricingLabel, () => setWizardStep("financial"))}
          </div>


          {(reviewActiveQuestion === 1 || reviewActiveQuestion === 2) && (
            <div className={cn(conversationalCardClass(0), "mb-4")}>
              {renderQuestionPrompt(
                {
                  step: "Planner",
                  title: "Moet de planner nog iets weten?",
                  hint: "Optioneel. Laat leeg als de rit direct ingepland kan worden.",
                },
                Boolean(referentie.trim()),
                true,
              )}
              <label className={flowLabelClass}>Opmerking voor planner</label>
              <Textarea
                value={referentie}
                onChange={e => setReferentie(e.target.value)}
                rows={3}
                placeholder="Bijzonderheden, instructies..."
                className="min-h-28 resize-none rounded-2xl border-border/70 bg-white px-4 py-3 text-base shadow-[inset_0_1px_0_hsl(var(--foreground)_/_0.04)] transition focus-visible:border-[hsl(var(--gold)_/_0.45)] focus-visible:ring-4 focus-visible:ring-[hsl(var(--gold)_/_0.14)]"
              />
            </div>
          )}


          {renderWizardFooter()}
        </section>
      )}
    </>
  );
}
