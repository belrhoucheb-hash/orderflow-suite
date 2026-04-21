import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Truck, FileText, Wrench, CalendarDays, BarChart3, AlertTriangle, Plus, CheckCircle2, ShieldCheck } from "lucide-react";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useVehicleById, useVehicleDocuments, useVehicleMaintenance, useVehicleAvailability, useCompleteMaintenance, useVehicleDriverConsistency } from "@/hooks/useFleet";
import { useBaselineInfo } from "@/hooks/useVehicleCheck";
import { useAuth } from "@/contexts/AuthContext";
import { VehicleCheckScreen } from "@/components/chauffeur/VehicleCheckScreen";
import { MaintenanceDialog } from "@/components/fleet/MaintenanceDialog";
import { DocumentDialog } from "@/components/fleet/DocumentDialog";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { format, differenceInDays, startOfWeek, addDays } from "date-fns";
import { nl } from "date-fns/locale";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { STATUS_CONFIG } from "@/lib/constants/vehicleConfig";

const DOC_LABELS: Record<string, string> = {
  apk: "APK Keuring",
  verzekering: "Verzekeringsbewijs",
  adr: "ADR-keuring",
  tachograaf: "Tachograaf IJking",
};

const MAINTENANCE_LABELS: Record<string, string> = {
  apk: "APK",
  grote_beurt: "Grote beurt",
  kleine_beurt: "Kleine beurt",
  bandenwissel: "Bandenwissel",
  regulier: "Regulier onderhoud",
  overig: "Overig",
};

const TAB_TRIGGER_CLASS =
  "rounded-none border-b-2 border-transparent bg-transparent shadow-none data-[state=active]:border-[hsl(var(--gold-deep))] data-[state=active]:bg-transparent data-[state=active]:text-[hsl(var(--gold-deep))] data-[state=active]:shadow-none px-3 py-2.5 text-[12px] font-medium tracking-tight text-muted-foreground hover:text-[hsl(var(--gold-deep))] transition-colors whitespace-nowrap gap-1.5";

