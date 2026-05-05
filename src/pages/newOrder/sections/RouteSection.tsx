import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  AddressAutocomplete,
  EMPTY_ADDRESS,
  type AddressValue,
  type AddressResolvedSelection,
} from "@/components/clients/AddressAutocomplete";
import { LuxeDatePicker } from "@/components/LuxeDatePicker";
import { LuxeTimePicker } from "@/components/LuxeTimePicker";
import { cn } from "@/lib/utils";
import { composeAddressString } from "@/lib/validation/clientSchema";
import { buildAddressBookKey } from "@/lib/addressBook";
import {
  addressValueFromFreightLine,
  normalizeLookup,
  toAddressSuggestionOption,
} from "@/lib/newOrder/helpers";
import type { FreightLine, PlannerLocationOption } from "@/lib/newOrder/types";
import type { OrderRouteRuleIssue } from "@/lib/validation/orderRouteRules";

type WizardStep = "intake" | "route" | "cargo" | "financial" | "review";
type RouteActiveQuestion = 1 | 2 | 3 | 4;
type IntakeActiveQuestion = 1 | 2 | 3 | 4;
type RouteStopKind = "pickup" | "delivery";

export interface RouteStopModelLike {
  id: string;
  sequence: number;
  kind: RouteStopKind;
  line: FreightLine;
  title: string;
  shortTitle: string;
  fallback: string;
  missingAddress: boolean;
  missingDate: boolean;
  isFinal: boolean;
}

export interface LocationDisplayInfo {
  company: string;
  address: string;
}

export interface RouteSectionProps {
  // Wizard navigation
  setWizardStep: Dispatch<SetStateAction<WizardStep>>;
  setIntakeManualBack: Dispatch<SetStateAction<boolean>>;
  setIntakeActiveQuestion: Dispatch<SetStateAction<IntakeActiveQuestion>>;
  routeActiveQuestion: RouteActiveQuestion;
  setRouteActiveQuestion: Dispatch<SetStateAction<RouteActiveQuestion>>;
  setRouteManualBack: Dispatch<SetStateAction<boolean>>;

  // Client context
  clientAnswered: boolean;
  clientName: string;

  // Route data
  routeStops: RouteStopModelLike[];
  routeRuleIssues: OrderRouteRuleIssue[];
  pickupLine: FreightLine | undefined;
  deliveryLine: FreightLine | undefined;
  extraDeliveryLines: FreightLine[];
  deliveryStops: FreightLine[];
  primaryLadenId: string | undefined;
  primaryLossenId: string | undefined;
  isMultiLegRoute: boolean;
  pickupQuickOptions: PlannerLocationOption[];
  deliveryQuickOptions: PlannerLocationOption[];

  // Address state
  pickupAddr: AddressValue;
  deliveryAddr: AddressValue;
  setPickupLookup: Dispatch<SetStateAction<string>>;
  setDeliveryLookup: Dispatch<SetStateAction<string>>;
  setPickupAddressBookLabel: Dispatch<SetStateAction<{ label: string; key: string } | null>>;
  setDeliveryAddressBookLabel: Dispatch<SetStateAction<{ label: string; key: string } | null>>;

  // Errors and validation
  errors: Record<string, string>;
  setErrors: Dispatch<SetStateAction<Record<string, string>>>;
  clearError: (field: string) => void;
  missingPickupAddress: boolean;
  missingDeliveryAddress: boolean;
  missingPickupTimeWindow: boolean;
  missingDeliveryTimeWindow: boolean;
  pickupRouteIssue: OrderRouteRuleIssue | undefined;
  primaryDeliveryRouteIssue: OrderRouteRuleIssue | undefined;
  allowOutsideBusinessHours: boolean;
  setAllowOutsideBusinessHours: Dispatch<SetStateAction<boolean>>;

  // Handlers
  handlePickupAddrChange: (value: AddressValue) => void;
  handlePickupAddrBlur: () => void;
  handleDeliveryAddrChange: (value: AddressValue) => void;
  handleDeliveryAddrBlur: () => void;
  applyPlannerLocation: (kind: "pickup" | "delivery", option: PlannerLocationOption) => void;
  maybeLearnClientAlias: (selection: AddressResolvedSelection) => Promise<void> | void;
  addFreightLine: () => void;
  removeFreightLine: (id: string) => void;
  updateFreightLine: <K extends keyof FreightLine>(id: string, field: K, value: FreightLine[K]) => void;
  updateFreightLineAddress: (id: string, value: AddressValue, option?: PlannerLocationOption) => void;
  setFreightLines: Dispatch<SetStateAction<FreightLine[]>>;

