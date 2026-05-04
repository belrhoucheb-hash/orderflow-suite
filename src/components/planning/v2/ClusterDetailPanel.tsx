import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Package,
  Scale,
  Timer,
  Truck,
  UserCircle,
  MapPin,
  AlertTriangle,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ConsolidationGroup } from "@/types/consolidation";
import { useAllDriverCountryRestrictions } from "@/hooks/useDriverCountryRestrictions";
import {
  formatDriverCountryRestrictionIssue,
  getDriverCountryRestrictionIssue,
} from "@/lib/driverCountryRestrictions";

interface ClusterDetailPanelProps {
  groupId: string | null;
  groupSummary?: (ConsolidationGroup & {
    consolidation_orders?: Array<{ id: string; order_id: string; stop_sequence: number | null; order: OrderRow }>;
  }) | null;
  driverSummary?: DriverInfo | null;
  vehicleSummary?: VehicleInfo | null;
  onClose: () => void;
}

interface VehicleInfo {
  id: string;
  name: string | null;
  plate: string | null;
  capacity_kg: number | null;
  capacity_pallets: number | null;
  vehicle_type_id: string | null;
  vehicle_types?: {
    name: string | null;
    max_weight_kg: number | null;
    max_volume_m3: number | null;
    max_pallets: number | null;
  } | null;
}

interface DriverInfo {
  id: string;
  name: string;
  contract_hours_per_week: number | null;
}

interface OrderRow {
  id: string;
  order_number: number;
  client_name: string | null;
  pickup_address: string | null;
  delivery_address: string | null;
  pickup_country: string | null;
  delivery_country: string | null;
  weight_kg: number | null;
  quantity: number | null;
  requirements: string[] | null;
}

