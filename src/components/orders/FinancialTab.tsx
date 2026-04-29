import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useClientRates } from "@/hooks/useClients";
import { useVehicleTypes } from "@/hooks/useVehicleTypes";
import { useOrderPrice, type OrderPriceInput } from "@/hooks/useOrderPrice";
import type { PriceBreakdown, VehicleType } from "@/types/rateModels";

export interface FinancialTabCargo {
  totalQuantity?: number;
  unit?: string;
  totalWeightKg: number;
  maxLengthCm: number;
  maxWidthCm: number;
  maxHeightCm: number;
  requiresTailgate: boolean;
}

export interface FinancialTabPayload {
  cents: number | null;
  details: Record<string, unknown> | null;
}

interface FinancialTabProps {
  tenantId: string | null | undefined;
  clientId?: string | null;
  cargo?: FinancialTabCargo | null;
  pickupDate?: string;
  pickupTime?: string;
  transportType?: string | null;
  initialPricing?: FinancialTabPayload | null;
  onPricingChange: (payload: FinancialTabPayload) => void;
}

type PricingMode = "client_rates" | "standard" | "override";

interface ClientRateLine {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
  rateType: string;
}

// Pakt het kleinste actieve voertuigtype dat aan cargo-eisen voldoet.
// Null retourneert wanneer geen match (user moet handmatig kiezen).
function pickSmallestFit(
  vehicles: VehicleType[],
  cargo: FinancialTabCargo | null | undefined,
): VehicleType | null {
  if (!cargo) return vehicles[0] ?? null;
  const weight = cargo.totalWeightKg;
  const L = cargo.maxLengthCm;
  const W = cargo.maxWidthCm;
  const H = cargo.maxHeightCm;

  const candidates = vehicles.filter((vt) => {
    if (cargo.requiresTailgate && !vt.has_tailgate) return false;
    if (vt.max_weight_kg != null && weight > vt.max_weight_kg) return false;
    if (vt.max_length_cm != null && L > vt.max_length_cm) return false;
    if (vt.max_width_cm != null && W > vt.max_width_cm) return false;
    if (vt.max_height_cm != null && H > vt.max_height_cm) return false;
    return true;
  });

  return candidates[0] ?? vehicles[0] ?? null;
}

function parseMoney(value: string): number {
  return parseFloat(value.replace(",", ".")) || 0;
}

