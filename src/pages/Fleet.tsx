import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Plus, Truck, Search, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFleetVehicles, useVehicleUtilization, useUpcomingMaintenance, useVehicleDriverConsistency, type Vehicle } from "@/hooks/useFleet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { NewVehicleDialog } from "@/components/fleet/NewVehicleDialog";
import { VehicleTypesSection } from "@/components/fleet/VehicleTypesSection";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { QueryError } from "@/components/QueryError";
import { TYPE_LABELS, TYPE_ORDER, STATUS_CONFIG } from "@/lib/constants/vehicleConfig";

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

  const filtered = useMemo(() => {
    if (!vehicles) return [];
    return vehicles.filter((v) => {
      if (search && !v.name.toLowerCase().includes(search.toLowerCase()) && !v.plate.toLowerCase().includes(search.toLowerCase())) return false;
      if (typeFilter !== "all" && v.type !== typeFilter) return false;
      if (statusFilter !== "all" && v.status !== statusFilter) return false;
      if (featureFilter !== "all" && !v.features.some((f) => f.toLowerCase().includes(featureFilter.toLowerCase()))) return false;
      return true;
    });
  }, [vehicles, search, typeFilter, statusFilter, featureFilter]);

  const grouped = useMemo(() => {
    const groups: Record<string, Vehicle[]> = {};
    for (const type of TYPE_ORDER) {
      const items = filtered.filter((v) => v.type === type);
      if (items.length > 0) groups[type] = items;
    }
    // catch any types not in TYPE_ORDER
    const knownTypes = new Set(TYPE_ORDER);
    for (const v of filtered) {
      if (!knownTypes.has(v.type)) {
        if (!groups[v.type]) groups[v.type] = [];
        groups[v.type].push(v);
      }
    }
    return groups;
  }, [filtered]);

  // Real utilization based on active trip weights vs vehicle capacity
  const getUtilization = (v: Vehicle) => {
    if (v.status === "onderhoud" || v.status === "defect") return 0;
    return utilization?.[v.id] ?? 0;
  };

  const [activeTab, setActiveTab] = useState("voertuigen");

  const overdueCount = overdueMaintenance
    ? new Set(overdueMaintenance.map((m) => m.vehicle_id)).size
    : 0;

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <div className="p-6 space-y-4 max-w-[1800px] mx-auto w-full">
          <PageHeader
            title="Vloot"
            subtitle={`${vehicles?.length ?? 0} voertuigen, ${vehicles?.filter((v) => v.status === "beschikbaar").length ?? 0} beschikbaar`}
            actions={
              activeTab === "voertuigen" ? (
                <button
                  type="button"
                  onClick={() => setShowNewDialog(true)}
                  className="btn-luxe btn-luxe--primary !h-9"
                >
                  <Plus className="h-4 w-4" />
                  Nieuw voertuig
                </button>
              ) : null
            }
          />

          <TabsList>
            <TabsTrigger value="voertuigen">Voertuigen</TabsTrigger>
            <TabsTrigger value="types">Types</TabsTrigger>
          </TabsList>

          <TabsContent value="voertuigen" className="space-y-4 mt-0">
            {overdueCount > 0 && (
              <div
                className="card--luxe p-4 flex items-center gap-3"
                style={{ background: "linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--destructive) / 0.06) 100%)" }}
              >
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                <p className="text-sm text-destructive font-medium">
                  {overdueCount} voertuig{overdueCount !== 1 ? "en" : ""} {overdueCount !== 1 ? "hebben" : "heeft"} verlopen onderhoud
                </p>
              </div>
            )}

            <div className="card--luxe p-4 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-[220px] max-w-md">
                <Search className="h-4 w-4 text-[hsl(var(--gold-deep))] shrink-0" />
                <Input
                  placeholder="Zoek op naam of kenteken..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="field-luxe flex-1"
                />
              </div>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger
                  aria-label="Type"
                  className="h-9 w-[140px] text-sm"
                  style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-small)" }}
                >
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle types</SelectItem>
                  {TYPE_ORDER.map((t) => (
                    <SelectItem key={t} value={t}>{TYPE_LABELS[t] || t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger
                  aria-label="Status"
                  className="h-9 w-[150px] text-sm"
                  style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-small)" }}
                >
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
                <SelectTrigger
                  aria-label="Certificering"
                  className="h-9 w-[170px] text-sm"
                  style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-small)" }}
                >
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
              <div className="space-y-8">
                {Object.entries(grouped).map(([type, items]) => (
                  <div key={type}>
                    <h2 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--gold-deep))]">
                      <Truck className="h-4 w-4" strokeWidth={1.75} />
                      {TYPE_LABELS[type] || type}
                      <span className="text-[hsl(var(--gold-deep))/0.6] font-normal normal-case tracking-normal">
                        ({items.length})
                      </span>
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {items.map((v) => {
                        const statusCfg = STATUS_CONFIG[v.status] || STATUS_CONFIG.beschikbaar;
                        const util = getUtilization(v);
                        const driverWarning = driverConsistency?.[v.id]?.warning;
                        return (
                          <Link key={v.id} to={`/vloot/${v.id}`} className="block group">
                            <div className="card--luxe p-5 space-y-3 transition-shadow duration-150 group-hover:shadow-[0_8px_24px_-8px_hsl(var(--gold-deep)/0.18)]">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-foreground truncate">{v.name}</p>
                                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{v.plate}</p>
                                </div>
                                <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${statusCfg.textClass}`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dotClass}`} />
                                  {statusCfg.label}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                                <span className="tabular-nums">{v.capacityKg.toLocaleString()} kg</span>
                                <span className="text-[hsl(var(--gold)/0.5)]">·</span>
                                <span className="tabular-nums">{v.capacityPallets} pallets</span>
                                {v.features.slice(0, 2).map((f) => (
                                  <span
                                    key={f}
                                    className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-[hsl(var(--gold)/0.25)] bg-[hsl(var(--gold-soft)/0.3)] text-[hsl(var(--gold-deep))] text-[11px]"
                                  >
                                    {f}
                                  </span>
                                ))}
                              </div>

                              <div className="space-y-1.5 pt-1">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">Chauffeur</span>
                                  <span className="inline-flex items-center gap-1.5 text-foreground font-medium">
                                    {driverWarning && (
                                      <TooltipProvider delayDuration={100}>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span
                                              role="img"
                                              aria-label={driverWarning}
                                              onClick={(e) => e.preventDefault()}
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
                                    {v.assignedDriver || "—"}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">Beladingsgraad</span>
                                  <span className="text-foreground font-medium tabular-nums">{util}%</span>
                                </div>
                                <Progress value={util} className="h-1.5 bg-[hsl(var(--gold-soft)/0.35)] [&>div]:bg-[hsl(var(--gold-deep))]" />
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
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
