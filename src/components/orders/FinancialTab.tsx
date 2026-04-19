import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useVehicleTypes } from "@/hooks/useVehicleTypes";
import { useOrderPrice, type OrderPriceInput } from "@/hooks/useOrderPrice";
import type { PriceBreakdown, VehicleType } from "@/types/rateModels";

export interface FinancialTabCargo {
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
  onPricingChange: (payload: FinancialTabPayload) => void;
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

export function FinancialTab({
  tenantId,
  clientId,
  cargo,
  pickupDate,
  pickupTime,
  transportType,
  onPricingChange,
}: FinancialTabProps) {
  const { data: vehicleTypes = [], isLoading: vtLoading } = useVehicleTypes();

  // Form state
  const [pricingMode, setPricingMode] = useState<"standard" | "override">("standard");
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

  // Input voor de preview-engine. Enkel tijdens "standard" modus.
  const priceInput: OrderPriceInput | null = useMemo(() => {
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
      stop_count: 2 + extraStops,
      duration_hours: waitingHours,
      waiting_time_min: waitingHours * 60,
      diesel_included: dieselIncluded,
      include_optional_purposes: screeningIncluded ? ["screening"] : [],
    };
  }, [
    pricingMode, tenantId, vehicleTypeId, kmRounded, pickupDate, pickupTime,
    transportType, clientId, extraStops, waitingHours, dieselIncluded, screeningIncluded,
  ]);

  const priceQuery = useOrderPrice(priceInput);

  const tollNum = parseFloat(tollAmount.replace(",", ".")) || 0;
  const breakdown: PriceBreakdown | null = priceQuery.data && "breakdown" in priceQuery.data ? priceQuery.data.breakdown : null;
  const skipped = priceQuery.data && "skipped" in priceQuery.data ? priceQuery.data : null;

  const engineTotal = breakdown ? breakdown.totaal + tollNum : 0;

  // Payload sturen naar parent zodra er iets meetbaars verandert.
  useEffect(() => {
    if (pricingMode === "override") {
      const amt = parseFloat(overrideAmount.replace(",", ".")) || 0;
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
      onPricingChange({ cents: null, details: null });
      return;
    }
    onPricingChange({
      cents: Math.round(engineTotal * 100),
      details: {
        mode: "engine",
        engine_version: "v2-2026-04",
        rate_card_id: priceQuery.data && "rate_card_id" in priceQuery.data ? priceQuery.data.rate_card_id : null,
        vehicle_type_id: vehicleTypeId,
        diesel_included: dieselIncluded,
        screening_included: screeningIncluded,
        km_distance: parseFloat(kmAfstand) || 0,
        km_rounded: kmRounded,
        line_items: breakdown.regels,
        surcharges: breakdown.toeslagen,
        toll_amount: tollNum,
        subtotal_engine: breakdown.totaal,
        total: engineTotal,
      },
    });
  }, [
    pricingMode, overrideAmount, overrideReason,
    breakdown, engineTotal, priceQuery.data,
    vehicleTypeId, dieselIncluded, screeningIncluded,
    kmAfstand, kmRounded, tollNum, onPricingChange,
  ]);

  const selectedVehicle = vehicleTypes.find((vt) => vt.id === vehicleTypeId) ?? null;

  if (vtLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
        <Loader2 className="h-4 w-4 animate-spin" />
        Voertuigtypen laden...
      </div>
    );
  }

  if (vehicleTypes.length === 0) {
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

  if (skipped) {
    return (
      <div className="p-6 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-sm">
        <div className="flex gap-3">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold mb-1">Tariefmotor staat uit</div>
            <p>{skipped.reason}. Zet de tariefmotor aan via tenant-instellingen, of gebruik de modus "Afwijkend tarief".</p>
            <button
              type="button"
              onClick={() => setPricingMode("override")}
              className="mt-3 px-3 py-1.5 text-xs rounded-md border border-amber-400 hover:bg-amber-100"
            >
              Afwijkend tarief gebruiken
            </button>
          </div>
        </div>
      </div>
    );
  }

  const priceError = priceQuery.error instanceof Error ? priceQuery.error.message : null;

  return (
    <div className="max-w-[1320px] mx-auto px-6 pt-4 pb-8 space-y-5">
      {/* ══ Chapter I · Tariefstructuur ══ */}
      <section className="card--luxe p-6 relative">
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
                  {priceQuery.isFetching && <span>Berekenen...</span>}
                  {!priceQuery.isFetching && !breakdown && <span>Vul voertuig en km in</span>}
                  {!priceQuery.isFetching && breakdown && (
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
                € {engineTotal.toFixed(2).replace(".", ",")}
              </span>
            </div>

            {priceError && (
              <div className="mt-3 p-3 rounded-lg text-xs bg-red-50 border border-red-200 text-red-800">
                {priceError}
              </div>
            )}

            <button
              type="button"
              onClick={() => setPricingMode("override")}
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
              onClick={() => setPricingMode("standard")}
              className="mt-4 px-3.5 py-2 text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-2 rounded-md transition-colors"
              style={{ border: "1px dashed hsl(var(--border))" }}
            >
              ← Terug naar standaard km-berekening
            </button>
          </div>
        )}
      </section>

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

          {breakdown && breakdown.toeslagen.length > 0 && (
            <div className="mb-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-3">
                Automatisch toegepaste toeslagen
              </div>
              <div className="space-y-1.5">
                {breakdown.toeslagen.map((t, i) => (
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
      <section className="card--luxe p-6 relative">
        <span className="card-chapter">III</span>
        <div className="mb-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] mb-1" style={{ fontFamily: "var(--font-display)" }}>
            03 · Totaaloverzicht
          </div>
          <h3 className="section-title">Berekend totaal</h3>
          <p className="text-xs text-muted-foreground mt-1">Alle bedragen exclusief BTW tenzij anders aangegeven.</p>
        </div>

        <div className="max-w-[560px] ml-auto tabular-nums space-y-3">
          {pricingMode === "standard" && breakdown && (
            <>
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-muted-foreground">Basisbedrag</span>
                <span className="text-sm font-medium" style={{ fontFamily: "var(--font-display)" }}>
                  € {breakdown.basisbedrag.toFixed(2).replace(".", ",")}
                </span>
              </div>
              {breakdown.toeslagen.map((t, i) => (
                <div key={`${t.name}-${i}`} className="flex justify-between items-baseline">
                  <span className="text-xs text-muted-foreground">{t.name}</span>
                  <span className="text-sm font-medium" style={{ fontFamily: "var(--font-display)" }}>
                    € {t.amount.toFixed(2).replace(".", ",")}
                  </span>
                </div>
              ))}
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
      </section>
    </div>
  );
}
