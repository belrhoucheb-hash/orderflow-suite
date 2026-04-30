import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
  SlidersHorizontal,
  Package,
  Star,
  ChevronRight,
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
import { DeferredMount } from "@/components/performance/DeferredMount";
import { toast } from "sonner";

type FleetStatusSection = "beschikbaar" | "onderweg" | "onderhoud" | "defect";

const STATUS_SECTIONS: Array<{
  key: FleetStatusSection;
  heading: string;
  subheading: string;
  dotClass: string;
  accentClass: string;
}> = [
  {
    key: "beschikbaar",
    heading: "Beschikbaar",
    subheading: "Klaar voor inzet",
    dotClass: "bg-emerald-500",
    accentClass: "text-emerald-700",
  },
  {
    key: "onderweg",
    heading: "Onderweg",
    subheading: "Bezig met rit of levering",
    dotClass: "bg-[hsl(var(--gold-deep))]",
    accentClass: "text-[hsl(var(--gold-deep))]",
  },
  {
    key: "onderhoud",
    heading: "Onderhoud",
    subheading: "Aandacht of werkplaats",
    dotClass: "bg-amber-500",
    accentClass: "text-amber-700",
  },
  {
    key: "defect",
    heading: "Defect",
    subheading: "Niet inzetbaar",
    dotClass: "bg-rose-500",
    accentClass: "text-rose-700",
  },
];

function sortVehicles(items: Vehicle[], mode: string, getUtilization: (vehicle: Vehicle) => number) {
  const clone = [...items];

  switch (mode) {
    case "belasting":
      return clone.sort((a, b) => getUtilization(b) - getUtilization(a));
    case "capaciteit":
      return clone.sort((a, b) => b.capacityKg - a.capacityKg);
    case "kenteken":
      return clone.sort((a, b) => a.plate.localeCompare(b.plate, "nl"));
    case "naam":
      return clone.sort((a, b) => a.name.localeCompare(b.name, "nl"));
    default:
      return clone.sort((a, b) => {
        const aScore = (a.status === "beschikbaar" ? 0 : 2) + (a.assignedDriver ? 1 : 0) + (a.features.length > 0 ? 1 : 0);
        const bScore = (b.status === "beschikbaar" ? 0 : 2) + (b.assignedDriver ? 1 : 0) + (b.features.length > 0 ? 1 : 0);
        if (aScore !== bScore) return aScore - bScore;
        return a.name.localeCompare(b.name, "nl");
      });
  }
}

