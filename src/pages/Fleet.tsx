import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Truck,
  Search,
  AlertTriangle,
  ArrowRight,
  Wrench,
  User,
  Gauge,
  ShieldCheck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  useFleetVehicles,
  useVehicleUtilization,
  useUpcomingMaintenance,
  useVehicleDriverConsistency,
  type Vehicle,
} from "@/hooks/useFleet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { NewVehicleDialog } from "@/components/fleet/NewVehicleDialog";
import { VehicleTypesSection } from "@/components/fleet/VehicleTypesSection";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { QueryError } from "@/components/QueryError";
import { TYPE_LABELS, TYPE_ORDER, STATUS_CONFIG } from "@/lib/constants/vehicleConfig";
import { cn } from "@/lib/utils";
import VoertuigcheckHistorie from "@/pages/VoertuigcheckHistorie";

export default function Fleet() {
  const { data: vehicles, isLoading, isError, refetch } = useFleetVehicles();
  const { data: utilization } = useVehicleUtilization();
  const { data: overdueMaintenance } = useUpcomingMaintenance();
  const { data: driverConsistency } = useVehicleDriverConsistency();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [featureFilter, setFeatureFilter] = useState("all");
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("voertuigen");

  const filtered = useMemo(() => {
    if (!vehicles) return [];
    return vehicles.filter((vehicle) => {
      if (
        search &&
        !vehicle.name.toLowerCase().includes(search.toLowerCase()) &&
        !vehicle.plate.toLowerCase().includes(search.toLowerCase())
      ) {
        return false;
      }
      if (typeFilter !== "all" && vehicle.type !== typeFilter) return false;
      if (statusFilter !== "all" && vehicle.status !== statusFilter) return false;
      if (
        featureFilter !== "all" &&
        !vehicle.features.some((feature) => feature.toLowerCase().includes(featureFilter.toLowerCase()))
      ) {
        return false;
      }
      return true;
    });
  }, [vehicles, search, typeFilter, statusFilter, featureFilter]);

  const grouped = useMemo(() => {
    const groups: Record<string, Vehicle[]> = {};
    for (const type of TYPE_ORDER) {
      const items = filtered.filter((vehicle) => vehicle.type === type);
      if (items.length > 0) groups[type] = items;
    }

    const knownTypes = new Set(TYPE_ORDER);
    for (const vehicle of filtered) {
      if (!knownTypes.has(vehicle.type)) {
        if (!groups[vehicle.type]) groups[vehicle.type] = [];
        groups[vehicle.type].push(vehicle);
      }
    }

    return groups;
  }, [filtered]);

  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedVehicleId(null);
      return;
    }

    if (!selectedVehicleId || !filtered.some((vehicle) => vehicle.id === selectedVehicleId)) {
      setSelectedVehicleId(filtered[0].id);
    }
  }, [filtered, selectedVehicleId]);

  const getUtilization = (vehicle: Vehicle) => {
    if (vehicle.status === "onderhoud" || vehicle.status === "defect") return 0;
    return utilization?.[vehicle.id] ?? 0;
  };

  const overdueCount = overdueMaintenance
    ? new Set(overdueMaintenance.map((item) => item.vehicle_id)).size
    : 0;

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 6) return "Nacht";
    if (hour < 12) return "Goedemorgen";
    if (hour < 18) return "Goedemiddag";
    return "Goedenavond";
  }, []);

  const totalVehicles = vehicles?.length ?? 0;
  const availableVehicles = vehicles?.filter((vehicle) => vehicle.status === "beschikbaar").length ?? 0;
  const archivedVehicles = vehicles?.filter((vehicle) => (vehicle as any).is_active === false).length ?? 0;

  const selectedVehicle =
    filtered.find((vehicle) => vehicle.id === selectedVehicleId) ??
    filtered[0] ??
    null;
  const selectedVehicleStatus = selectedVehicle
    ? (STATUS_CONFIG[selectedVehicle.status] || STATUS_CONFIG.beschikbaar)
    : null;
  const selectedVehicleUtilization = selectedVehicle ? getUtilization(selectedVehicle) : 0;
  const selectedVehicleDriverWarning = selectedVehicle
    ? driverConsistency?.[selectedVehicle.id]?.warning
    : null;
  const selectedVehicleMaintenance = selectedVehicle
    ? overdueMaintenance?.filter((item) => item.vehicle_id === selectedVehicle.id) ?? []
    : [];

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
        <div className="mx-auto w-full max-w-[1800px] space-y-4 p-6">
          <div className="relative pb-3 pt-2">
            <div
              aria-hidden
              className="pointer-events-none absolute -left-8 -top-6 h-32 w-64"
              style={{ background: "radial-gradient(ellipse at top left, hsl(var(--gold-soft) / 0.6), transparent 70%)" }}
            />
            <div className="relative flex flex-wrap items-end justify-between gap-5">
              <div className="min-w-0 flex-1">
                <div
                  className="mb-3 flex flex-wrap items-center gap-2.5"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  <span
                    aria-hidden
                    className="inline-block h-[1px] w-8"
                    style={{ background: "linear-gradient(90deg, transparent, hsl(var(--gold)/0.7))" }}
                  />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[hsl(var(--gold-deep))]">
                    {greeting}
                  </span>
                  <span
                    aria-hidden
                    className="inline-block h-[3px] w-[3px] rounded-full"
                    style={{ background: "hsl(var(--gold) / 0.5)" }}
                  />
                  <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground/80 tabular-nums">
                    {totalVehicles} voertuigen, {availableVehicles} beschikbaar
                    {archivedVehicles > 0 ? `, ${archivedVehicles} archief` : ""}
                  </span>
                  {overdueCount > 0 && (
                    <>
                      <span
                        aria-hidden
                        className="inline-block h-[3px] w-[3px] rounded-full"
                        style={{ background: "hsl(var(--gold) / 0.5)" }}
                      />
                      <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-700 tabular-nums">
                        {overdueCount} onderhoud
                      </span>
                    </>
                  )}
                </div>

                <h1
                  className="text-[2.25rem] font-semibold leading-[1.05] tracking-tight text-foreground"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Vloot
                </h1>

                <div className="mt-3 inline-flex items-center gap-0.5 rounded-full border border-[hsl(var(--gold)/0.2)] bg-[hsl(var(--card))] p-0.5">
                  {[
                    { value: "voertuigen", label: "Voertuigen" },
                    { value: "types", label: "Types" },
                    { value: "voertuigcheck", label: "Voertuigcheck" },
                  ].map((tab) => (
                    <button
                      key={tab.value}
                      type="button"
                      onClick={() => setActiveTab(tab.value)}
                      aria-pressed={activeTab === tab.value}
                      className={cn(
                        "h-7 rounded-full px-4 text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors",
                        activeTab === tab.value
                          ? "bg-[hsl(var(--gold-soft)/0.65)] text-[hsl(var(--gold-deep))]"
                          : "text-muted-foreground/70 hover:text-foreground",
                      )}
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {activeTab === "voertuigen" && (
                <div className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowNewDialog(true)}
                    className="btn-luxe btn-luxe--primary"
                  >
                    <Plus className="h-4 w-4" /> Nieuw voertuig
                  </button>
                </div>
              )}
            </div>
          </div>

          <TabsContent value="voertuigcheck" className="mt-0">
            <VoertuigcheckHistorie embedded />
          </TabsContent>

          <TabsContent value="voertuigen" className="mt-0 space-y-4">
            {overdueCount > 0 && (
              <div
                className="card--luxe flex items-center gap-3 p-4"
                style={{ background: "linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--destructive) / 0.06) 100%)" }}
              >
                <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                <p className="text-sm font-medium text-destructive">
                  {overdueCount} voertuig{overdueCount !== 1 ? "en" : ""} {overdueCount !== 1 ? "hebben" : "heeft"} verlopen onderhoud
                </p>
              </div>
            )}

            <div className="card--luxe flex flex-wrap items-center gap-3 p-4">
              <div className="flex min-w-[220px] max-w-md flex-1 items-center gap-2">
                <Search className="h-4 w-4 shrink-0 text-[hsl(var(--gold-deep))]" />
                <Input
                  placeholder="Zoek op naam of kenteken..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="field-luxe flex-1"
                />
              </div>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger aria-label="Type" className="h-9 w-[140px] text-sm" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-small)" }}>
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle types</SelectItem>
                  {TYPE_ORDER.map((type) => (
                    <SelectItem key={type} value={type}>{TYPE_LABELS[type] || type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger aria-label="Status" className="h-9 w-[150px] text-sm" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-small)" }}>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle statussen</SelectItem>
                  <SelectItem value="beschikbaar">Beschikbaar</SelectItem>
                  <SelectItem value="onderweg">Onderweg</SelectItem>
                  <SelectItem value="onderhoud">Onderhoud</SelectItem>
                  <SelectItem value="defect">Defect</SelectItem>
                </SelectContent>
              </Select>

              <Select value={featureFilter} onValueChange={setFeatureFilter}>
                <SelectTrigger aria-label="Certificering" className="h-9 w-[170px] text-sm" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-small)" }}>
                  <SelectValue placeholder="Certificering" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle certificeringen</SelectItem>
                  <SelectItem value="adr">ADR</SelectItem>
                  <SelectItem value="koel">Koeling</SelectItem>
                  <SelectItem value="internationaal">Internationaal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <LoadingState message="Voertuigen laden..." />
            ) : isError ? (
              <QueryError message="Kan voertuiggegevens niet laden." onRetry={() => refetch()} />
            ) : Object.keys(grouped).length === 0 ? (
              <EmptyState
                icon={Truck}
                title="Geen voertuigen gevonden"
                description="Pas je filters aan of voeg een nieuw voertuig toe."
              />
            ) : (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-8">
                  {Object.entries(grouped).map(([type, items]) => (
                    <div key={type}>
                      <h2 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--gold-deep))]">
                        <Truck className="h-4 w-4" strokeWidth={1.75} />
                        {TYPE_LABELS[type] || type}
                        <span className="font-normal normal-case tracking-normal text-[hsl(var(--gold-deep))/0.6]">
                          ({items.length})
                        </span>
                      </h2>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {items.map((vehicle) => {
                          const statusCfg = STATUS_CONFIG[vehicle.status] || STATUS_CONFIG.beschikbaar;
                          const util = getUtilization(vehicle);
                          const driverWarning = driverConsistency?.[vehicle.id]?.warning;
                          const isSelected = selectedVehicle?.id === vehicle.id;
                          const overdueForVehicle = overdueMaintenance?.some((item) => item.vehicle_id === vehicle.id) ?? false;

                          return (
                            <button
                              key={vehicle.id}
                              type="button"
                              onClick={() => setSelectedVehicleId(vehicle.id)}
                              className={cn(
                                "card--luxe space-y-3 p-4 text-left transition-all duration-150",
                                isSelected && "ring-1 ring-[hsl(var(--gold)/0.22)] shadow-[0_18px_40px_-28px_hsl(var(--gold-deep)/0.3)]",
                              )}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="truncate text-sm font-semibold text-foreground">{vehicle.name}</p>
                                    {overdueForVehicle && (
                                      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                                        Onderhoud
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-0.5 text-xs font-mono text-muted-foreground">{vehicle.plate}</p>
                                </div>
                                <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium ${statusCfg.textClass}`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dotClass}`} />
                                  {statusCfg.label}
                                </span>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span className="tabular-nums">{vehicle.capacityKg.toLocaleString()} kg</span>
                                <span className="text-[hsl(var(--gold)/0.5)]">-</span>
                                <span className="tabular-nums">{vehicle.capacityPallets} pallets</span>
                              </div>

                              <div className="flex flex-wrap gap-1.5">
                                {vehicle.features.slice(0, 3).map((feature) => (
                                  <span
                                    key={feature}
                                    className="inline-flex items-center rounded-md border border-[hsl(var(--gold)/0.25)] bg-[hsl(var(--gold-soft)/0.3)] px-1.5 py-0.5 text-[11px] text-[hsl(var(--gold-deep))]"
                                  >
                                    {feature}
                                  </span>
                                ))}
                                {vehicle.features.length === 0 && (
                                  <span className="text-[11px] text-muted-foreground">Geen certificeringen</span>
                                )}
                              </div>

                              <div className="space-y-2 pt-1">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">Chauffeur</span>
                                  <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                                    {driverWarning && (
                                      <TooltipProvider delayDuration={100}>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span
                                              role="img"
                                              aria-label={driverWarning}
                                              onClick={(event) => event.stopPropagation()}
                                              className="inline-flex"
                                            >
                                              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" strokeWidth={1.75} />
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent side="top" className="max-w-[260px] text-xs">
                                            {driverWarning}
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    )}
                                    {vehicle.assignedDriver || "Niet toegewezen"}
                                  </span>
                                </div>

                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">Beladingsgraad</span>
                                  <span className="font-medium tabular-nums text-foreground">{util}%</span>
                                </div>
                                <Progress value={util} className="h-1.5 bg-[hsl(var(--gold-soft)/0.35)] [&>div]:bg-[hsl(var(--gold-deep))]" />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <aside className="card--luxe p-4 xl:sticky xl:top-4 xl:self-start">
                  <div className="mb-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))]" style={{ fontFamily: "var(--font-display)" }}>
                      Fleet Desk
                    </p>
                    <h2 className="mt-1 text-sm font-semibold text-foreground">
                      {selectedVehicle ? selectedVehicle.name : "Geen voertuig geselecteerd"}
                    </h2>
                  </div>

                  {!selectedVehicle || !selectedVehicleStatus ? (
                    <div className="rounded-[1rem] border border-[hsl(var(--gold)/0.1)] bg-[hsl(var(--gold-soft)/0.08)] px-4 py-10 text-center">
                      <p className="text-sm font-medium text-foreground">Selecteer een voertuig</p>
                      <p className="mt-1 text-xs text-muted-foreground">Dan verschijnt de operationele context hier.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-[1rem] border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.08)] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-lg font-semibold text-foreground">{selectedVehicle.plate}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {selectedVehicle.brand || "Onbekend merk"} - {selectedVehicle.code}
                            </p>
                          </div>
                          <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium ${selectedVehicleStatus.textClass}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${selectedVehicleStatus.dotClass}`} />
                            {selectedVehicleStatus.label}
                          </span>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                        <div className="rounded-[1rem] border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--background))] p-3">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <User className="h-4 w-4" />
                            <span className="text-xs uppercase tracking-[0.12em]">Chauffeur</span>
                          </div>
                          <p className="mt-2 text-sm font-medium text-foreground">{selectedVehicle.assignedDriver || "Niet toegewezen"}</p>
                          {selectedVehicleDriverWarning && (
                            <p className="mt-1 text-xs text-amber-700">{selectedVehicleDriverWarning}</p>
                          )}
                        </div>

                        <div className="rounded-[1rem] border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--background))] p-3">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Gauge className="h-4 w-4" />
                            <span className="text-xs uppercase tracking-[0.12em]">Belading</span>
                          </div>
                          <p className="mt-2 text-sm font-medium text-foreground">{selectedVehicleUtilization}% benut</p>
                          <div className="mt-2">
                            <Progress value={selectedVehicleUtilization} className="h-1.5 bg-[hsl(var(--gold-soft)/0.35)] [&>div]:bg-[hsl(var(--gold-deep))]" />
                          </div>
                        </div>
                      </div>

                      <div className="rounded-[1rem] border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--background))] p-3">
                        <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                          <Truck className="h-4 w-4" />
                          <span className="text-xs uppercase tracking-[0.12em]">Capaciteit</span>
                        </div>
                        <div className="space-y-1 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">Gewicht</span>
                            <span className="font-medium text-foreground">{selectedVehicle.capacityKg.toLocaleString()} kg</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">Pallets</span>
                            <span className="font-medium text-foreground">{selectedVehicle.capacityPallets}</span>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-[1rem] border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--background))] p-3">
                        <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                          <ShieldCheck className="h-4 w-4" />
                          <span className="text-xs uppercase tracking-[0.12em]">Certificeringen</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedVehicle.features.length > 0 ? selectedVehicle.features.map((feature) => (
                            <span
                              key={feature}
                              className="inline-flex items-center rounded-md border border-[hsl(var(--gold)/0.25)] bg-[hsl(var(--gold-soft)/0.3)] px-1.5 py-0.5 text-[11px] text-[hsl(var(--gold-deep))]"
                            >
                              {feature}
                            </span>
                          )) : (
                            <span className="text-xs text-muted-foreground">Geen certificeringen vastgelegd</span>
                          )}
                        </div>
                      </div>

                      <div className="rounded-[1rem] border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--background))] p-3">
                        <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                          <Wrench className="h-4 w-4" />
                          <span className="text-xs uppercase tracking-[0.12em]">Onderhoud</span>
                        </div>
                        {selectedVehicleMaintenance.length > 0 ? (
                          <div className="space-y-2">
                            {selectedVehicleMaintenance.slice(0, 3).map((item) => (
                              <div key={item.id} className="rounded-[0.85rem] bg-[hsl(var(--gold-soft)/0.08)] px-3 py-2 text-xs">
                                <p className="font-medium text-foreground">{item.maintenance_type}</p>
                                <p className="mt-0.5 text-muted-foreground">Gepland op {item.scheduled_date}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">Geen achterstallig onderhoud in beeld.</p>
                        )}
                      </div>

                      <Link to={`/vloot/${selectedVehicle.id}`} className="btn-luxe btn-luxe--primary w-full justify-center">
                        Open voertuigdetail
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  )}
                </aside>
              </div>
            )}
          </TabsContent>

          <TabsContent value="types" className="mt-0">
            <VehicleTypesSection />
          </TabsContent>
        </div>
      </Tabs>

      <NewVehicleDialog open={showNewDialog} onOpenChange={setShowNewDialog} />
    </div>
  );
}