  // Helpers
  locationDisplay: (
    line: FreightLine | undefined,
    fallbackLabel: string,
    fallbackAddress: string,
  ) => LocationDisplayInfo;
  getDeliveryStopLabel: (index: number, total?: number) => string;

  // Render helpers + class strings
  uberFlowShellClass: string;
  conversationalCardClass: (level?: number) => string;
  flowLabelClass: string;
  flowInputClass: string;
  requiredTextClass: (missing: boolean) => string;
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
  renderLocationOperationalDetails: (line: FreightLine | undefined, title: string) => ReactNode;
  renderWizardFooter: () => ReactNode;
}

export function RouteSection(props: RouteSectionProps): JSX.Element {
  const {
    setWizardStep,
    setIntakeManualBack,
    setIntakeActiveQuestion,
    routeActiveQuestion,
    setRouteActiveQuestion,
    setRouteManualBack,
    clientAnswered,
    clientName,
    routeStops,
    routeRuleIssues,
    pickupLine,
    deliveryLine,
    extraDeliveryLines,
    deliveryStops,
    primaryLadenId,
    primaryLossenId,
    isMultiLegRoute,
    pickupQuickOptions,
    deliveryQuickOptions,
    pickupAddr,
    deliveryAddr,
    setPickupLookup,
    setDeliveryLookup,
    setPickupAddressBookLabel,
    setDeliveryAddressBookLabel,
    errors,
    setErrors,
    clearError,
    missingPickupAddress,
    missingDeliveryAddress,
    missingPickupTimeWindow,
    missingDeliveryTimeWindow,
    pickupRouteIssue,
    primaryDeliveryRouteIssue,
    allowOutsideBusinessHours,
    setAllowOutsideBusinessHours,
    handlePickupAddrChange,
    handlePickupAddrBlur,
    handleDeliveryAddrChange,
    handleDeliveryAddrBlur,
    applyPlannerLocation,
    maybeLearnClientAlias,
    addFreightLine,
    removeFreightLine,
    updateFreightLine,
    updateFreightLineAddress,
    setFreightLines,
    locationDisplay,
    getDeliveryStopLabel,
    uberFlowShellClass,
    conversationalCardClass,
    flowLabelClass,
    flowInputClass,
    requiredTextClass,
    renderUberStepHeader,
    renderCollapsedAnswer,
    renderQuestionPrompt,
    renderLocationOperationalDetails,
    renderWizardFooter,
  } = props;

  return (
    <>
      <section className={uberFlowShellClass}>
        {renderUberStepHeader("02 · Route", "Bouw de rit op", "Single leg: ophalen en afleveren. Multi-leg: stops toevoegen tot de eindbestemming klopt.")}
        <div className="space-y-5">
          {clientAnswered && renderCollapsedAnswer(
            "Klant",
            clientName,
            () => {
              setWizardStep("intake");
              setIntakeManualBack(true);
              setIntakeActiveQuestion(1);
            },
          )}

          <div className="rounded-2xl border border-[hsl(var(--gold)_/_0.16)] bg-white/80 px-4 py-3 shadow-[0_14px_32px_rgba(15,23,42,0.045)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold tracking-[0.14em] text-[hsl(var(--gold-deep))]">Stops-first route</div>
                <div className="text-xs text-muted-foreground">Elke locatie is een stop in dezelfde rit.</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div className="rounded-full border border-[hsl(var(--gold)_/_0.18)] bg-[hsl(var(--gold-soft)_/_0.30)] px-2.5 py-1 text-[11px] font-semibold text-[hsl(var(--gold-deep))]">
                  {routeStops.filter(stop => !stop.missingAddress).length}/{routeStops.length} locaties
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (missingDeliveryAddress) {
                      setRouteManualBack(true);
                      setRouteActiveQuestion(2);
                      return;
                    }
                    addFreightLine();
                    setRouteManualBack(true);
                    setRouteActiveQuestion(4);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--gold))] px-3 py-1.5 text-[11px] font-semibold text-white shadow-[0_8px_20px_hsl(var(--gold)_/_0.25)] transition hover:bg-[hsl(var(--gold-deep))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)_/_0.35)]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Tussenstop toevoegen
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {routeStops.map((stop) => {
                const hasIssue = routeRuleIssues.some((issue) => issue.lineId === stop.line.id);
                const isCurrent =
                  (routeActiveQuestion === 1 && stop.kind === "pickup") ||
                  (routeActiveQuestion === 2 && stop.line.id === deliveryLine?.id) ||
                  (routeActiveQuestion === 4 && stop.kind !== "pickup");
                const canClearStop = stop.kind === "delivery";
                const display = locationDisplay(stop.line, stop.title, stop.fallback);

                return (
                  <div
                    key={stop.id}
                    className={cn(
                      "group inline-flex min-w-0 items-center gap-1 rounded-full border py-1.5 pl-2 pr-2 text-left text-xs transition",
                      isCurrent
                        ? "border-[hsl(var(--gold)_/_0.42)] bg-[hsl(var(--gold-soft)_/_0.42)] text-foreground shadow-sm"
                        : "border-border/70 bg-white text-muted-foreground hover:border-[hsl(var(--gold)_/_0.25)] hover:bg-[hsl(var(--gold-soft)_/_0.22)]",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (stop.kind === "pickup") {
                          setRouteManualBack(true);
                          setRouteActiveQuestion(1);
                          return;
                        }
                        if (stop.line.id === deliveryLine?.id) {
                          setRouteManualBack(true);
                          setRouteActiveQuestion(2);
                          return;
                        }
                        setRouteManualBack(true);
                        setRouteActiveQuestion(4);
                      }}
                      className="inline-flex min-w-0 items-center gap-2 rounded-full px-1.5 py-0.5 text-left focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)_/_0.35)]"
                    >
                      <span className={cn(
                        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                        stop.missingAddress || hasIssue ? "bg-red-50 text-red-600" : "bg-[hsl(var(--gold))] text-white",
                      )}>
                        {stop.shortTitle}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold">{stop.line.locatie ? `${stop.title} · ${display.company}` : stop.title}</span>
                        <span className={cn("block max-w-[15rem] truncate", stop.missingAddress ? "text-red-600" : "text-muted-foreground")}>
                          {display.address}
                        </span>
                      </span>
                    </button>
                    {canClearStop && (
                      <button
                        type="button"
                        aria-label="Eindbestemming wissen"
                        onClick={() => {
                          if (extraDeliveryLines.some(line => line.id === stop.line.id)) {
                            removeFreightLine(stop.line.id);
                          } else {
                            handleDeliveryAddrChange(EMPTY_ADDRESS);
                            setDeliveryLookup("");
                          }
                          setRouteManualBack(true);
                          setRouteActiveQuestion(2);
                        }}
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-80 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-200"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {routeActiveQuestion > 1 && renderCollapsedAnswer(
            "Ophalen",
            pickupLine?.locatie
              ? `${locationDisplay(pickupLine, "Ophalen", "Ophaaladres ingevuld").company}\n${[
                  locationDisplay(pickupLine, "Ophalen", "Ophaaladres ingevuld").address,
                  pickupLine.vehicleTypeLabel,
                ].filter(Boolean).join(" · ")}`
              : "",
            () => {
              setRouteManualBack(true);
              setRouteActiveQuestion(1);
            },
            "Ophaaladres ingevuld",
          )}

          {routeActiveQuestion === 1 && (
          <div className={conversationalCardClass(0)}>
            {renderQuestionPrompt(
              { step: "Ophaaladres", title: "Waar wordt de lading opgehaald?", hint: "Kies het adres en vul de bedrijfsnaam in. Bijzonderheden beheer je per adres in het adresboek." },
              !missingPickupAddress,
            )}
            <div className={cn(flowLabelClass, requiredTextClass(missingPickupAddress))}>
              Ophaaladres
            </div>
            <AddressAutocomplete
               value={pickupAddr}
               onChange={handlePickupAddrChange}
               onBlur={handlePickupAddrBlur}
               error={errors.pickup_address}
               searchLabel="Zoek ophaaladres"
               searchPlaceholder="Typ bedrijfsnaam, straat of dockadres"
               compactFlow
               onSearchInputChange={(value) => {
                 setPickupLookup(value);
                 clearError("pickup_address");
               }}
               quickOptions={pickupQuickOptions.map(toAddressSuggestionOption)}
               onQuickSelect={(option) => {
                 const selected = pickupQuickOptions.find(item => item.id === option.id);
                 if (selected) applyPlannerLocation("pickup", selected);
                 setPickupAddressBookLabel({ label: option.title, key: buildAddressBookKey(option.value) });
                 setRouteManualBack(false);
               }}
               onResolvedSelection={(selection) => {
                 void maybeLearnClientAlias(selection);
                 if (primaryLadenId) {
                   setFreightLines(prev => prev.map(line => line.id === primaryLadenId ? {
                     ...line,
                    companyName: line.companyName,
                   } : line));
                 }
                 setPickupAddressBookLabel({
                   label: selection.searchTerm || composeAddressString(selection.value, { includeLocality: true }),
                   key: buildAddressBookKey(selection.value),
                 });
                 setRouteManualBack(false);
              }}
              />
              {renderLocationOperationalDetails(pickupLine, "Ophaal-/laadadres")}
            </div>
          )}
            {routeActiveQuestion > 2 && renderCollapsedAnswer(
              getDeliveryStopLabel(0),
              deliveryLine?.locatie
                ? `${locationDisplay(deliveryLine, getDeliveryStopLabel(0), "Afleveradres ingevuld").company}\n${[
                    locationDisplay(deliveryLine, getDeliveryStopLabel(0), "Afleveradres ingevuld").address,
                    deliveryLine.vehicleTypeLabel,
                  ].filter(Boolean).join(" · ")}`
                : "",
              () => {
                setRouteManualBack(true);
                setRouteActiveQuestion(2);
              },
              "Afleveradres ingevuld",
            )}

            {routeActiveQuestion === 2 && (
            <div className={conversationalCardClass(0)}>
              {renderQuestionPrompt(
                { step: "Volgende stop", title: "Wat is de volgende stop of eindbestemming?", hint: "Bij een single leg is dit afleveren. Bij multi-leg is dit de eerste stop." },
                !missingDeliveryAddress,
              )}
              <div className={cn(flowLabelClass, requiredTextClass(missingDeliveryAddress))}>
                {isMultiLegRoute ? "Stop 1" : "Afleveradres"}
              </div>
              <AddressAutocomplete
                value={deliveryAddr}
                onChange={handleDeliveryAddrChange}
                onBlur={handleDeliveryAddrBlur}
                error={errors.delivery_address}
               searchLabel="Zoek stop of eindbestemming"
               searchPlaceholder="Typ warehouse, stad, straat of eindbestemming"
                compactFlow
                blockedAddresses={pickupLine?.locatie ? [pickupLine.locatie] : []}
                blockedMessage="Afleveradres mag niet hetzelfde zijn als het ophaaladres."
                onSearchInputChange={(value) => {
                  setDeliveryLookup(value);
                  clearError("delivery_address");
                }}
                quickOptions={deliveryQuickOptions.map(toAddressSuggestionOption)}
                onQuickSelect={(option) => {
                  const selected = deliveryQuickOptions.find(item => item.id === option.id);
                  if (selected) applyPlannerLocation("delivery", selected);
                  setDeliveryAddressBookLabel({ label: option.title, key: buildAddressBookKey(option.value) });
                  const nextAddress = normalizeLookup(selected?.addressString || option.title || option.value.street);
                  if (pickupLine?.locatie && nextAddress === normalizeLookup(pickupLine.locatie)) {
                    setErrors(prev => ({ ...prev, delivery_address: "Afleveradres mag niet hetzelfde zijn als ophaaladres." }));
                    toast.error("Adrescontrole", { description: "Kies een andere stop dan het ophaaladres." });
                    setRouteManualBack(true);
                    setRouteActiveQuestion(2);
                    return;
                  }
                  setRouteManualBack(false);
                }}
                onResolvedSelection={(selection) => {
                  void maybeLearnClientAlias(selection);
                  if (primaryLossenId) {
                    setFreightLines(prev => prev.map(line => line.id === primaryLossenId ? {
                      ...line,
                      companyName: line.companyName,
                    } : line));
                  }
                  setDeliveryAddressBookLabel({
                    label: selection.searchTerm || composeAddressString(selection.value, { includeLocality: true }),
                    key: buildAddressBookKey(selection.value),
                  });
                  const nextAddress = normalizeLookup(composeAddressString(selection.value, { includeLocality: true }) || selection.searchTerm);
                  if (pickupLine?.locatie && nextAddress === normalizeLookup(pickupLine.locatie)) {
                    setErrors(prev => ({ ...prev, delivery_address: "Afleveradres mag niet hetzelfde zijn als ophaaladres." }));
                    toast.error("Adrescontrole", { description: "Kies een andere stop dan het ophaaladres." });
                    setRouteManualBack(true);
                    setRouteActiveQuestion(2);
                    return;
                  }
                  setRouteManualBack(false);
                }}
              />
              {renderLocationOperationalDetails(deliveryLine, isMultiLegRoute ? "Stop 1 / afleveradres" : "Afleveradres")}
            </div>
            )}
        {routeActiveQuestion > 3 && renderCollapsedAnswer(
          "Laadmoment",
          [pickupLine?.datum, pickupLine?.tijd, pickupLine?.tijdTot].filter(Boolean).join(" · ") || "Laadmoment ingevuld",
          () => {
            setRouteManualBack(true);
            setRouteActiveQuestion(3);
          },
          "Ophaaltijd ingevuld",
        )}

        {routeActiveQuestion === 3 && (
        <div className={conversationalCardClass(0)}>
        {renderQuestionPrompt(
          { step: "Laadmoment", title: "Wanneer wordt de lading opgehaald?", hint: "Kies het laadmoment. Daarna verschijnt de vraag voor levering of overdracht." },
          !missingPickupTimeWindow,
        )}
        {pickupLine && (
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className={cn(flowLabelClass, requiredTextClass(missingPickupTimeWindow))}>Datum</label>
              <LuxeDatePicker
                value={pickupLine.datum}
                onChange={v => {
                  setRouteManualBack(false);
                  updateFreightLine(pickupLine.id, "datum", v);
                }}
              />
            </div>
            <div>
              <label className={flowLabelClass}>Tijd van</label>
              <LuxeTimePicker
                value={pickupLine.tijd}
                onChange={v => {
                  setRouteManualBack(false);
                  updateFreightLine(pickupLine.id, "tijd", v);
                }}
              />
            </div>
            <div>
              <label className={flowLabelClass}>Tijd tot</label>
              <LuxeTimePicker
                value={pickupLine.tijdTot}
                onChange={v => {
                  setRouteManualBack(false);
                  updateFreightLine(pickupLine.id, "tijdTot", v);
                }}
              />
            </div>
          </div>
        )}
        <label className="mt-3 inline-flex items-center gap-2 rounded-full border border-[hsl(var(--gold)_/_0.18)] bg-white px-3 py-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={allowOutsideBusinessHours}
            onChange={(e) => setAllowOutsideBusinessHours(e.target.checked)}
          />
          Tijd buiten 08:00 - 17:00 bewust toestaan
        </label>
        {(errors.pickup_time_window || pickupRouteIssue?.message) && (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {errors.pickup_time_window || pickupRouteIssue?.message}
          </p>
        )}
        </div>
        )}

        {routeActiveQuestion === 4 && (
        <div className={conversationalCardClass(0)}>
        {renderQuestionPrompt(
          { step: "Levermoment", title: "Wanneer moet de lading daar zijn?", hint: "Gebruik dit voor lossen, warehouse-overdracht of eindbestemming." },
          !missingDeliveryTimeWindow,
        )}
        {deliveryLine && (
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className={cn(flowLabelClass, requiredTextClass(missingDeliveryTimeWindow))}>Datum</label>
              <LuxeDatePicker
                value={deliveryLine.datum}
                onChange={v => {
                  setRouteManualBack(false);
                  updateFreightLine(deliveryLine.id, "datum", v);
                }}
              />
            </div>
            <div>
              <label className={flowLabelClass}>Tijd van</label>
              <LuxeTimePicker
                value={deliveryLine.tijd}
                onChange={v => {
                  setRouteManualBack(false);
                  updateFreightLine(deliveryLine.id, "tijd", v);
                }}
              />
            </div>
            <div>
              <label className={flowLabelClass}>Tijd tot</label>
              <LuxeTimePicker
                value={deliveryLine.tijdTot}
                onChange={v => {
                  setRouteManualBack(false);
                  updateFreightLine(deliveryLine.id, "tijdTot", v);
                }}
              />
            </div>
          </div>
        )}
        <label className="mt-3 inline-flex items-center gap-2 rounded-full border border-[hsl(var(--gold)_/_0.18)] bg-white px-3 py-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={allowOutsideBusinessHours}
            onChange={(e) => setAllowOutsideBusinessHours(e.target.checked)}
          />
          Tijd buiten 08:00 - 17:00 bewust toestaan
        </label>
        {(errors.delivery_time_window || errors.route_sequence || primaryDeliveryRouteIssue?.message) && (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {errors.delivery_time_window || errors.route_sequence || primaryDeliveryRouteIssue?.message}
          </p>
        )}
        <div className="mt-4 rounded-2xl border border-[hsl(var(--gold)_/_0.18)] bg-[hsl(var(--gold-soft)_/_0.18)] px-4 py-3 text-xs text-muted-foreground">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>Meerdere stops, bijvoorbeeld ophalen {"->"} warehouse {"->"} Dubai, blijven onderdeel van dezelfde rit. De laatste stop wordt straks als eindbestemming gebruikt.</span>
            <button
              type="button"
              onClick={addFreightLine}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-[hsl(var(--gold)_/_0.28)] bg-white px-3 py-1.5 text-xs font-semibold text-[hsl(var(--gold-deep))] transition hover:bg-[hsl(var(--gold-soft)_/_0.32)]"
            >
              <Plus className="h-3.5 w-3.5" />
              Stop toevoegen
            </button>
          </div>
        </div>
        {extraDeliveryLines.length > 0 && (
          <div className="mt-4 space-y-3">
            {extraDeliveryLines.map((line, index) => (
              <div key={line.id} className="rounded-2xl border border-[hsl(var(--gold)_/_0.16)] bg-white p-4 shadow-[0_16px_34px_rgba(15,23,42,0.07)]">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">{getDeliveryStopLabel(index + 1)}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {index + 1 === deliveryStops.length - 1 ? "Laatste stop van de rit" : "Warehouse, crossdock of tussenstop"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFreightLine(line.id)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-red-50 hover:text-red-600"
                    aria-label="Extra stop verwijderen"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid gap-4">
                  <div className="min-w-0">
                    <label className={flowLabelClass}>{getDeliveryStopLabel(index + 1)}</label>
                    <AddressAutocomplete
                      value={addressValueFromFreightLine(line)}
                      onChange={(value) => updateFreightLineAddress(line.id, value)}
                      searchLabel="Zoek stop of eindbestemming"
                      searchPlaceholder="Typ warehouse, stad, straat of eindbestemming"
                      compactFlow
                      blockedAddresses={[
                        pickupLine?.locatie,
                        ...deliveryStops
                          .filter((stop) => stop.id !== line.id)
                          .map((stop) => stop.locatie),
                      ].filter(Boolean) as string[]}
                      blockedMessage="Deze stop staat al in de rit."
                      onSearchInputChange={(value) => {
                        setDeliveryLookup(value);
                        clearError("delivery_address");
                      }}
                      quickOptions={deliveryQuickOptions.map(toAddressSuggestionOption)}
                      onQuickSelect={(option) => {
                        const selected = deliveryQuickOptions.find(item => item.id === option.id);
                        if (selected) updateFreightLineAddress(line.id, selected.value, selected);
                      }}
                      onResolvedSelection={(selection) => {
                        void maybeLearnClientAlias(selection);
                        updateFreightLineAddress(line.id, selection.value);
                      }}
                    />
                    {renderLocationOperationalDetails(line, getDeliveryStopLabel(index + 1))}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="min-w-0">
                      <label className={flowLabelClass}>Datum</label>
                      <LuxeDatePicker
                        value={line.datum}
                        onChange={v => updateFreightLine(line.id, "datum", v)}
                      />
                    </div>
                    <div className="min-w-0">
                      <label className={flowLabelClass}>Tijd van</label>
                      <LuxeTimePicker
                        value={line.tijd}
                        onChange={v => updateFreightLine(line.id, "tijd", v)}
                      />
                    </div>
                    <div className="min-w-0">
                      <label className={flowLabelClass}>Tijd tot</label>
                      <LuxeTimePicker
                        value={line.tijdTot}
                        onChange={v => updateFreightLine(line.id, "tijdTot", v)}
                      />
                    </div>
                  </div>
                </div>
                {routeRuleIssues.find((issue) => issue.lineId === line.id) && (
                  <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                    {routeRuleIssues.find((issue) => issue.lineId === line.id)?.message}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
        </div>
        )}
        </div>

        {renderWizardFooter()}
      </section>
    </>
  );
}
