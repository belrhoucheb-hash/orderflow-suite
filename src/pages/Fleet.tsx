import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Plus, Truck, Filter, Search, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFleetVehicles, useVehicleUtilization, useUpcomingMaintenance, type Vehicle } from "@/hooks/useFleet";
import { NewVehicleDialog } from "@/components/fleet/NewVehicleDialog";
import { VehicleTypesSection } from "@/components/fleet/VehicleTypesSection";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

const TYPE_LABELS: Record<string, string> = {
  busje: "Busje",
  bakwagen: "Bakwagen",
  koelwagen: "Koelwagen",
  trekker: "Trekker",
};

const TYPE_ORDER = ["busje", "bakwagen", "koelwagen", "trekker"];

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  beschikbaar: { label: "Beschikbaar", className: "bg-emerald-500/10 text-emerald-700 border-emerald-200" },
  onderweg: { label: "Onderweg", className: "bg-blue-500/10 text-blue-700 border-blue-200" },
  onderhoud: { label: "Onderhoud", className: "bg-amber-500/10 text-amber-700 border-amber-200" },
  defect: { label: "Defect", className: "bg-destructive/10 text-destructive border-destructive/20" },
};

export default function Fleet() {
  const { data: vehicles, isLoading, isError, refetch } = useFleetVehicles();
  const { data: utilization } = useVehicleUtilization();
  const { data: overdueMaintenance } = useUpcomingMaintenance();
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

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="px-4 md:px-6 py-6">
        <PageHeader
          title="Vloot"
          subtitle={`${vehicles?.length ?? 0} voertuigen, ${vehicles?.filter((v) => v.status === "beschikbaar").length ?? 0} beschikbaar`}
          actions={
            activeTab === "voertuigen" ? (
              <Button onClick={() => setShowNewDialog(true)} className="btn-primary">
                <Plus className="h-4 w-4" />
                Voertuig Toevoegen
              </Button>
            ) : null
          }
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <div className="px-4 md:px-6">
          <TabsList>
            <TabsTrigger value="voertuigen">Voertuigen</TabsTrigger>
            <TabsTrigger value="types">Types</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="voertuigen" className="flex-1 flex flex-col min-h-0 mt-4">

      {/* Overdue maintenance warning */}
      {overdueMaintenance && overdueMaintenance.length > 0 && (
        <div className="px-4 md:px-6 pb-2">
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <p className="text-sm text-destructive font-medium">
              {new Set(overdueMaintenance.map((m) => m.vehicle_id)).size} voertuig{new Set(overdueMaintenance.map((m) => m.vehicle_id)).size !== 1 ? "en" : ""} {new Set(overdueMaintenance.map((m) => m.vehicle_id)).size !== 1 ? "hebben" : "heeft"} verlopen onderhoud
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="px-4 md:px-6 pb-4 flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Zoek op naam of kenteken..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[150px]"><Filter className="h-3.5 w-3.5 mr-2 text-muted-foreground" /><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle types</SelectItem>
            {TYPE_ORDER.map((t) => <SelectItem key={t} value={t}>{TYPE_LABELS[t] || t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle statussen</SelectItem>
            <SelectItem value="beschikbaar">Beschikbaar</SelectItem>
            <SelectItem value="onderweg">Onderweg</SelectItem>
            <SelectItem value="onderhoud">Onderhoud</SelectItem>
            <SelectItem value="defect">Defect</SelectItem>
          </SelectContent>
        </Select>
        <Select value={featureFilter} onValueChange={setFeatureFilter}>
          <SelectTrigger className="w-[170px]"><SelectValue placeholder="Certificering" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle cert.</SelectItem>
            <SelectItem value="adr">ADR</SelectItem>
            <SelectItem value="koel">Koeling</SelectItem>
            <SelectItem value="internationaal">Internationaal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Cards grouped by type */}
      <div className="px-4 md:px-6 flex-1 overflow-auto pb-8 space-y-8">
        {isLoading ? (
          <div className="loading-spinner">
            <Loader2 className="loading-spinner__icon" />
          </div>
        ) : isError ? (
          <EmptyState
            title="Kan voertuiggegevens niet laden"
            description="Controleer je verbinding en probeer opnieuw."
            action={
              <button onClick={() => refetch()} className="text-xs text-primary hover:underline">
                Opnieuw proberen
              </button>
            }
          />
        ) : Object.keys(grouped).length === 0 ? (
          <EmptyState
            icon={Truck}
            title="Geen voertuigen gevonden"
            description="Pas je filters aan of voeg een nieuw voertuig toe."
          />
        ) : (
          Object.entries(grouped).map(([type, items]) => (
            <div key={type}>
              <h2 className="section-label mb-3 flex items-center gap-2">
                <Truck className="h-4 w-4" />
                {TYPE_LABELS[type] || type} <span className="text-xs font-normal">({items.length})</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {items.map((v) => {
                  const statusCfg = STATUS_CONFIG[v.status] || STATUS_CONFIG.beschikbaar;
                  const util = getUtilization(v);
                  return (
                    <Link key={v.id} to={`/vloot/${v.id}`} className="block">
                    <Card
                      className="cursor-pointer hover:shadow-md transition-shadow border-border"
                    >
                      <CardContent className="p-5 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{v.name}</p>
                            <p className="text-xs text-muted-foreground font-mono mt-0.5">{v.plate}</p>
                          </div>
                          <Badge variant="outline" className={statusCfg.className}>
                            {statusCfg.label}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{v.capacityKg.toLocaleString()} kg</span>
                          <span>·</span>
                          <span>{v.capacityPallets} pallets</span>
                          {v.features.length > 0 && (
                            <>
                              <span>·</span>
                              {v.features.slice(0, 2).map((f) => (
                                <Badge key={f} variant="secondary" className="text-xs px-1.5 py-0">
                                  {f}
                                </Badge>
                              ))}
                            </>
                          )}
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Chauffeur</span>
                            <span className="text-foreground font-medium">{v.assignedDriver || "—"}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Beladingsgraad</span>
                            <span className="text-foreground font-medium">{util}%</span>
                          </div>
                          <Progress value={util} className="h-1.5" />
                        </div>
                      </CardContent>
                    </Card>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

        </TabsContent>

        <TabsContent value="types" className="flex-1 overflow-auto mt-4 px-4 md:px-6 pb-8">
          <VehicleTypesSection />
        </TabsContent>
      </Tabs>

      <NewVehicleDialog open={showNewDialog} onOpenChange={setShowNewDialog} />
    </div>
  );
}