export default function Fleet() {
  const navigate = useNavigate();
  const { data: vehicles, isLoading, isError, refetch } = useFleetVehicles();
  const { data: utilization } = useVehicleUtilization();
  const { data: overdueMaintenance } = useUpcomingMaintenance();
  const { data: driverConsistency } = useVehicleDriverConsistency();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [featureFilter, setFeatureFilter] = useState("all");
  const [sortMode, setSortMode] = useState("beste-match");
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("voertuigen");

  const filtered = useMemo(() => {
    if (!vehicles) return [];
    return vehicles.filter((vehicle) => {
      if (
        search &&
        !vehicle.name.toLowerCase().includes(search.toLowerCase()) &&
        !vehicle.plate.toLowerCase().includes(search.toLowerCase()) &&
        !vehicle.code.toLowerCase().includes(search.toLowerCase())
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

  const getUtilization = (vehicle: Vehicle) => {
    if (vehicle.status === "onderhoud" || vehicle.status === "defect") return 0;
    return utilization?.[vehicle.id] ?? 0;
  };

  const filteredSorted = useMemo(
    () => sortVehicles(filtered, sortMode, getUtilization),
    [filtered, sortMode, utilization],
  );

  const groupedByStatus = useMemo(() => {
    return STATUS_SECTIONS.map((section) => ({
      ...section,
      items: filteredSorted.filter((vehicle) => vehicle.status === section.key),
    })).filter((section) => section.items.length > 0);
  }, [filteredSorted]);

  useEffect(() => {
    if (filteredSorted.length === 0) {
      setSelectedVehicleId(null);
      return;
    }

    if (!selectedVehicleId || !filteredSorted.some((vehicle) => vehicle.id === selectedVehicleId)) {
      setSelectedVehicleId(filteredSorted[0].id);
    }
  }, [filteredSorted, selectedVehicleId]);

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
  const selectedVehicle =
    filteredSorted.find((vehicle) => vehicle.id === selectedVehicleId) ??
    filteredSorted[0] ??
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
  const selectedVehicleType = selectedVehicle ? TYPE_LABELS[selectedVehicle.type] || selectedVehicle.type : null;
  const hasActiveFilters =
    search.length > 0 || typeFilter !== "all" || statusFilter !== "all" || featureFilter !== "all";

  const handlePlanVehicle = (vehicle: Vehicle) => {
    navigate("/planning", {
      state: {
        preferredVehicleId: vehicle.id,
        preferredVehicleName: vehicle.name,
        source: "fleet",
      },
    });
    toast.success(`${vehicle.name} doorgestuurd naar Planning`, {
      description: "Gebruik dit voertuig direct in je planning of dispatchflow.",
    });
  };

  const handleAssignDriver = (vehicle: Vehicle) => {
    navigate("/chauffeurs", {
      state: {
        preferredVehicleId: vehicle.id,
        preferredVehicleName: vehicle.name,
        source: "fleet",
      },
    });
    toast.success(`Open chauffeurs voor ${vehicle.name}`, {
      description: "Kies daar een chauffeur en koppel hem aan dit voertuig.",
    });
  };

  const handleOpenVehicleDetail = (vehicle: Vehicle, section?: "documents" | "maintenance") => {
    navigate(`/vloot/${vehicle.id}`, {
      state: {
        initialSection: section ?? "specs",
        source: "fleet",
      },
    });
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
        <div className="mx-auto w-full max-w-[1880px] space-y-4 p-6">
          <div className="relative overflow-hidden rounded-2xl border border-[hsl(var(--gold)/0.16)] bg-[linear-gradient(135deg,hsl(var(--gold-soft)/0.46),hsl(var(--card))_46%,hsl(var(--gold-soft)/0.18))] px-5 py-5 shadow-[0_22px_70px_-54px_hsl(32_45%_26%/0.45)]">
            <div
              aria-hidden
              className="pointer-events-none absolute -left-8 -top-6 h-32 w-64"
              style={{ background: "radial-gradient(ellipse at top left, hsl(var(--gold-soft) / 0.6), transparent 70%)" }}
            />
            <div className="relative flex flex-wrap items-start justify-between gap-5">
              <div className="min-w-0 flex-1">
                <div className="mb-3 flex flex-wrap items-center gap-2.5" style={{ fontFamily: "var(--font-display)" }}>
                  <span aria-hidden className="inline-block h-[1px] w-8" style={{ background: "linear-gradient(90deg, transparent, hsl(var(--gold)/0.7))" }} />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[hsl(var(--gold-deep))]">
                    {greeting}
                  </span>
                  <span aria-hidden className="inline-block h-[3px] w-[3px] rounded-full" style={{ background: "hsl(var(--gold) / 0.5)" }} />
                  <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground/80 tabular-nums">
                    {totalVehicles} voertuigen, {availableVehicles} beschikbaar
                  </span>
                  {overdueCount > 0 && (
                    <>
                      <span aria-hidden className="inline-block h-[3px] w-[3px] rounded-full" style={{ background: "hsl(var(--gold) / 0.5)" }} />
                      <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-700 tabular-nums">
                        {overdueCount} onderhoud
                      </span>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span>Vloot</span>
                  <ChevronRight className="h-4 w-4 text-[hsl(var(--gold-deep))/0.45]" />
                  <span className="text-foreground">Voertuigen</span>
                </div>

                <h1
                  className="mt-2 text-[2.35rem] font-semibold leading-[1.05] tracking-tight text-foreground"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Vloot
                </h1>

                <div className="mt-4 inline-flex items-center gap-0.5 rounded-full border border-[hsl(var(--gold)/0.2)] bg-[hsl(var(--card))] p-0.5">
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
                        "h-8 rounded-full px-4 text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors",
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
            <DeferredMount label="Voertuigcheck laden">
              <VoertuigcheckHistorie embedded />
            </DeferredMount>
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

            <div className="card--luxe space-y-4 p-4 md:p-5">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-[0.95rem] border border-[hsl(var(--gold)/0.12)] bg-background/95 px-3">
                  <Search className="h-4 w-4 shrink-0 text-[hsl(var(--gold-deep))]" />
                  <Input
                    placeholder="Zoek op naam of kenteken..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="h-11 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                  />
                </div>

                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger aria-label="Type" className="h-11 w-[168px] rounded-[0.95rem] border-[hsl(var(--gold)/0.12)] bg-background/95 text-sm" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-small)" }}>
                    <span className="mr-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Type</span>
                    <SelectValue placeholder="Alle types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle types</SelectItem>
                    {TYPE_ORDER.map((type) => (
                      <SelectItem key={type} value={type}>{TYPE_LABELS[type] || type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger aria-label="Status" className="h-11 w-[180px] rounded-[0.95rem] border-[hsl(var(--gold)/0.12)] bg-background/95 text-sm" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-small)" }}>
                    <span className="mr-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Status</span>
                    <SelectValue placeholder="Alle statussen" />
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
                  <SelectTrigger aria-label="Certificering" className="h-11 w-[210px] rounded-[0.95rem] border-[hsl(var(--gold)/0.12)] bg-background/95 text-sm" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-small)" }}>
                    <span className="mr-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Certificering</span>
                    <SelectValue placeholder="Alle certificeringen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle certificeringen</SelectItem>
                    <SelectItem value="adr">ADR</SelectItem>
                    <SelectItem value="koel">Koeling</SelectItem>
                    <SelectItem value="internationaal">Internationaal</SelectItem>
                  </SelectContent>
                </Select>

                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setTypeFilter("all");
                    setStatusFilter("all");
                    setFeatureFilter("all");
                    setSortMode("beste-match");
                  }}
                  className="inline-flex h-11 items-center gap-2 rounded-[0.95rem] border border-[hsl(var(--gold)/0.12)] bg-background/95 px-4 text-sm font-medium text-foreground transition-colors hover:bg-[hsl(var(--gold-soft)/0.18)]"
                >
                  <SlidersHorizontal className="h-4 w-4 text-[hsl(var(--gold-deep))]" />
                  {hasActiveFilters ? "Reset filters" : "Filters klaar"}
                </button>
              </div>
            </div>

            {isLoading ? (
              <LoadingState message="Voertuigen laden..." />
            ) : isError ? (
              <QueryError message="Kan voertuiggegevens niet laden." onRetry={() => refetch()} />
            ) : groupedByStatus.length === 0 ? (
              <EmptyState
                icon={Truck}
                title="Geen voertuigen gevonden"
                description="Pas je filters aan of voeg een nieuw voertuig toe."
              />
            ) : (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-8">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm text-muted-foreground">
                      {filteredSorted.length} voertuigen in huidige selectie
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">Sorteer op</span>
                      <Select value={sortMode} onValueChange={setSortMode}>
                        <SelectTrigger className="h-10 w-[160px] rounded-[0.95rem] border-[hsl(var(--gold)/0.12)] bg-background/95 text-sm">
                          <SelectValue placeholder="Beste match" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="beste-match">Beste match</SelectItem>
                          <SelectItem value="belasting">Beladingsgraad</SelectItem>
                          <SelectItem value="capaciteit">Capaciteit</SelectItem>
                          <SelectItem value="kenteken">Kenteken</SelectItem>
                          <SelectItem value="naam">Naam</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {groupedByStatus.map((section) => (
                    <section key={section.key} className="space-y-4">
                      <div className="border-b border-[hsl(var(--gold)/0.12)] pb-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn("h-3 w-3 rounded-full", section.dotClass)} />
                          <h2 className={cn("text-xl font-semibold tracking-tight", section.accentClass)} style={{ fontFamily: "var(--font-display)" }}>
                            {section.heading}
                          </h2>
                          <span className="text-sm text-muted-foreground">({section.items.length})</span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{section.subheading}</p>
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
                        {section.items.map((vehicle, index) => {
                          const statusCfg = STATUS_CONFIG[vehicle.status] || STATUS_CONFIG.beschikbaar;
                          const util = getUtilization(vehicle);
                          const driverWarning = driverConsistency?.[vehicle.id]?.warning;
                          const isSelected = selectedVehicle?.id === vehicle.id;
                          const overdueForVehicle = overdueMaintenance?.some((item) => item.vehicle_id === vehicle.id) ?? false;
                          const highlightCard = section.key === "beschikbaar" && index === 0 && statusFilter === "all" && !search;

                          return (
                            <button
                              key={vehicle.id}
                              type="button"
                              onClick={() => setSelectedVehicleId(vehicle.id)}
                              className={cn(
                                "card--luxe group relative overflow-hidden p-4 text-left transition-all duration-200",
                                isSelected && "ring-1 ring-[hsl(var(--gold)/0.26)] shadow-[0_24px_70px_-34px_hsl(var(--gold-deep)/0.34)]",
                                highlightCard && !isSelected && "ring-1 ring-emerald-400/65",
                              )}
                            >
                              <div
                                aria-hidden
                                className={cn(
                                  "pointer-events-none absolute inset-x-0 top-0 h-20 opacity-0 transition-opacity duration-200",
                                  isSelected && "opacity-100",
                                )}
                                style={{ background: "linear-gradient(180deg, hsl(var(--gold-soft)/0.18) 0%, transparent 100%)" }}
                              />

                              <div className="relative space-y-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    {highlightCard && (
                                      <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                                        <Star className="h-3 w-3" />
                                        Beste match
                                      </span>
                                    )}
                                    <p className="truncate text-[1.05rem] font-semibold text-foreground">{vehicle.name}</p>
                                    <p className="mt-0.5 text-sm text-muted-foreground">{vehicle.plate}</p>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                      {selectedVehicle?.id === vehicle.id ? selectedVehicleType : TYPE_LABELS[vehicle.type] || vehicle.type}
                                    </p>
                                  </div>
                                  <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusCfg.textClass} bg-background/85`}>
                                    <span className={`h-2 w-2 rounded-full ${statusCfg.dotClass}`} />
                                    {statusCfg.label}
                                  </span>
                                </div>

                                <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
                                  <div className="inline-flex items-center gap-2">
                                    <Gauge className="h-4 w-4 text-[hsl(var(--gold-deep))]" />
                                    <span className="tabular-nums">{vehicle.capacityKg.toLocaleString()} kg</span>
                                  </div>
                                  <div className="inline-flex items-center gap-2">
                                    <Package className="h-4 w-4 text-[hsl(var(--gold-deep))]" />
                                    <span className="tabular-nums">{vehicle.capacityPallets} pallets</span>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground">Belading</span>
                                    <span className="font-semibold tabular-nums text-foreground">{util}%</span>
                                  </div>
                                  <Progress value={util} className="h-1.5 bg-[hsl(var(--gold-soft)/0.35)] [&>div]:bg-[hsl(var(--gold-deep))]" />
                                </div>

                                <div className="flex items-center justify-between gap-3 text-sm">
                                  <div className="min-w-0">
                                    <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Chauffeur</p>
                                    <p className="mt-1 truncate font-medium text-foreground">
                                      {vehicle.assignedDriver || "Geen chauffeur"}
                                    </p>
                                  </div>
                                  {driverWarning && (
                                    <TooltipProvider delayDuration={100}>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span
                                            role="img"
                                            aria-label={driverWarning}
                                            onClick={(event) => event.stopPropagation()}
                                            className="inline-flex rounded-full border border-amber-200 bg-amber-50 p-1.5 text-amber-700"
                                          >
                                            <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.75} />
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="max-w-[260px] text-xs">
                                          {driverWarning}
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                </div>

                                <div className="flex flex-wrap gap-1.5">
                                  {vehicle.features.length > 0 ? vehicle.features.slice(0, 2).map((feature) => (
                                    <span
                                      key={feature}
                                      className="inline-flex items-center rounded-full border border-[hsl(var(--gold)/0.24)] bg-[hsl(var(--gold-soft)/0.3)] px-2.5 py-1 text-[11px] font-medium text-[hsl(var(--gold-deep))]"
                                    >
                                      {feature}
                                    </span>
                                  )) : (
                                    <span className="text-[12px] text-muted-foreground">Direct inzetbaar</span>
                                  )}
                                  {overdueForVehicle && (
                                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                                      Onderhoud nodig
                                    </span>
                                  )}
                                </div>

                                <div className="grid grid-cols-2 gap-2 pt-1">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handlePlanVehicle(vehicle);
                                    }}
                                    className="btn-luxe btn-luxe--primary h-9 justify-center px-3 text-sm"
                                  >
                                    Plan rit
                                  </button>
                                  <Link
                                    to={`/vloot/${vehicle.id}`}
                                    onClick={(event) => event.stopPropagation()}
                                    className="inline-flex h-9 items-center justify-center rounded-[0.9rem] border border-[hsl(var(--gold)/0.16)] bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-[hsl(var(--gold-soft)/0.18)]"
                                  >
                                    Details
                                  </Link>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>

                <aside className="card--luxe p-4 xl:sticky xl:top-4 xl:self-start">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))]" style={{ fontFamily: "var(--font-display)" }}>
                        Fleet Desk
                      </p>
                      <h2 className="mt-1 text-xl font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
                        {selectedVehicle ? selectedVehicle.name : "Voertuigdetails"}
                      </h2>
                    </div>
                  </div>

                  {!selectedVehicle || !selectedVehicleStatus ? (
                    <div className="rounded-[1rem] border border-[hsl(var(--gold)/0.1)] bg-[hsl(var(--gold-soft)/0.08)] px-4 py-10 text-center">
                      <p className="text-sm font-medium text-foreground">Selecteer een voertuig</p>
                      <p className="mt-1 text-xs text-muted-foreground">Dan verschijnt de operationele context hier.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-[1.1rem] border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.08)] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${selectedVehicleStatus.textClass}`}>
                              <span className={`h-2 w-2 rounded-full ${selectedVehicleStatus.dotClass}`} />
                              {selectedVehicleStatus.label}
                            </span>
                            <p className="mt-3 text-[2rem] font-semibold leading-none text-foreground" style={{ fontFamily: "var(--font-display)" }}>
                              {selectedVehicle.plate}
                            </p>
                            <p className="mt-2 text-sm text-muted-foreground">
                              {(selectedVehicle.brand || "Onbekend merk")} - {selectedVehicle.code}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-[1rem] border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--background))] p-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <User className="h-4 w-4" />
                            <span className="text-xs uppercase tracking-[0.12em]">Chauffeur</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAssignDriver(selectedVehicle)}
                            className="inline-flex h-8 items-center rounded-[0.8rem] border border-[hsl(var(--gold)/0.14)] px-3 text-xs font-medium text-foreground transition-colors hover:bg-[hsl(var(--gold-soft)/0.18)]"
                          >
                            Toewijzen
                          </button>
                        </div>
                        <p className="text-sm font-medium text-foreground">{selectedVehicle.assignedDriver || "Geen chauffeur toegewezen"}</p>
                        {selectedVehicleDriverWarning && (
                          <p className="mt-1 text-xs text-amber-700">{selectedVehicleDriverWarning}</p>
                        )}
                      </div>

                      <div className="rounded-[1rem] border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--background))] p-3">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Gauge className="h-4 w-4" />
                          <span className="text-xs uppercase tracking-[0.12em]">Belading</span>
                        </div>
                        <div className="mt-2 flex items-end justify-between gap-3">
                          <p className="text-sm font-medium text-foreground">{selectedVehicleUtilization}% benut</p>
                          <p className="text-xs text-muted-foreground">Live inschatting</p>
                        </div>
                        <div className="mt-3">
                          <Progress value={selectedVehicleUtilization} className="h-1.5 bg-[hsl(var(--gold-soft)/0.35)] [&>div]:bg-emerald-500" />
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
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <ShieldCheck className="h-4 w-4" />
                            <span className="text-xs uppercase tracking-[0.12em]">Certificeringen</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleOpenVehicleDetail(selectedVehicle, "documents")}
                            className="inline-flex h-8 items-center rounded-[0.8rem] border border-[hsl(var(--gold)/0.14)] px-3 text-xs font-medium text-foreground transition-colors hover:bg-[hsl(var(--gold-soft)/0.18)]"
                          >
                            Beheren
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedVehicle.features.length > 0 ? selectedVehicle.features.map((feature) => (
                            <span
                              key={feature}
                              className="inline-flex items-center rounded-full border border-[hsl(var(--gold)/0.25)] bg-[hsl(var(--gold-soft)/0.3)] px-2.5 py-1 text-[11px] text-[hsl(var(--gold-deep))]"
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
                          <p className="text-xs text-muted-foreground">Geen achterstallig onderhoud.</p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleOpenVehicleDetail(selectedVehicle)}
                        className="btn-luxe btn-luxe--primary w-full justify-center"
                      >
                        Open voertuigdetail
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </aside>
              </div>
            )}
          </TabsContent>

          <TabsContent value="types" className="mt-0">
            <DeferredMount label="Voertuigtypes laden">
              <VehicleTypesSection />
            </DeferredMount>
          </TabsContent>
        </div>
      </Tabs>

      <NewVehicleDialog open={showNewDialog} onOpenChange={setShowNewDialog} />
    </div>
  );
}