function formatEuro(value: number): string {
  return value.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function rateTypeLabel(type: string): string {
  switch (type) {
    case "base_rate":
    case "per_rit":
      return "Vast ritbedrag";
    case "per_km":
      return "Per kilometer";
    case "per_pallet":
      return "Per pallet";
    case "per_kg":
      return "Per kilo";
    case "toeslag":
    case "surcharge":
      return "Toeslag";
    default:
      return type.replace(/_/g, " ");
  }
}

export function FinancialTab({
  tenantId,
  clientId,
  cargo,
  pickupDate,
  pickupTime,
  transportType,
  initialPricing,
  onPricingChange,
}: FinancialTabProps) {
  const { data: vehicleTypes = [], isLoading: vtLoading } = useVehicleTypes();
  const { data: clientRates = [], isLoading: clientRatesLoading } = useClientRates(clientId ?? null);

  // Form state
  const [pricingMode, setPricingMode] = useState<PricingMode>("standard");
  const pricingModeTouchedRef = useRef(false);
  const [vehicleTypeId, setVehicleTypeId] = useState<string>("");
  const [vehicleManual, setVehicleManual] = useState(false);
  const [kmAfstand, setKmAfstand] = useState("");
  const [dieselIncluded, setDieselIncluded] = useState(true);
  const [screeningIncluded, setScreeningIncluded] = useState(false);
  const [waitingHours, setWaitingHours] = useState(0);
  const [extraStops, setExtraStops] = useState(0);
  const [tollAmount, setTollAmount] = useState("");
  const [overrideAmount, setOverrideAmount] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [jaimyExtraDescription, setJaimyExtraDescription] = useState("");
  const [jaimyExtraAmount, setJaimyExtraAmount] = useState("");
  const hydratedPricingKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!initialPricing?.cents || !initialPricing.details) return;
    const details = initialPricing.details as Record<string, any>;
    const hydrateKey = JSON.stringify({
      cents: initialPricing.cents,
      mode: details.mode,
      vehicle: details.vehicle_type_id,
      km: details.km_distance,
      waiting: details.manual_add_ons?.waiting_hours,
      stops: details.manual_add_ons?.extra_stops,
      toll: details.toll_amount,
      override: details.amount,
      manualLine: details.manual_line?.amount,
    });
    if (hydratedPricingKeyRef.current === hydrateKey) return;
    hydratedPricingKeyRef.current = hydrateKey;

    if (details.mode === "client_rates") {
      pricingModeTouchedRef.current = true;
      setPricingMode("client_rates");
      const manualLine = details.manual_line as { description?: string; amount?: number } | null | undefined;
      if (manualLine?.description) setJaimyExtraDescription(manualLine.description);
      if (typeof manualLine?.amount === "number" && manualLine.amount > 0) {
        setJaimyExtraAmount(String(manualLine.amount).replace(".", ","));
      }
      return;
    }

    if (details.mode === "override") {
      pricingModeTouchedRef.current = true;
      setPricingMode("override");
      if (typeof details.amount === "number" && details.amount > 0) {
        setOverrideAmount(String(details.amount).replace(".", ","));
      }
      if (typeof details.reason === "string") setOverrideReason(details.reason);
      return;
    }

    if (details.mode === "engine") {
      pricingModeTouchedRef.current = true;
      setPricingMode("standard");
      if (typeof details.vehicle_type_id === "string") {
        setVehicleTypeId(details.vehicle_type_id);
        setVehicleManual(true);
      }
      if (typeof details.diesel_included === "boolean") setDieselIncluded(details.diesel_included);
      if (typeof details.screening_included === "boolean") setScreeningIncluded(details.screening_included);
      if (typeof details.km_distance === "number" && details.km_distance > 0) {
        setKmAfstand(String(details.km_distance));
      }
      const addOns = details.manual_add_ons as { waiting_hours?: number; extra_stops?: number } | null | undefined;
      if (typeof addOns?.waiting_hours === "number") setWaitingHours(addOns.waiting_hours);
      if (typeof addOns?.extra_stops === "number") setExtraStops(addOns.extra_stops);
      if (typeof details.toll_amount === "number" && details.toll_amount > 0) {
        setTollAmount(String(details.toll_amount).replace(".", ","));
      }
    }
  }, [initialPricing]);

  const activeClientRates = useMemo(
    () => clientRates.filter((rate) => rate.is_active !== false),
    [clientRates],
  );

  const choosePricingMode = (mode: PricingMode) => {
    pricingModeTouchedRef.current = true;
    setPricingMode(mode);
  };

  useEffect(() => {
    pricingModeTouchedRef.current = false;
  }, [clientId]);

  useEffect(() => {
    if (pricingModeTouchedRef.current) return;
    if (activeClientRates.length > 0) {
      setPricingMode("client_rates");
    } else if (!clientRatesLoading && !vtLoading && vehicleTypes.length === 0) {
      setPricingMode("override");
    } else if (pricingMode === "client_rates" || pricingMode === "override") {
      setPricingMode("standard");
    }
  }, [activeClientRates.length, clientRatesLoading, pricingMode, vehicleTypes.length, vtLoading]);

  // Auto-select kleinste passend voertuig zodra vehicleTypes geladen / cargo verandert.
  useEffect(() => {
    if (vehicleManual) return;
    if (vehicleTypes.length === 0) return;
    const pick = pickSmallestFit(vehicleTypes, cargo ?? null);
    if (pick && pick.id !== vehicleTypeId) setVehicleTypeId(pick.id);
  }, [vehicleTypes, cargo, vehicleManual, vehicleTypeId]);

  // Kilometer-afronding omhoog naar 5, conform Royalty Cargo afspraak.
  const kmRounded = useMemo(() => {
    const km = parseFloat(kmAfstand) || 0;
    return km > 0 ? Math.ceil(km / 5) * 5 : 0;
  }, [kmAfstand]);

  // Input voor de preview-engine. De basiskaart blijft bewust zonder handmatige add-ons;
  // die worden alleen in het totaaloverzicht meegenomen.
  const basePriceInput: OrderPriceInput | null = useMemo(() => {
    if (pricingMode !== "standard") return null;
    if (!tenantId || !vehicleTypeId || kmRounded <= 0) return null;
    return {
      tenant_id: tenantId,
      vehicle_type_id: vehicleTypeId,
      distance_km: kmRounded,
      pickup_date: pickupDate,
      pickup_time_local: pickupTime,
      transport_type: transportType ?? null,
      client_id: clientId ?? null,
      stop_count: 2,
      duration_hours: 0,
      waiting_time_min: 0,
      diesel_included: dieselIncluded,
      include_optional_purposes: screeningIncluded ? ["screening"] : [],
    };
  }, [
    pricingMode, tenantId, vehicleTypeId, kmRounded, pickupDate, pickupTime,
    transportType, clientId, dieselIncluded, screeningIncluded,
  ]);

  const totalPriceInput: OrderPriceInput | null = useMemo(() => {
    if (!basePriceInput) return null;
    return {
      ...basePriceInput,
      stop_count: 2 + extraStops,
      duration_hours: waitingHours,
      waiting_time_min: waitingHours * 60,
    };
  }, [basePriceInput, extraStops, waitingHours]);

  const basePriceQuery = useOrderPrice(basePriceInput);
  const totalPriceQuery = useOrderPrice(totalPriceInput);

  const tollNum = parseFloat(tollAmount.replace(",", ".")) || 0;
  const breakdown: PriceBreakdown | null = basePriceQuery.data && "breakdown" in basePriceQuery.data ? basePriceQuery.data.breakdown : null;
  const totalBreakdown: PriceBreakdown | null = totalPriceQuery.data && "breakdown" in totalPriceQuery.data ? totalPriceQuery.data.breakdown : null;
  const skipped = basePriceQuery.data && "skipped" in basePriceQuery.data ? basePriceQuery.data : null;

  const baseSurchargeTotal = breakdown?.toeslagen.reduce((sum, item) => sum + item.amount, 0) ?? 0;
  const totalSurchargeTotal = totalBreakdown?.toeslagen.reduce((sum, item) => sum + item.amount, 0) ?? baseSurchargeTotal;
  const manualAddOnBaseTotal = breakdown && totalBreakdown
    ? Math.max(0, totalBreakdown.basisbedrag - breakdown.basisbedrag)
    : 0;
  const engineTotal = breakdown ? breakdown.basisbedrag + totalSurchargeTotal + manualAddOnBaseTotal + tollNum : 0;
  const engineBaseTotal = breakdown ? breakdown.basisbedrag : 0;
  const clientRateLines = useMemo<ClientRateLine[]>(() => {
    const quantity = cargo?.totalQuantity ?? 0;
    const weight = cargo?.totalWeightKg ?? 0;
    const km = kmRounded || parseMoney(kmAfstand);

    return activeClientRates
      .map((rate) => {
        let lineQuantity = 1;
        let unit = "stuk";
        let include = true;

        switch (rate.rate_type) {
          case "base_rate":
          case "per_rit":
            lineQuantity = 1;
            unit = "rit";
            break;
          case "per_km":
            lineQuantity = km;
            unit = "km";
            include = km > 0;
            break;
          case "per_pallet":
            lineQuantity = quantity;
            unit = "pallet";
            include = quantity > 0;
            break;
          case "per_kg":
            lineQuantity = weight;
            unit = "kg";
            include = weight > 0;
            break;
          case "toeslag":
          case "surcharge":
            lineQuantity = 1;
            unit = "stuk";
            break;
          default:
            lineQuantity = 1;
            unit = "stuk";
            break;
        }

        const unitPrice = Number(rate.amount) || 0;
        return include ? {
          id: rate.id,
          description: rate.description || rateTypeLabel(rate.rate_type),
          quantity: lineQuantity,
          unit,
          unitPrice,
          total: Math.round(lineQuantity * unitPrice * 100) / 100,
          rateType: rate.rate_type,
        } : null;
      })
      .filter(Boolean) as ClientRateLine[];
  }, [activeClientRates, cargo?.totalQuantity, cargo?.totalWeightKg, kmAfstand, kmRounded]);

  const jaimyExtraNum = parseMoney(jaimyExtraAmount);
  const clientRatesSubtotal = clientRateLines.reduce((sum, line) => sum + line.total, 0);
  const clientRatesTotal = clientRatesSubtotal + (jaimyExtraNum > 0 ? jaimyExtraNum : 0);

  // Payload sturen naar parent zodra er iets meetbaars verandert.
  useEffect(() => {
    if (pricingMode === "client_rates") {
      if (clientRatesTotal > 0) {
        onPricingChange({
          cents: Math.round(clientRatesTotal * 100),
          details: {
            mode: "client_rates",
            source: "jaimy",
            lines: clientRateLines,
            manual_line: jaimyExtraNum > 0 ? {
              description: jaimyExtraDescription || "Handmatige tariefregel",
              amount: jaimyExtraNum,
            } : null,
            total: clientRatesTotal,
          },
        });
      } else {
        if (clientRatesLoading) return;
        onPricingChange({ cents: null, details: null });
      }
      return;
    }
    if (pricingMode === "override") {
      const amt = parseMoney(overrideAmount);
      if (amt > 0) {
        onPricingChange({
          cents: Math.round(amt * 100),
          details: {
            mode: "override",
            amount: amt,
            reason: overrideReason,
          },
        });
      } else {
        onPricingChange({ cents: null, details: null });
      }
      return;
    }
    if (!breakdown) {
      if (basePriceQuery.isFetching || totalPriceQuery.isFetching || basePriceQuery.isLoading || totalPriceQuery.isLoading) return;
      onPricingChange({ cents: null, details: null });
      return;
    }
    onPricingChange({
      cents: Math.round(engineTotal * 100),
      details: {
        mode: "engine",
        engine_version: "v2-2026-04",
        rate_card_id: basePriceQuery.data && "rate_card_id" in basePriceQuery.data ? basePriceQuery.data.rate_card_id : null,
        vehicle_type_id: vehicleTypeId,
        diesel_included: dieselIncluded,
        screening_included: screeningIncluded,
        km_distance: parseFloat(kmAfstand) || 0,
        km_rounded: kmRounded,
        line_items: breakdown.regels,
        surcharges: totalBreakdown?.toeslagen ?? breakdown.toeslagen,
        manual_add_ons: {
          waiting_hours: waitingHours,
          extra_stops: extraStops,
          base_amount: manualAddOnBaseTotal,
        },
        toll_amount: tollNum,
        subtotal_engine: breakdown.basisbedrag + totalSurchargeTotal + manualAddOnBaseTotal,
        total: engineTotal,
      },
    });
  }, [
    pricingMode, overrideAmount, overrideReason,
    clientRateLines, clientRatesTotal, jaimyExtraDescription, jaimyExtraNum,
    breakdown, totalBreakdown, engineTotal, basePriceQuery.data, manualAddOnBaseTotal, totalSurchargeTotal,
    basePriceQuery.isFetching, totalPriceQuery.isFetching, basePriceQuery.isLoading, totalPriceQuery.isLoading,
    waitingHours, extraStops,
    vehicleTypeId, dieselIncluded, screeningIncluded,
    kmAfstand, kmRounded, tollNum, clientRatesLoading, onPricingChange,
  ]);

  const selectedVehicle = vehicleTypes.find((vt) => vt.id === vehicleTypeId) ?? null;

  if (false && vtLoading && pricingMode !== "client_rates") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
        <Loader2 className="h-4 w-4 animate-spin" />
        Voertuigtypen laden...
      </div>
    );
  }

  if (false && vehicleTypes.length === 0 && pricingMode !== "client_rates") {
    return (
      <div className="p-6 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-sm">
        <div className="flex gap-3">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold mb-1">Geen voertuigtypen geconfigureerd</div>
            <p>Ga naar Stamgegevens, Voertuigtypen en voeg minstens één actief voertuigtype toe voordat je orders kunt prijzen.</p>
          </div>
        </div>
      </div>
    );
  }

  if (false && skipped) {
    return (
      <div className="p-6 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-sm">
        <div className="flex gap-3">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold mb-1">Tariefmotor staat uit</div>
            <p>{skipped.reason}. Zet de tariefmotor aan via tenant-instellingen, of gebruik de modus "Afwijkend tarief".</p>
            <button
              type="button"
              onClick={() => choosePricingMode("override")}
              className="mt-3 px-3 py-1.5 text-xs rounded-md border border-amber-400 hover:bg-amber-100"
            >
              Afwijkend tarief gebruiken
            </button>
          </div>
        </div>
      </div>
    );
  }

  const priceError =
    basePriceQuery.error instanceof Error
      ? basePriceQuery.error.message
      : totalPriceQuery.error instanceof Error
        ? totalPriceQuery.error.message
        : null;

  return (
    <div className="max-w-[1320px] mx-auto px-6 pt-4 pb-8 space-y-5">
      <div className="rounded-2xl border border-[hsl(var(--gold)_/_0.18)] bg-white p-2 shadow-[0_16px_40px_-34px_hsl(var(--gold-deep)_/_0.65)]">
        <div className="grid gap-2 md:grid-cols-3">
          {[
            { key: "client_rates" as const, title: "Klanttarief", subtitle: "Jaimy structuur" },
            { key: "standard" as const, title: "Tariefmotor", subtitle: "Matrix en voertuigtype" },
            { key: "override" as const, title: "Handmatig", subtitle: "Vrij bedrag" },
          ].map((mode) => (
            <button
              key={mode.key}
              type="button"
              onClick={() => choosePricingMode(mode.key)}
              disabled={mode.key === "client_rates" && !clientId}
              className={cn(
                "rounded-xl px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-45",
                pricingMode === mode.key
                  ? "bg-[hsl(var(--gold-soft)_/_0.55)] text-[hsl(var(--gold-deep))] shadow-[inset_0_0_0_1px_hsl(var(--gold)_/_0.30)]"
                  : "hover:bg-[hsl(var(--gold-soft)_/_0.25)]",
              )}
            >
              <span className="block text-sm font-semibold">{mode.title}</span>
              <span className="block text-xs text-muted-foreground">{mode.subtitle}</span>
            </button>
          ))}
        </div>
      </div>

      {pricingMode === "client_rates" && (
        <section className="card--luxe p-6 relative">
          <span className="card-chapter">I</span>
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] mb-1" style={{ fontFamily: "var(--font-display)" }}>
                01 · Klanttarief
              </div>
              <h3 className="section-title">Tarief invoeren volgens Jaimy</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Gebruikt de bestaande klanttarieven: ritbedrag, km, pallet/kg en toeslagen. Pas alleen de vrije regel aan als er maatwerk is.
              </p>
            </div>
            <div className="rounded-full border border-[hsl(var(--gold)_/_0.24)] bg-[hsl(var(--gold-soft)_/_0.32)] px-3 py-1 text-xs font-semibold text-[hsl(var(--gold-deep))]">
              {activeClientRates.length} regels
            </div>
          </div>

          {clientRatesLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Klanttarieven laden...
            </div>
          )}

          {!clientRatesLoading && activeClientRates.length === 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Geen klanttarieven gevonden. Vul hieronder een handmatig tarief in of beheer de klanttarieven op de klantenkaart.
            </div>
          )}

          {activeClientRates.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-[hsl(var(--gold)_/_0.18)] bg-white">
              <div className="grid grid-cols-[1fr_90px_110px_120px] gap-3 border-b border-[hsl(var(--gold)_/_0.14)] bg-[hsl(var(--gold-soft)_/_0.24)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                <span>Regel</span>
                <span className="text-right">Aantal</span>
                <span className="text-right">Tarief</span>
                <span className="text-right">Totaal</span>
              </div>
              {clientRateLines.length > 0 ? clientRateLines.map((line) => (
                <div key={line.id} className="grid grid-cols-[1fr_90px_110px_120px] gap-3 border-b border-[hsl(var(--gold)_/_0.10)] px-4 py-3 text-sm last:border-b-0">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-foreground">{line.description}</div>
                    <div className="text-xs text-muted-foreground">{rateTypeLabel(line.rateType)}</div>
                  </div>
                  <div className="text-right tabular-nums">{line.quantity.toLocaleString("nl-NL")} {line.unit}</div>
                  <div className="text-right tabular-nums">€ {formatEuro(line.unitPrice)}</div>
                  <div className="text-right font-semibold tabular-nums">€ {formatEuro(line.total)}</div>
                </div>
              )) : (
                <div className="px-4 py-5 text-sm text-muted-foreground">
                  Vul afstand, aantal of gewicht in om de variabele klanttarieven te berekenen.
                </div>
              )}
            </div>
          )}

          <div className="mt-5 grid gap-4 md:grid-cols-[1fr_180px]">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Extra regel / reden</label>
              <Input
                value={jaimyExtraDescription}
                onChange={(e) => setJaimyExtraDescription(e.target.value)}
                placeholder="Bijv. Schiphol-toeslag, wachtkosten, maatwerk"
                className="h-11 rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Bedrag</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">€</span>
                <Input
                  type="number"
                  step="0.01"
                  value={jaimyExtraAmount}
                  onChange={(e) => setJaimyExtraAmount(e.target.value)}
                  placeholder="0,00"
                  className="h-11 rounded-xl pl-7 tabular-nums"
                />
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between rounded-2xl border border-[hsl(var(--gold)_/_0.24)] bg-[hsl(var(--gold-soft)_/_0.26)] px-5 py-4">
            <div>
              <div className="text-sm font-semibold">Subtotaal excl. BTW</div>
              <div className="text-xs text-muted-foreground">Klanttarief plus eventuele vrije regel</div>
            </div>
            <div className="text-2xl font-semibold tabular-nums text-[hsl(var(--gold-deep))]" style={{ fontFamily: "var(--font-display)" }}>
              € {formatEuro(clientRatesTotal)}
            </div>
          </div>
        </section>
      )}
      {/* ══ Chapter I · Tariefstructuur ══ */}
      {pricingMode !== "client_rates" && <section className="card--luxe p-6 relative">
        <span className="card-chapter">I</span>
        <div className="mb-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] mb-1" style={{ fontFamily: "var(--font-display)" }}>
            01 · Tariefstructuur
          </div>
          <h3 className="section-title">Hoe wordt deze rit berekend</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Basistarieven komen uit de tariefkaart van deze tenant. Kilometers worden afgerond naar boven op 5.
          </p>
        </div>

        {pricingMode === "standard" && (
          <div>
            {vtLoading && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-[hsl(var(--gold)_/_0.18)] bg-[hsl(var(--gold-soft)_/_0.22)] p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Voertuigtypen laden...
              </div>
            )}

            {!vtLoading && vehicleTypes.length === 0 && (
              <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                <div className="flex gap-3">
                  <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold mb-1">Geen voertuigtypen geconfigureerd</div>
                    <p>Gebruik Handmatig of Klanttarief om nu toch een tarief vast te leggen. Voertuigtypen zijn alleen nodig voor de automatische tariefmotor.</p>
                  </div>
                </div>
              </div>
            )}

            {skipped && (
              <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                <div className="flex gap-3">
                  <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold mb-1">Tariefmotor staat uit</div>
                    <p>{skipped.reason}. Gebruik Handmatig of Klanttarief om nu toch een tarief vast te leggen.</p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-x-5 gap-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Voertuigtype <span className="text-red-600">*</span>
                </label>
                <Select
                  value={vehicleTypeId}
                  onValueChange={(v) => { setVehicleTypeId(v); setVehicleManual(true); }}
                >
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Kies voertuig" /></SelectTrigger>
                  <SelectContent>
                    {vehicleTypes.map((vt) => (
                      <SelectItem key={vt.id} value={vt.id}>{vt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!vehicleManual && selectedVehicle && (
                  <span className="text-[10px] text-[hsl(var(--gold-deep))] tracking-wider mt-0.5 block">
                    Automatisch geselecteerd op basis van lading
                  </span>
                )}
                {vehicleManual && (
                  <button
                    type="button"
                    onClick={() => setVehicleManual(false)}
                    className="text-[10px] text-muted-foreground hover:text-foreground underline mt-0.5 block"
                  >
                    Terug naar automatische selectie
                  </button>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Afstand (km) <span className="text-red-600">*</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    value={kmAfstand}
                    onChange={(e) => setKmAfstand(e.target.value)}
                    className="h-9 text-sm tabular-nums"
                    placeholder="0"
                  />
                  <span className="text-[11px] text-[hsl(var(--gold-deep))] font-semibold tracking-wider whitespace-nowrap">
                    → {kmRounded}
                  </span>
                </div>
                <span className="text-[10px] text-[hsl(var(--gold-deep))] tracking-wider mt-0.5 block">afronding op 5 omhoog</span>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Dieseltoeslag</label>
                <div className="inline-flex rounded-md border border-border overflow-hidden h-9">
                  <button
                    type="button"
                    onClick={() => setDieselIncluded(true)}
                    className={cn(
                      "px-3 text-xs font-medium transition-colors",
                      dieselIncluded ? "bg-[hsl(var(--gold-soft))] text-[hsl(var(--gold-deep))]" : "bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >Incl.</button>
                  <button
                    type="button"
                    onClick={() => setDieselIncluded(false)}
                    className={cn(
                      "px-3 text-xs font-medium transition-colors border-l border-border",
                      !dieselIncluded ? "bg-[hsl(var(--gold-soft))] text-[hsl(var(--gold-deep))]" : "bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >Excl.</button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Screening / docs</label>
                <div className="flex items-center gap-2.5 h-9">
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={screeningIncluded}
                      onChange={(e) => setScreeningIncluded(e.target.checked)}
                    />
                    <span></span>
                  </label>
                  <span className="text-xs text-muted-foreground">
                    {screeningIncluded ? "Actief" : "Niet opgenomen"}
                  </span>
                </div>
              </div>
            </div>

            {/* Live prijs */}
            <div
              className="mt-6 flex items-center gap-4 p-4 rounded-xl"
              style={{
                background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--gold-soft) / 0.35) 100%)",
                border: "1px solid hsl(var(--gold) / 0.25)",
                boxShadow: "inset 0 1px 0 hsl(0 0% 100%)",
              }}
            >
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--gold-deep))]">
                  Tarief {selectedVehicle?.name ?? "—"}
                </div>
                <div className="text-xs text-muted-foreground mt-1 tabular-nums">
                  {(basePriceQuery.isFetching || totalPriceQuery.isFetching) && <span>Berekenen...</span>}
                  {!basePriceQuery.isFetching && !totalPriceQuery.isFetching && !breakdown && <span>Vul voertuig en km in</span>}
                  {!basePriceQuery.isFetching && !totalPriceQuery.isFetching && breakdown && (
                    <>
                      <span className="text-foreground">{kmRounded} km</span>
                      {breakdown.regels.length > 0 && (
                        <span> · {breakdown.regels.length} tariefregel{breakdown.regels.length === 1 ? "" : "s"}</span>
                      )}
                    </>
                  )}
                </div>
              </div>
              <span
                className="text-2xl font-semibold tabular-nums text-[hsl(var(--gold-deep))]"
                style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}
              >
                € {engineBaseTotal.toFixed(2).replace(".", ",")}
              </span>
            </div>

            {priceError && (
              <div className="mt-3 p-3 rounded-lg text-xs bg-red-50 border border-red-200 text-red-800">
                {priceError}
              </div>
            )}

            <button
              type="button"
              onClick={() => choosePricingMode("override")}
              className="mt-4 px-3.5 py-2 text-xs text-muted-foreground hover:text-[hsl(var(--gold-deep))] inline-flex items-center gap-2 rounded-md transition-colors"
              style={{ border: "1px dashed hsl(var(--border))" }}
            >
              Afwijkend tarief gebruiken (Schiphol-regio, maatwerk, spoed)
            </button>
          </div>
        )}

        {pricingMode === "override" && (
          <div>
            <div
              className="callout--luxe mb-5"
              style={{
                background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(38 92% 95%) 100%)",
                borderColor: "hsl(38 70% 80%)",
              }}
            >
              <div className="flex-1">
                <div className="callout--luxe__title" style={{ color: "hsl(30 60% 28%)" }}>Afwijkend tarief actief</div>
                <div className="callout--luxe__body">Standaard km-berekening is overschreven. Vul handmatig in.</div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-5 gap-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Handmatig tarief <span className="text-red-600">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">€</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={overrideAmount}
                    onChange={(e) => setOverrideAmount(e.target.value)}
                    placeholder="0,00"
                    className="h-9 text-sm pl-7 tabular-nums font-medium"
                  />
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground block mb-1">Reden afwijking</label>
                <Input
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Bv. Schiphol-regio, spoedrit, maatwerk-afspraak"
                  className="h-9 text-sm"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => choosePricingMode(activeClientRates.length > 0 ? "client_rates" : "standard")}
              className="mt-4 px-3.5 py-2 text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-2 rounded-md transition-colors"
              style={{ border: "1px dashed hsl(var(--border))" }}
            >
              Terug naar {activeClientRates.length > 0 ? "klanttarief" : "standaard km-berekening"}
            </button>
          </div>
        )}
      </section>}

      {/* ══ Chapter II · Toeslagen en add-ons ══ */}
      {pricingMode === "standard" && (
        <section className="card--luxe p-6 relative">
          <span className="card-chapter">II</span>
          <div className="mb-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] mb-1" style={{ fontFamily: "var(--font-display)" }}>
              02 · Toeslagen en add-ons
            </div>
            <h3 className="section-title">Wachturen, extra stops, tol</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Tijdgebonden percentage-toeslagen worden automatisch toegepast als pickup-datum en tijd passen.
            </p>
          </div>

          {totalBreakdown && totalBreakdown.toeslagen.length > 0 && (
            <div className="mb-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-3">
                Automatisch toegepaste toeslagen
              </div>
              <div className="space-y-1.5">
                {totalBreakdown.toeslagen.map((t, i) => (
                  <div key={`${t.name}-${i}`} className="flex justify-between items-baseline text-xs">
                    <span className="text-muted-foreground">{t.name}</span>
                    <span className="tabular-nums font-medium" style={{ fontFamily: "var(--font-display)" }}>
                      € {t.amount.toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-3">Handmatige add-ons</div>
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/30 border-b border-border/60">
                    <th className="px-3 py-2 text-left font-semibold">Omschrijving</th>
                    <th className="px-3 py-2 text-center font-semibold w-[110px]">Aantal</th>
                    <th className="px-3 py-2 text-right font-semibold w-[130px]">Tarief</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/40">
                    <td className="px-3 py-2">Wachturen</td>
                    <td className="px-3 py-2 text-center">
                      <Input
                        type="number"
                        min={0}
                        value={waitingHours || ""}
                        onChange={(e) => setWaitingHours(parseInt(e.target.value) || 0)}
                        className="h-8 w-[72px] mx-auto text-center text-xs tabular-nums"
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground tabular-nums" style={{ fontFamily: "var(--font-display)" }}>
                      conform tariefkaart
                    </td>
                  </tr>
                  <tr className="border-b border-border/40">
                    <td className="px-3 py-2">Extra stops (boven 2)</td>
                    <td className="px-3 py-2 text-center">
                      <Input
                        type="number"
                        min={0}
                        value={extraStops || ""}
                        onChange={(e) => setExtraStops(parseInt(e.target.value) || 0)}
                        className="h-8 w-[72px] mx-auto text-center text-xs tabular-nums"
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground tabular-nums" style={{ fontFamily: "var(--font-display)" }}>
                      conform tariefkaart
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2">Tolheffing / andere kosten</td>
                    <td className="px-3 py-2 text-center text-muted-foreground">—</td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-1 justify-end">
                        <span className="text-muted-foreground">€</span>
                        <Input
                          type="number"
                          step="0.01"
                          value={tollAmount}
                          onChange={(e) => setTollAmount(e.target.value)}
                          placeholder="0,00"
                          className="h-8 w-[90px] text-right text-xs tabular-nums"
                        />
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Wacht- en stop-tarieven worden door de tariefmotor toegepast. Tol is ad-hoc per order.
            </p>
          </div>
        </section>
      )}

      {/* ══ Chapter III · Totaaloverzicht ══ */}
      {pricingMode !== "client_rates" && <section className="card--luxe p-6 relative">
        <span className="card-chapter">III</span>
        <div className="mb-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] mb-1" style={{ fontFamily: "var(--font-display)" }}>
            03 · Totaaloverzicht
          </div>
          <h3 className="section-title">Berekend totaal</h3>
          <p className="text-xs text-muted-foreground mt-1">Alle bedragen exclusief BTW tenzij anders aangegeven.</p>
        </div>

        <div className="max-w-[560px] ml-auto tabular-nums space-y-3">
          {pricingMode === "client_rates" && clientRateLines.length > 0 && (
            <>
              {clientRateLines.map((line) => (
                <div key={line.id} className="flex justify-between items-baseline">
                  <span className="text-xs text-muted-foreground">{line.description}</span>
                  <span className="text-sm font-medium" style={{ fontFamily: "var(--font-display)" }}>
                    € {formatEuro(line.total)}
                  </span>
                </div>
              ))}
              {jaimyExtraNum > 0 && (
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-muted-foreground">{jaimyExtraDescription || "Handmatige tariefregel"}</span>
                  <span className="text-sm font-medium" style={{ fontFamily: "var(--font-display)" }}>
                    € {formatEuro(jaimyExtraNum)}
                  </span>
                </div>
              )}
            </>
          )}
          {pricingMode === "standard" && breakdown && (
            <>
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-muted-foreground">Basisbedrag</span>
                <span className="text-sm font-medium" style={{ fontFamily: "var(--font-display)" }}>
                  € {breakdown.basisbedrag.toFixed(2).replace(".", ",")}
                </span>
              </div>
              {(totalBreakdown?.toeslagen ?? breakdown.toeslagen).map((t, i) => (
                <div key={`${t.name}-${i}`} className="flex justify-between items-baseline">
                  <span className="text-xs text-muted-foreground">{t.name}</span>
                  <span className="text-sm font-medium" style={{ fontFamily: "var(--font-display)" }}>
                    € {t.amount.toFixed(2).replace(".", ",")}
                  </span>
                </div>
              ))}
              {manualAddOnBaseTotal > 0 && (
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-muted-foreground">Wachturen / extra stops</span>
                  <span className="text-sm font-medium" style={{ fontFamily: "var(--font-display)" }}>
                    â‚¬ {manualAddOnBaseTotal.toFixed(2).replace(".", ",")}
                  </span>
                </div>
              )}
              {tollNum > 0 && (
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-muted-foreground">Tolheffing / andere</span>
                  <span className="text-sm font-medium" style={{ fontFamily: "var(--font-display)" }}>
                    € {tollNum.toFixed(2).replace(".", ",")}
                  </span>
                </div>
              )}
            </>
          )}

          <div className="pt-3 mt-3" style={{ borderTop: "1px solid hsl(var(--gold) / 0.3)" }}>
            <div className="flex justify-between items-baseline">
              <span className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>Subtotaal excl. BTW</span>
              <span
                className="text-2xl font-semibold text-[hsl(var(--gold-deep))]"
                style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}
              >
                € {pricingMode === "override"
                  ? (parseFloat(overrideAmount.replace(",", ".")) || 0).toFixed(2).replace(".", ",")
                  : engineTotal.toFixed(2).replace(".", ",")}
              </span>
            </div>
          </div>
        </div>
      </section>}
    </div>
  );
}