export function ClusterDetailPanel({
  groupId,
  groupSummary,
  driverSummary,
  vehicleSummary,
  onClose,
}: ClusterDetailPanelProps) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [actionBusy, setActionBusy] = useState<"confirm" | "reject" | "override" | null>(null);
  const { data: countryRestrictions = [] } = useAllDriverCountryRestrictions();

  // Reset reden-veld bij cluster-wissel
  useEffect(() => setReason(""), [groupId]);

  const { data: groupDetail, isLoading, isError, error } = useQuery({
    queryKey: ["cluster_detail", groupId],
    enabled: !!groupId && !groupSummary,
    staleTime: 5_000,
    queryFn: async () => {
      const client = supabase as any;
      const { data, error } = await client
        .from("consolidation_groups")
        .select(
          "*, consolidation_orders(id, order_id, stop_sequence, order:orders(id, order_number, client_name, pickup_address, delivery_address, pickup_country, delivery_country, weight_kg, quantity, requirements))",
        )
        .eq("id", groupId!)
        .single();
      if (error) throw error;
      return data as ConsolidationGroup & { consolidation_orders: Array<{ id: string; order_id: string; stop_sequence: number | null; order: OrderRow }> };
    },
  });

  const group = groupSummary ?? groupDetail;

  const { data: vehicle } = useQuery({
    queryKey: ["cluster_vehicle", group?.vehicle_id],
    enabled: !!group?.vehicle_id && !vehicleSummary && !group?.vehicle,
    staleTime: 60_000,
    queryFn: async () => {
      const client = supabase as any;
      const { data, error } = await client
        .from("vehicles")
        .select("id, name, plate, capacity_kg, capacity_pallets, vehicle_type_id")
        .eq("id", group!.vehicle_id!)
        .maybeSingle();
      if (error) throw error;
      return data as VehicleInfo | null;
    },
  });

  const { data: driver } = useQuery({
    queryKey: ["cluster_driver", group?.driver_id],
    enabled: !!group?.driver_id && !driverSummary,
    staleTime: 60_000,
    queryFn: async () => {
      const client = supabase as any;
      const { data, error } = await client
        .from("drivers")
        .select("id, name, contract_hours_per_week")
        .eq("id", group!.driver_id!)
        .maybeSingle();
      if (error) throw error;
      return data as DriverInfo | null;
    },
  });

  const open = !!groupId;
  const orders = group?.consolidation_orders ?? [];
  const vehicleInfo = vehicleSummary ?? (group?.vehicle as VehicleInfo | undefined) ?? vehicle ?? null;
  const driverInfo = driverSummary ?? driver ?? null;
  const countryRestrictionIssue = group?.driver_id
    ? getDriverCountryRestrictionIssue(
        group.driver_id,
        orders.map((co) => co.order),
        countryRestrictions,
        group.planned_date,
      )
    : null;

  const weightCap = vehicleInfo?.vehicle_types?.max_weight_kg ?? vehicleInfo?.capacity_kg ?? 0;
  const palletCap = vehicleInfo?.vehicle_types?.max_pallets ?? vehicleInfo?.capacity_pallets ?? 0;
  const weightUsed = group?.total_weight_kg ?? 0;
  const palletsUsed = group?.total_pallets ?? 0;
  const weightPct = weightCap > 0 ? (weightUsed / weightCap) * 100 : 0;
  const palletPct = palletCap > 0 ? (palletsUsed / palletCap) * 100 : 0;
  const overloaded = weightPct > 100 || palletPct > 100;
  const overridden = !!group?.capacity_override_reason;

  async function handleConfirm() {
    if (!groupId) return;
    if (countryRestrictionIssue?.type === "block") {
      toast.error("Landrestrictie blokkeert deze rit", {
        description: formatDriverCountryRestrictionIssue(countryRestrictionIssue),
      });
      return;
    }
    if (countryRestrictionIssue?.type === "warning") {
      toast.warning("Landrestrictie waarschuwing", {
        description: formatDriverCountryRestrictionIssue(countryRestrictionIssue),
      });
    }
    setActionBusy("confirm");
    try {
      const { error } = await (supabase.rpc as any)("confirm_consolidation_group", { p_group_id: groupId });
      if (error) throw error;
      toast.success("Cluster bevestigd", { description: "Trip en stops zijn aangemaakt." });
      qc.invalidateQueries({ queryKey: ["planning_board"] });
      qc.invalidateQueries({ queryKey: ["consolidation_groups_by_date"] });
      qc.invalidateQueries({ queryKey: ["open_orders_by_date"] });
      qc.invalidateQueries({ queryKey: ["trip-orders"] });
      qc.invalidateQueries({ queryKey: ["cluster_detail"] });
      onClose();
    } catch (err) {
      toast.error("Bevestigen mislukt", { description: (err as Error).message });
    } finally {
      setActionBusy(null);
    }
  }

  async function handleReject() {
    if (!groupId) return;
    setActionBusy("reject");
    try {
      const { error } = await (supabase.rpc as any)("reject_consolidation_group", { p_group_id: groupId, p_reason: null });
      if (error) throw error;
      toast.info("Cluster verworpen", { description: "Orders staan weer open te plannen." });
      qc.invalidateQueries({ queryKey: ["planning_board"] });
      qc.invalidateQueries({ queryKey: ["consolidation_groups_by_date"] });
      qc.invalidateQueries({ queryKey: ["open_orders_by_date"] });
      onClose();
    } catch (err) {
      toast.error("Verwerpen mislukt", { description: (err as Error).message });
    } finally {
      setActionBusy(null);
    }
  }

  async function handleOverride() {
    if (!groupId) return;
    if (!reason.trim()) {
      toast.error("Reden verplicht", { description: "Voer een reden in waarom deze override nodig is." });
      return;
    }
    setActionBusy("override");
    try {
      const { error } = await (supabase.rpc as any)("record_capacity_override", {
        p_group_id: groupId,
        p_reason: reason.trim(),
      });
      if (error) throw error;
      toast.success("Override vastgelegd", { description: "Reden is opgeslagen in audit-trail." });
      setReason("");
      qc.invalidateQueries({ queryKey: ["cluster_detail"] });
      qc.invalidateQueries({ queryKey: ["planning_board"] });
      qc.invalidateQueries({ queryKey: ["consolidation_groups_by_date"] });
      qc.invalidateQueries({ queryKey: ["open_orders_by_date"] });
    } catch (err) {
      toast.error("Override mislukt", { description: (err as Error).message });
    } finally {
      setActionBusy(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="sm:max-w-[440px] overflow-y-auto p-0">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Laden...</div>
        ) : isError || !group ? (
          <div className="p-6 text-sm text-red-700">
            Cluster-details konden niet worden geladen
            {error instanceof Error && <div className="mt-1 text-xs text-muted-foreground">{error.message}</div>}
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <SheetHeader className="p-6 pb-4 border-b border-[hsl(var(--gold)/0.2)]">
              <div className="flex items-center gap-2 text-[0.6875rem] uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] font-semibold">
                <span className="w-4 h-px bg-[hsl(var(--gold))]" />
                Cluster-details
              </div>
              <SheetTitle className="text-xl font-[var(--font-display)]">{group.name}</SheetTitle>
              <SheetDescription>
                {format(new Date(group.planned_date + "T00:00:00"), "EEEE d MMMM yyyy", { locale: nl })}
              </SheetDescription>
            </SheetHeader>

            <div className="p-6 space-y-6 flex-1">
              {/* Voertuig + chauffeur */}
              <section className="space-y-3">
                <div className="section-label">Inzet</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-start gap-2">
                    <div className="h-9 w-9 rounded-xl bg-[hsl(var(--gold-soft)/0.6)] border border-[hsl(var(--gold)/0.3)] flex items-center justify-center shrink-0">
                      <Truck className="h-4 w-4 text-[hsl(var(--gold-deep))]" />
                    </div>
                    <div className="min-w-0 text-sm">
                      <div className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">Voertuig</div>
                      <div className="font-medium truncate">{vehicleInfo?.name ?? "-"}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {vehicleInfo?.plate ?? ""} {vehicleInfo?.vehicle_types?.name ? `, ${vehicleInfo.vehicle_types.name}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="h-9 w-9 rounded-xl bg-[hsl(var(--gold-soft)/0.6)] border border-[hsl(var(--gold)/0.3)] flex items-center justify-center shrink-0">
                      <UserCircle className="h-4 w-4 text-[hsl(var(--gold-deep))]" />
                    </div>
                    <div className="min-w-0 text-sm">
                      <div className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">Chauffeur</div>
                      <div className="font-medium truncate">{driverInfo?.name ?? "-"}</div>
                      {driverInfo?.contract_hours_per_week !== null && driverInfo?.contract_hours_per_week !== undefined && (
                        <div className="text-xs text-muted-foreground">
                          Contract: {driverInfo.contract_hours_per_week} u/week
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {countryRestrictionIssue && (
                <section
                  role="alert"
                  className={cn(
                    "rounded-lg border p-3 text-sm flex items-start gap-2",
                    countryRestrictionIssue.type === "block"
                      ? "border-red-200 bg-red-50 text-red-800"
                      : "border-amber-200 bg-amber-50 text-amber-800",
                  )}
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold">
                      {countryRestrictionIssue.type === "block" ? "Landblokkade" : "Landwaarschuwing"}
                    </div>
                    <div className="text-xs mt-0.5">
                      {formatDriverCountryRestrictionIssue(countryRestrictionIssue)}
                    </div>
                  </div>
                </section>
              )}

              {/* Beladingsgraad */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="section-label">Beladingsgraad</div>
                  {overloaded && !overridden && (
                    <span className="chiplet chiplet--attn">Boven capaciteit</span>
                  )}
                  {overridden && (
                    <span className="chiplet chiplet--warn">Override actief</span>
                  )}
                </div>

                <div className="space-y-3">
                  <CapacityBar
                    label="Gewicht"
                    used={weightUsed}
                    cap={weightCap}
                    unit="kg"
                    pct={weightPct}
                  />
                  <CapacityBar
                    label="Pallets"
                    used={palletsUsed}
                    cap={palletCap}
                    unit=""
                    pct={palletPct}
                  />
                </div>
              </section>

              {/* Bestaande override */}
              {overridden && (
                <section className="callout--luxe">
                  <Shield className="callout--luxe__icon h-5 w-5" />
                  <div className="min-w-0">
                    <div className="callout--luxe__title">Override vastgelegd</div>
                    <div className="callout--luxe__body">
                      "{group.capacity_override_reason}"
                    </div>
                    {group.capacity_override_at && (
                      <div className="text-[0.6875rem] text-muted-foreground mt-1">
                        {format(new Date(group.capacity_override_at), "d MMM yyyy HH:mm", { locale: nl })}
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Orders */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="section-label">Orders in dit cluster</div>
                  <span className="chiplet">{orders.length}</span>
                </div>
                <div className="space-y-1.5">
                  {orders
                    .sort((a, b) => (a.stop_sequence ?? 999) - (b.stop_sequence ?? 999))
                    .map((co, idx) => (
                      <div
                        key={co.id}
                        className="rounded-lg border border-[hsl(var(--gold)/0.15)] bg-[hsl(var(--gold-soft)/0.18)] p-3 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold truncate">
                              {idx + 1}. #{co.order.order_number} {co.order.client_name}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground truncate mt-0.5">
                              <MapPin className="h-3 w-3 shrink-0 text-[hsl(var(--gold-deep))]" />
                              {co.order.delivery_address || "Geen adres"}
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground shrink-0 text-right">
                            {co.order.weight_kg ?? 0} kg<br />
                            {co.order.quantity ?? 0} pal
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </section>

              {/* Override-flow */}
              {(overloaded || !overridden) && group.status !== "INGEPLAND" && group.status !== "VERWORPEN" && (
                <section className="space-y-2 pt-4 border-t border-[hsl(var(--gold)/0.2)]">
                  <div className="section-label flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-[hsl(var(--gold-deep))]" />
                    Forceer met reden (audit-trail)
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Alleen gebruiken als de planner bewust over capaciteit heen plant. Reden is verplicht
                    en wordt opgeslagen.
                  </p>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    placeholder="Waarom is deze overschrijding nodig?"
                    className="w-full text-sm rounded-lg border border-[hsl(var(--gold)/0.3)] bg-[hsl(var(--card))] px-3 py-2 focus:outline-none focus:border-[hsl(var(--gold-deep))] focus:ring-2 focus:ring-[hsl(var(--gold)/0.2)] resize-none"
                  />
                  <button
                    type="button"
                    onClick={handleOverride}
                    disabled={actionBusy !== null || !reason.trim()}
                    className="btn-luxe w-full !h-9"
                  >
                    <Shield className="h-4 w-4" />
                    {actionBusy === "override" ? "Opslaan..." : "Sla override op"}
                  </button>
                </section>
              )}
            </div>

            {/* Footer-actions */}
            {group.status === "VOORSTEL" && (
              <div className="p-6 border-t border-[hsl(var(--gold)/0.2)] bg-[hsl(var(--gold-soft)/0.15)] flex gap-2">
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={actionBusy !== null}
                  className="btn-luxe flex-1"
                >
                  {actionBusy === "reject" ? "Verwerpen..." : "Verwerp"}
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={actionBusy !== null || countryRestrictionIssue?.type === "block"}
                  className="btn-luxe btn-luxe--primary flex-1"
                >
                  {actionBusy === "confirm" ? "Bevestigen..." : "Bevestig"}
                </button>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function CapacityBar({ label, used, cap, unit, pct }: { label: string; used: number; cap: number; unit: string; pct: number }) {
  const overloaded = pct > 100;
  const near = pct > 80 && pct <= 100;
  const barClass = overloaded
    ? "bg-red-500"
    : near
    ? "bg-amber-500"
    : "bg-[hsl(var(--gold))]";

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1 text-xs">
        <span className="font-medium flex items-center gap-1.5">
          {label === "Gewicht" ? <Scale className="h-3.5 w-3.5 text-[hsl(var(--gold-deep))]" /> : <Package className="h-3.5 w-3.5 text-[hsl(var(--gold-deep))]" />}
          {label}
        </span>
        <span className={cn("font-semibold", overloaded && "text-red-600", near && "text-amber-700")}>
          {used}{unit && ` ${unit}`} / {cap > 0 ? `${cap}${unit && ` ${unit}`}` : "-"}
          <span className="ml-1 text-muted-foreground font-normal">({pct.toFixed(0)}%)</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-[hsl(var(--gold-soft)/0.5)] overflow-hidden">
        <div
          className={cn("h-full transition-all", barClass)}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}
