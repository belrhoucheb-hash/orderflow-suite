import type { Dispatch, ReactNode, SetStateAction } from "react";
import { ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { CargoRow } from "@/lib/newOrder/types";

type WizardStep = "intake" | "route" | "cargo" | "financial" | "review";
type CargoActiveQuestion = 1 | 2 | 3 | 4;

export interface CargoTotals {
  totAantal: number;
  totGewicht: number;
  primaryUnit: string;
}

export interface CargoSectionProps {
  cargoRows: CargoRow[];
  cargoTotals: CargoTotals;
  cargoActiveQuestion: CargoActiveQuestion;
  setCargoActiveQuestion: Dispatch<SetStateAction<CargoActiveQuestion>>;
  cargoSameDimensions: boolean;
  setCargoSameDimensions: Dispatch<SetStateAction<boolean>>;
  setCargoManualBack: Dispatch<SetStateAction<boolean>>;
  cargoHasDimensions: boolean;
  updateCargoRow: <K extends keyof CargoRow>(id: string, field: K, value: CargoRow[K]) => void;
  clearError: (field: string) => void;
  missingQuantity: boolean;
  missingWeight: boolean;
  requiredFieldClass: (missing: boolean) => string;
  requiredTextClass: (missing: boolean) => string;
  setWizardStep: Dispatch<SetStateAction<WizardStep>>;
  transportEenheid: string;
  uberFlowShellClass: string;
  conversationalCardClass: (level?: number) => string;
  flowLabelClass: string;
  flowInputClass: string;
  renderUberStepHeader: (label: string, title: string, hint: string) => ReactNode;
  renderCollapsedFacts: (
    facts: Array<{ label: string; value: string; onEdit: () => void }>,
  ) => ReactNode;
  renderQuestionPrompt: (
    question: { step: string; title: string; hint: string },
    complete?: boolean,
    ready?: boolean,
  ) => ReactNode;
  renderWizardFooter: () => ReactNode;
}

export function CargoSection(props: CargoSectionProps): JSX.Element {
  const {
    cargoRows,
    cargoTotals,
    cargoActiveQuestion,
    setCargoActiveQuestion,
    cargoSameDimensions,
    setCargoSameDimensions,
    setCargoManualBack,
    cargoHasDimensions,
    updateCargoRow,
    clearError,
    missingQuantity,
    missingWeight,
    requiredFieldClass,
    requiredTextClass,
    setWizardStep,
    transportEenheid,
    uberFlowShellClass,
    conversationalCardClass,
    flowLabelClass,
    flowInputClass,
    renderUberStepHeader,
    renderCollapsedFacts,
    renderQuestionPrompt,
    renderWizardFooter,
  } = props;

  return (
    <>
      {/* ══ Chapter IV · Lading ══ */}
      <section className={uberFlowShellClass}>
        {renderUberStepHeader("03 · Transport", "Wat gaat er mee?", "Begin met aantal en gewicht. Details komen pas als de basis klopt.")}
        {cargoActiveQuestion > 1 && (
          <div className={cn("mb-8", cargoActiveQuestion >= 3 && "mb-10")}>
            {renderCollapsedFacts([
              {
                label: "Aantal",
                value: `${cargoTotals.totAantal || 0} ${cargoTotals.primaryUnit || transportEenheid || "eenheden"}`,
                onEdit: () => {
                  setCargoManualBack(true);
                  setCargoActiveQuestion(1);
                },
              },
              ...(cargoActiveQuestion > 2 ? [{
                label: "Afmetingen",
                value: cargoSameDimensions
                  ? `${cargoRows[0]?.lengte || "-"}x${cargoRows[0]?.breedte || "-"}x${cargoRows[0]?.hoogte || "-"} cm`
                  : `${cargoRows.filter(row => row.lengte && row.breedte && row.hoogte).length} regels`,
                onEdit: () => {
                  setCargoManualBack(true);
                  setCargoActiveQuestion(2);
                },
              }] : []),
              ...(cargoActiveQuestion > 3 ? [{
                label: "Gewicht",
                value: `${cargoTotals.totGewicht || 0} kg`,
                onEdit: () => {
                  setCargoManualBack(true);
                  setCargoActiveQuestion(3);
                },
              }] : []),
            ])}
          </div>
        )}

        {cargoActiveQuestion === 1 && cargoRows.slice(0, 1).map(row => (
          <div key={row.id} className={cn(
            conversationalCardClass(0),
            "mb-4",
            missingQuantity && "border-red-200 bg-red-50/40",
          )}>
            {renderQuestionPrompt(
              { step: "Aantal", title: "Hoeveel eenheden vervoer je?", hint: "Na een geldig aantal verschijnt automatisch de gewichtsvraag." },
              !missingQuantity,
            )}
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
            <div>
              <label className={cn(flowLabelClass, requiredTextClass(missingQuantity))}>Aantal eenheden</label>
              <Input
                type="number"
                value={row.aantal}
                onChange={e => { updateCargoRow(row.id, "aantal", e.target.value); clearError("quantity"); }}
                onKeyDown={e => {
                  if (e.key === "Enter" && Number(row.aantal) > 0) {
                    e.preventDefault();
                    setCargoManualBack(false);
                    setCargoActiveQuestion(2);
                  }
                }}
                placeholder="Bijv. 6"
                className={cn(flowInputClass, "tabular-nums", requiredFieldClass(missingQuantity))}
              />
            </div>
            <div>
              <label className={flowLabelClass}>Eenheid</label>
              <Select value={row.eenheid} onValueChange={v => { updateCargoRow(row.id, "eenheid", v); clearError("unit"); }}>
                <SelectTrigger className={flowInputClass}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pallets">Pallets</SelectItem>
                  <SelectItem value="Colli">Colli</SelectItem>
                  <SelectItem value="Box">Box</SelectItem>
                </SelectContent>
              </Select>
            </div>
            </div>
          </div>
        ))}

        {cargoActiveQuestion === 2 && (
          <div className={cn(conversationalCardClass(0), "mb-4")}>
            {renderQuestionPrompt(
              {
                step: "Afmetingen",
                title: "Wat zijn de afmetingen per eenheid?",
                hint: "Vul lengte, breedte en hoogte in. Als alle eenheden hetzelfde zijn, gebruik je de schakelaar hieronder.",
              },
              cargoHasDimensions,
            )}
            <label className="mb-4 flex w-fit items-center gap-3 rounded-2xl border border-[hsl(var(--gold)_/_0.18)] bg-white px-4 py-3 text-sm font-medium text-foreground shadow-[0_12px_30px_-28px_hsl(var(--gold-deep)_/_0.55)]">
              <input
                type="checkbox"
                checked={cargoSameDimensions}
                onChange={(e) => setCargoSameDimensions(e.target.checked)}
                className="h-4 w-4 rounded border-[hsl(var(--gold)_/_0.35)] text-[hsl(var(--gold-deep))]"
              />
              <span>Alle eenheden hebben dezelfde afmetingen</span>
            </label>
            <div className="space-y-3">
              {(cargoSameDimensions ? cargoRows.slice(0, 1) : cargoRows).map((row, index) => (
                <div key={row.id} className="rounded-2xl border border-[hsl(var(--gold)_/_0.14)] bg-white p-4">
                  <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--gold-deep))]">
                    {cargoSameDimensions ? "Afmetingen voor alle eenheden" : `Ladingregel ${index + 1}`}
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <label className={flowLabelClass}>Lengte cm</label>
                      <Input type="number" value={row.lengte} onChange={e => updateCargoRow(row.id, "lengte", e.target.value)} className={cn(flowInputClass, "tabular-nums")} />
                    </div>
                    <div>
                      <label className={flowLabelClass}>Breedte cm</label>
                      <Input type="number" value={row.breedte} onChange={e => updateCargoRow(row.id, "breedte", e.target.value)} className={cn(flowInputClass, "tabular-nums")} />
                    </div>
                    <div>
                      <label className={flowLabelClass}>Hoogte cm</label>
                      <Input
                        type="number"
                        value={row.hoogte}
                        onChange={e => updateCargoRow(row.id, "hoogte", e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter" && (row.lengte || row.breedte || row.hoogte)) {
                            e.preventDefault();
                            setCargoManualBack(false);
                            setCargoActiveQuestion(3);
                          }
                        }}
                        className={cn(flowInputClass, "tabular-nums")}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setCargoManualBack(false);
                  setCargoActiveQuestion(3);
                }}
                className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--gold-deep))] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_36px_-24px_hsl(var(--gold-deep)_/_0.85)] transition hover:bg-[hsl(var(--gold))] hover:text-[#17130b]"
              >
                Gewicht invullen
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {cargoActiveQuestion === 3 && cargoRows.slice(0, 1).map(row => (
          <div key={row.id} className={cn(
            conversationalCardClass(0),
            "mb-4",
            missingWeight ? "border-red-200 bg-red-50/40" : "border-border/60 bg-white",
          )}>
            {renderQuestionPrompt(
              { step: "Gewicht", title: "Wat is het totale gewicht?", hint: "Na een geldig gewicht ga je door naar financieel." },
              !missingWeight,
            )}
            <label className={cn(flowLabelClass, requiredTextClass(missingWeight))}>Gewicht totaal in kg</label>
            <Input
              type="number"
              value={row.gewicht}
              onChange={e => { updateCargoRow(row.id, "gewicht", e.target.value); clearError("weight_kg"); }}
              onKeyDown={e => {
                if (e.key === "Enter" && Number(row.gewicht) > 0) {
                  e.preventDefault();
                  setCargoManualBack(false);
                  setWizardStep("financial");
                }
              }}
              placeholder="Bijv. 850"
              className={cn(flowInputClass, "max-w-xs tabular-nums", requiredFieldClass(missingWeight))}
            />
          </div>
        ))}

        {renderWizardFooter()}
      </section>
    </>
  );
}