export default function VehicleDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: vehicle, isLoading } = useVehicleById(id);

  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });

  const { data: documents } = useVehicleDocuments(id);
  const { data: maintenance } = useVehicleMaintenance(id);
  const { data: availability } = useVehicleAvailability(
    id,
    format(weekStart, "yyyy-MM-dd"),
    format(addDays(weekStart, 27), "yyyy-MM-dd")
  );
  const completeMaintenance = useCompleteMaintenance();
  const { data: driverConsistency } = useVehicleDriverConsistency();
  const [showMaintenanceDialog, setShowMaintenanceDialog] = useState(false);
  const [showDocumentDialog, setShowDocumentDialog] = useState(false);
  const [baselineSeedActive, setBaselineSeedActive] = useState(false);
  const { effectiveRole } = useAuth();
  const { data: baselineInfo } = useBaselineInfo(id ?? null);
  const isAdmin = effectiveRole === "admin";
  const queryClient = useQueryClient();
  const ownUpdateRef = useRef(0);

  useEffect(() => {
    if (!id) return;

    const isOwnUpdate = () => {
      if (Date.now() - ownUpdateRef.current < 1500) {
        ownUpdateRef.current = 0;
        return true;
      }
      return false;
    };

    const channel = supabase
      .channel(`vehicle-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vehicle_availability",
          filter: `vehicle_id=eq.${id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["vehicle-availability", id] });
          if (!isOwnUpdate()) {
            toast.info("Gegevens bijgewerkt door andere gebruiker");
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vehicle_maintenance",
          filter: `vehicle_id=eq.${id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["vehicle-maintenance", id] });
          queryClient.invalidateQueries({ queryKey: ["overdue-maintenance"] });
          if (!isOwnUpdate()) {
            toast.info("Gegevens bijgewerkt door andere gebruiker");
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, queryClient]);

  const availMap = useMemo(() => {
    const m: Record<string, string> = {};
    availability?.forEach((a) => { m[a.date] = a.status; });
    return m;
  }, [availability]);

  if (isLoading) return <LoadingState message="Voertuig laden..." />;
  if (!vehicle) return <EmptyState icon={Truck} title="Voertuig niet gevonden" description="Het gevraagde voertuig bestaat niet of is verwijderd." />;

  const statusCfg = STATUS_CONFIG[vehicle.status] || STATUS_CONFIG.beschikbaar;
  const driverWarning = id ? driverConsistency?.[id]?.warning : undefined;

  if (baselineSeedActive && id && baselineInfo?.vehicleTenantId) {
    return (
      <VehicleCheckScreen
        tenantId={baselineInfo.vehicleTenantId}
        driverId={null}
        vehicleId={id}
        asBaselineSeed
        onCompleted={() => setBaselineSeedActive(false)}
        onCancel={() => setBaselineSeedActive(false)}
      />
    );
  }

  const baselineDateLabel = baselineInfo?.completedAt
    ? format(new Date(baselineInfo.completedAt), "d MMM yyyy", { locale: nl })
    : null;

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-auto">
      <div className="p-6 space-y-4 max-w-[1800px] mx-auto w-full">
        <button
          type="button"
          onClick={() => navigate("/vloot")}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[hsl(var(--gold-deep))] hover:text-[hsl(var(--gold))] transition-colors"
          aria-label="Terug naar vloot"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          Terug naar vloot
        </button>

        <div className="card--luxe p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <p className="font-mono text-2xl font-semibold tracking-tight text-foreground">
                {vehicle.plate}
              </p>
              <h1 className="text-lg font-semibold text-foreground leading-tight">
                {vehicle.name}
              </h1>
              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                <span>{vehicle.brand || "Onbekend merk"}</span>
                <span className="text-[hsl(var(--gold)/0.5)]">·</span>
                <span className="tabular-nums">{vehicle.buildYear || "—"}</span>
                <span className="text-[hsl(var(--gold)/0.5)]">·</span>
                <span className="capitalize">{vehicle.type}</span>
                <span className="text-[hsl(var(--gold)/0.5)]">·</span>
                <span>{vehicle.code}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {baselineDateLabel && (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--gold)/0.4)] bg-[hsl(var(--gold-soft)/0.5)] px-2 py-1 text-[11px] font-medium text-[hsl(var(--gold-deep))]">
                  <ShieldCheck className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                  Baseline gezet op {baselineDateLabel}
                </span>
              )}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setBaselineSeedActive(true)}
                  className="btn-luxe !h-9"
                >
                  <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                  Baseline instellen
                </button>
              )}
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${statusCfg.textClass}`} aria-label={`Status: ${statusCfg.label}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dotClass}`} aria-hidden="true" />
                {statusCfg.label}
              </span>
            </div>
          </div>
        </div>

        {driverWarning && (
          <div
            className="card--luxe p-4 flex items-start gap-3"
            style={{ background: "linear-gradient(180deg, hsl(var(--card)) 0%, hsl(38 92% 50% / 0.08) 100%)" }}
            role="alert"
          >
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" strokeWidth={1.75} />
            <div className="min-w-0 space-y-0.5">
              <p className="text-[11px] uppercase tracking-[0.16em] text-amber-700 font-semibold">
                Chauffeurtoewijzing controleren
              </p>
              <p className="text-sm text-amber-800">{driverWarning}</p>
            </div>
          </div>
        )}

        <div className="card--luxe p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            <SpecField label="Max gewicht" value={`${vehicle.capacityKg.toLocaleString()} kg`} />
            <SpecField label="Palletplaatsen" value={vehicle.capacityPallets.toString()} />
            <SpecField label="Chauffeur" value={vehicle.assignedDriver || "Niet toegewezen"} />
            <SpecField label="Verbruik" value={vehicle.fuelConsumption ? `${vehicle.fuelConsumption} L/100km` : "—"} />
          </div>
          {vehicle.features.length > 0 && (
            <div className="mt-5 pt-4 border-t border-[hsl(var(--gold)/0.12)]">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[hsl(var(--gold-deep))] font-semibold mb-2">
                Uitrusting
              </p>
              <div className="flex flex-wrap gap-1.5">
                {vehicle.features.map((f) => (
                  <span
                    key={f}
                    className="inline-flex items-center px-2 py-0.5 rounded-md border border-[hsl(var(--gold)/0.25)] bg-[hsl(var(--gold-soft)/0.3)] text-[hsl(var(--gold-deep))] text-[11px]"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <Tabs defaultValue="specs" className="space-y-4">
          <TabsList className="w-full justify-start rounded-none border-b border-[hsl(var(--gold)/0.2)] bg-transparent px-0 h-auto py-0 gap-0 overflow-x-auto">
            <TabsTrigger value="specs" className={TAB_TRIGGER_CLASS} aria-label="Specificaties">
              <Truck className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />Specificaties
            </TabsTrigger>
            <TabsTrigger value="docs" className={TAB_TRIGGER_CLASS} aria-label="Documenten">
              <FileText className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />Documenten
            </TabsTrigger>
            <TabsTrigger value="maintenance" className={TAB_TRIGGER_CLASS} aria-label="Onderhoud">
              <Wrench className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />Onderhoud
            </TabsTrigger>
            <TabsTrigger value="availability" className={TAB_TRIGGER_CLASS} aria-label="Beschikbaarheid">
              <CalendarDays className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />Beschikbaarheid
            </TabsTrigger>
            <TabsTrigger value="performance" className={TAB_TRIGGER_CLASS} aria-label="Prestaties">
              <BarChart3 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />Prestaties
            </TabsTrigger>
          </TabsList>

          {/* Specificaties */}
          <TabsContent value="specs" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="card--luxe p-5 space-y-3">
                <SectionTitle>Voertuiggegevens</SectionTitle>
                <div className="divide-y divide-[hsl(var(--gold)/0.08)]">
                  <Row label="Type" value={vehicle.type} />
                  <Row label="Merk" value={vehicle.brand || "—"} />
                  <Row label="Bouwjaar" value={vehicle.buildYear?.toString() || "—"} />
                  <Row label="Kenteken" value={vehicle.plate} />
                  <Row label="Chauffeur" value={vehicle.assignedDriver || "Niet toegewezen"} />
                </div>
              </div>
              <div className="card--luxe p-5 space-y-3">
                <SectionTitle>Capaciteit en uitrusting</SectionTitle>
                <div className="divide-y divide-[hsl(var(--gold)/0.08)]">
                  <Row label="Max gewicht" value={`${vehicle.capacityKg.toLocaleString()} kg`} />
                  <Row label="Palletplaatsen" value={vehicle.capacityPallets.toString()} />
                  <div className="flex items-center justify-between gap-3 py-2">
                    <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                      Uitrusting
                    </span>
                    <div className="flex flex-wrap gap-1 justify-end">
                      {vehicle.features.length > 0 ? vehicle.features.map((f) => (
                        <span
                          key={f}
                          className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-[hsl(var(--gold)/0.25)] bg-[hsl(var(--gold-soft)/0.3)] text-[hsl(var(--gold-deep))] text-[11px]"
                        >
                          {f}
                        </span>
                      )) : <span className="text-xs text-muted-foreground">—</span>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Documenten */}
          <TabsContent value="docs" className="mt-0">
            <div className="card--luxe p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <SectionTitle>Documenten en keuringen</SectionTitle>
                <button
                  type="button"
                  onClick={() => setShowDocumentDialog(true)}
                  className="btn-luxe btn-luxe--primary !h-9"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                  Nieuw document
                </button>
              </div>
              {!documents || documents.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">Geen documenten geregistreerd</p>
              ) : (
                <div>
                  {documents.map((doc) => {
                    const daysLeft = doc.expiry_date ? differenceInDays(new Date(doc.expiry_date), today) : null;
                    const isWarning = daysLeft !== null && daysLeft < 30 && daysLeft >= 0;
                    const isExpired = daysLeft !== null && daysLeft < 0;
                    return (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between gap-3 py-3 border-b border-[hsl(var(--gold)/0.08)] last:border-0"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <FileText className="h-4 w-4 text-[hsl(var(--gold-deep))] shrink-0" strokeWidth={1.5} aria-hidden="true" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {DOC_LABELS[doc.doc_type] || doc.doc_type}
                            </p>
                            {doc.notes && <p className="text-[11px] text-muted-foreground truncate">{doc.notes}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {doc.expiry_date && (
                            <span className="text-[11px] text-muted-foreground tabular-nums">
                              Verloopt {format(new Date(doc.expiry_date), "d MMM yyyy", { locale: nl })}
                            </span>
                          )}
                          {isExpired && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-rose-500/30 bg-rose-500/10 text-rose-700 text-[11px] font-medium">
                              <AlertTriangle className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                              Verlopen
                            </span>
                          )}
                          {isWarning && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-700 text-[11px] font-medium">
                              <AlertTriangle className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                              {daysLeft}d
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Onderhoud */}
          <TabsContent value="maintenance" className="mt-0">
            <div className="card--luxe p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <SectionTitle>Onderhoudslogboek</SectionTitle>
                <button
                  type="button"
                  onClick={() => setShowMaintenanceDialog(true)}
                  className="btn-luxe btn-luxe--primary !h-9"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                  Nieuw onderhoud
                </button>
              </div>
              {!maintenance || maintenance.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">Geen onderhoud geregistreerd</p>
              ) : (
                <div>
                  {maintenance.map((m) => {
                    const isCompleted = !!m.completed_date;
                    const isOverdue = !isCompleted && m.scheduled_date && new Date(m.scheduled_date) < today;
                    const isScheduled = !isCompleted && !isOverdue;
                    return (
                      <div
                        key={m.id}
                        className="flex items-center justify-between gap-3 py-3 border-b border-[hsl(var(--gold)/0.08)] last:border-0"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-foreground">
                              {MAINTENANCE_LABELS[m.maintenance_type] || m.description || m.maintenance_type}
                            </p>
                            {isCompleted && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 text-[11px] font-medium">
                                Uitgevoerd
                              </span>
                            )}
                            {isScheduled && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-[hsl(var(--gold)/0.3)] bg-[hsl(var(--gold-soft)/0.3)] text-[hsl(var(--gold-deep))] text-[11px] font-medium">
                                Gepland
                              </span>
                            )}
                            {isOverdue && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-rose-500/30 bg-rose-500/10 text-rose-700 text-[11px] font-medium">
                                <AlertTriangle className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                                Verlopen
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {m.completed_date
                              ? `Uitgevoerd ${format(new Date(m.completed_date), "d MMM yyyy", { locale: nl })}`
                              : m.scheduled_date
                              ? `Gepland ${format(new Date(m.scheduled_date), "d MMM yyyy", { locale: nl })}`
                              : "Geen datum"}
                            {m.mileage_km && ` \u00B7 ${m.mileage_km.toLocaleString()} km`}
                          </p>
                          {m.description && m.description !== m.maintenance_type && (
                            <p className="text-[11px] text-muted-foreground italic">{m.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {m.cost !== null && m.cost !== undefined && (
                            <span className="text-sm font-medium text-foreground tabular-nums">
                              {"\u20AC"}{m.cost.toLocaleString()}
                            </span>
                          )}
                          {!isCompleted && (
                            <button
                              type="button"
                              disabled={completeMaintenance.isPending}
                              onClick={() => {
                                ownUpdateRef.current = Date.now();
                                completeMaintenance.mutate(
                                  { id: m.id, vehicleId: m.vehicle_id },
                                  { onSuccess: () => toast.success("Onderhoud afgerond") }
                                );
                              }}
                              className="btn-luxe !h-8 !text-xs !px-2.5"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                              Afronden
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Beschikbaarheid */}
          <TabsContent value="availability" className="mt-0">
            <div className="card--luxe p-5 space-y-4">
              <SectionTitle>Weekoverzicht Beschikbaarheid</SectionTitle>
              <div className="space-y-4">
                {[0, 1, 2, 3].map((weekOffset) => {
                  const ws = addDays(weekStart, weekOffset * 7);
                  return (
                    <div key={weekOffset}>
                      <p className="text-[11px] font-medium text-[hsl(var(--gold-deep))] uppercase tracking-[0.12em] mb-2">
                        Week {format(ws, "w")}, {format(ws, "d MMM", { locale: nl })}
                      </p>
                      <div className="grid grid-cols-7 gap-1.5">
                        {Array.from({ length: 7 }).map((_, dayIdx) => {
                          const d = addDays(ws, dayIdx);
                          const dateStr = format(d, "yyyy-MM-dd");
                          const dayStatus = availMap[dateStr] || "beschikbaar";
                          const color = dayStatus === "beschikbaar"
                            ? "bg-emerald-500/15 border-emerald-400/40"
                            : dayStatus === "niet_beschikbaar"
                            ? "bg-rose-500/10 border-rose-400/40"
                            : "bg-[hsl(var(--gold-soft)/0.25)] border-[hsl(var(--gold)/0.2)]";
                          const statusLabel = dayStatus === "beschikbaar"
                            ? "beschikbaar"
                            : dayStatus === "niet_beschikbaar"
                            ? "niet beschikbaar"
                            : "niet ingepland";
                          const dayAriaLabel = `${format(d, "d MMMM yyyy", { locale: nl })}, ${statusLabel}`;
                          return (
                            <div
                              key={dayIdx}
                              role="group"
                              aria-label={dayAriaLabel}
                              className={`rounded-lg border p-2 text-center ${color}`}
                            >
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide" aria-hidden="true">
                                {format(d, "EEE", { locale: nl })}
                              </p>
                              <p className="text-sm font-semibold text-foreground tabular-nums mt-0.5" aria-hidden="true">
                                {format(d, "d")}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-4 pt-2 text-[11px] text-muted-foreground border-t border-[hsl(var(--gold)/0.12)]">
                <div className="flex items-center gap-1.5 pt-2">
                  <div className="h-3 w-3 rounded bg-emerald-500/15 border border-emerald-400/40" aria-hidden="true" />
                  Beschikbaar
                </div>
                <div className="flex items-center gap-1.5 pt-2">
                  <div className="h-3 w-3 rounded bg-[hsl(var(--gold-soft)/0.25)] border border-[hsl(var(--gold)/0.2)]" aria-hidden="true" />
                  Niet ingepland
                </div>
                <div className="flex items-center gap-1.5 pt-2">
                  <div className="h-3 w-3 rounded bg-rose-500/10 border border-rose-400/40" aria-hidden="true" />
                  Niet beschikbaar
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Prestaties */}
          <TabsContent value="performance" className="mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <KPICard title="Kilometers deze maand" value="—" unit="km" />
              <KPICard title="Beladingsgraad" value="—" unit="%" />
              <KPICard title="Brandstofverbruik" value={vehicle.fuelConsumption ? `${vehicle.fuelConsumption}` : "—"} unit="L/100km" />
              <KPICard title="Omzet per km" value="—" unit="€/km" />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {id && <MaintenanceDialog vehicleId={id} open={showMaintenanceDialog} onOpenChange={setShowMaintenanceDialog} />}
      {id && <DocumentDialog vehicleId={id} open={showDocumentDialog} onOpenChange={setShowDocumentDialog} />}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-display font-semibold text-[hsl(var(--gold-deep))] uppercase tracking-[0.16em]">
      {children}
    </h3>
  );
}

function SpecField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] uppercase tracking-[0.16em] text-[hsl(var(--gold-deep))] font-semibold">
        {label}
      </p>
      <p className="text-base font-semibold text-foreground tabular-nums leading-tight">
        {value}
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide shrink-0">
        {label}
      </span>
      <span className="text-xs text-right text-foreground truncate" title={value}>
        {value}
      </span>
    </div>
  );
}

function KPICard({ title, value, unit }: { title: string; value: string; unit: string }) {
  return (
    <div className="card--luxe p-5">
      <p className="text-[11px] uppercase tracking-[0.16em] text-[hsl(var(--gold-deep))] font-semibold">
        {title}
      </p>
      <div className="flex items-baseline gap-1 mt-2">
        <span className="text-2xl font-semibold text-foreground tabular-nums">{value}</span>
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}
