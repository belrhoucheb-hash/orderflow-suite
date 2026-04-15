import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Truck, FileText, Wrench, CalendarDays, BarChart3, AlertTriangle, Plus, CheckCircle2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useVehicleById, useVehicleDocuments, useVehicleMaintenance, useVehicleAvailability, useCompleteMaintenance } from "@/hooks/useFleet";
import { useBaselineInfo } from "@/hooks/useVehicleCheck";
import { useAuth } from "@/contexts/AuthContext";
import { VehicleCheckScreen } from "@/components/chauffeur/VehicleCheckScreen";
import { MaintenanceDialog } from "@/components/fleet/MaintenanceDialog";
import { DocumentDialog } from "@/components/fleet/DocumentDialog";
import { format, differenceInDays, startOfWeek, addDays } from "date-fns";
import { nl } from "date-fns/locale";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  beschikbaar: { label: "Beschikbaar", className: "bg-emerald-500/10 text-emerald-700 border-emerald-200" },
  onderweg: { label: "Onderweg", className: "bg-blue-500/10 text-blue-700 border-blue-200" },
  onderhoud: { label: "Onderhoud", className: "bg-amber-500/10 text-amber-700 border-amber-200" },
  defect: { label: "Defect", className: "bg-destructive/10 text-destructive border-destructive/20" },
};

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

export default function VehicleDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: vehicle, isLoading } = useVehicleById(id);
  
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 6);
  
  const { data: documents } = useVehicleDocuments(id);
  const { data: maintenance } = useVehicleMaintenance(id);
  const { data: availability } = useVehicleAvailability(
    id,
    format(weekStart, "yyyy-MM-dd"),
    format(addDays(weekStart, 27), "yyyy-MM-dd")
  );
  const completeMaintenance = useCompleteMaintenance();
  const [showMaintenanceDialog, setShowMaintenanceDialog] = useState(false);
  const [showDocumentDialog, setShowDocumentDialog] = useState(false);
  const [baselineSeedActive, setBaselineSeedActive] = useState(false);
  const { effectiveRole } = useAuth();
  const { data: baselineInfo } = useBaselineInfo(id ?? null);
  const isAdmin = effectiveRole === "admin";

  const availMap = useMemo(() => {
    const m: Record<string, string> = {};
    availability?.forEach((a) => { m[a.date] = a.status; });
    return m;
  }, [availability]);

  if (isLoading) return <LoadingState message="Voertuig laden..." />;
  if (!vehicle) return <EmptyState icon={Truck} title="Voertuig niet gevonden" description="Het gevraagde voertuig bestaat niet of is verwijderd." />;

  const statusCfg = STATUS_CONFIG[vehicle.status] || STATUS_CONFIG.beschikbaar;

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
      {/* Header */}
      <div className="flex items-center gap-4 px-4 md:px-6 py-6 border-b border-border">
        <Button variant="ghost" size="icon" onClick={() => navigate("/vloot")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader
          title={vehicle.name}
          subtitle={`${vehicle.plate} \u00B7 ${vehicle.code}`}
          actions={
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {baselineDateLabel && (
                <Badge
                  variant="outline"
                  className="gap-1.5 bg-[hsl(var(--gold-soft))/0.5] text-[hsl(var(--gold-deep))] border-[hsl(var(--gold))/0.4]"
                >
                  <ShieldCheck className="h-3 w-3" strokeWidth={1.75} />
                  Baseline gezet op {baselineDateLabel}
                </Badge>
              )}
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBaselineSeedActive(true)}
                  className="gap-1.5"
                >
                  <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Baseline instellen
                </Button>
              )}
              <Badge variant="outline" className={statusCfg.className}>{statusCfg.label}</Badge>
            </div>
          }
          className="flex-1"
        />
      </div>

      <div className="px-4 md:px-6 py-6 flex-1">
        <Tabs defaultValue="specs" className="space-y-6">
          <TabsList>
            <TabsTrigger value="specs" className="gap-1.5"><Truck className="h-3.5 w-3.5" strokeWidth={1.5} />Specificaties</TabsTrigger>
            <TabsTrigger value="docs" className="gap-1.5"><FileText className="h-3.5 w-3.5" strokeWidth={1.5} />Documenten</TabsTrigger>
            <TabsTrigger value="maintenance" className="gap-1.5"><Wrench className="h-3.5 w-3.5" strokeWidth={1.5} />Onderhoud</TabsTrigger>
            <TabsTrigger value="availability" className="gap-1.5"><CalendarDays className="h-3.5 w-3.5" strokeWidth={1.5} />Beschikbaarheid</TabsTrigger>
            <TabsTrigger value="performance" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" strokeWidth={1.5} />Prestaties</TabsTrigger>
          </TabsList>

          {/* Specificaties */}
          <TabsContent value="specs">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Voertuiggegevens</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <Row label="Type" value={vehicle.type} />
                  <Row label="Merk" value={vehicle.brand || "—"} />
                  <Row label="Bouwjaar" value={vehicle.buildYear?.toString() || "—"} />
                  <Row label="Kenteken" value={vehicle.plate} />
                  <Row label="Chauffeur" value={vehicle.assignedDriver || "Niet toegewezen"} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Capaciteit & Uitrusting</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <Row label="Max gewicht" value={`${vehicle.capacityKg.toLocaleString()} kg`} />
                  <Row label="Palletplaatsen" value={vehicle.capacityPallets.toString()} />
                  <Row label="Laadruimte (LxBxH)" value={
                    vehicle.cargoLengthCm && vehicle.cargoWidthCm && vehicle.cargoHeightCm
                      ? `${vehicle.cargoLengthCm} × ${vehicle.cargoWidthCm} × ${vehicle.cargoHeightCm} cm`
                      : "—"
                  } />
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-muted-foreground">Uitrusting</span>
                    <div className="flex gap-1.5">
                      {vehicle.features.length > 0 ? vehicle.features.map((f) => (
                        <Badge key={f} variant="secondary" className="text-xs">{f}</Badge>
                      )) : <span className="text-sm text-muted-foreground">—</span>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Documenten */}
          <TabsContent value="docs">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Documenten & Keuringen</CardTitle>
                <Button size="sm" variant="outline" onClick={() => setShowDocumentDialog(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Document Toevoegen
                </Button>
              </CardHeader>
              <CardContent>
                {!documents || documents.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">Geen documenten geregistreerd</p>
                ) : (
                  <div className="space-y-3">
                    {documents.map((doc) => {
                      const daysLeft = doc.expiry_date ? differenceInDays(new Date(doc.expiry_date), today) : null;
                      const isWarning = daysLeft !== null && daysLeft < 30 && daysLeft >= 0;
                      const isExpired = daysLeft !== null && daysLeft < 0;
                      return (
                        <div key={doc.id} className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
                          <div className="flex items-center gap-3">
                            <FileText className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                            <div>
                              <p className="text-sm font-medium text-foreground">{DOC_LABELS[doc.doc_type] || doc.doc_type}</p>
                              {doc.notes && <p className="text-xs text-muted-foreground">{doc.notes}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {doc.expiry_date && (
                              <span className="text-xs text-muted-foreground">
                                Verloopt {format(new Date(doc.expiry_date), "d MMM yyyy", { locale: nl })}
                              </span>
                            )}
                            {isExpired && (
                              <Badge variant="destructive" className="text-xs gap-1">
                                <AlertTriangle className="h-3 w-3" strokeWidth={1.5} />Verlopen
                              </Badge>
                            )}
                            {isWarning && (
                              <Badge className="bg-amber-500/10 text-amber-700 border-amber-200 text-xs gap-1">
                                <AlertTriangle className="h-3 w-3" strokeWidth={1.5} />{daysLeft}d
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Onderhoud */}
          <TabsContent value="maintenance">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Onderhoudslogboek</CardTitle>
                <Button size="sm" variant="outline" onClick={() => setShowMaintenanceDialog(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Onderhoud Plannen
                </Button>
              </CardHeader>
              <CardContent>
                {!maintenance || maintenance.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">Geen onderhoud geregistreerd</p>
                ) : (
                  <div className="space-y-3">
                    {maintenance.map((m) => {
                      const isCompleted = !!m.completed_date;
                      const isOverdue = !isCompleted && m.scheduled_date && new Date(m.scheduled_date) < today;
                      const isScheduled = !isCompleted && !isOverdue;
                      return (
                        <div key={m.id} className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
                          <div className="flex items-center gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-foreground">
                                  {MAINTENANCE_LABELS[m.maintenance_type] || m.description || m.maintenance_type}
                                </p>
                                {isCompleted && (
                                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-200 text-xs">
                                    Uitgevoerd
                                  </Badge>
                                )}
                                {isScheduled && (
                                  <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-200 text-xs">
                                    Gepland
                                  </Badge>
                                )}
                                {isOverdue && (
                                  <Badge variant="destructive" className="text-xs gap-1">
                                    <AlertTriangle className="h-3 w-3" strokeWidth={1.5} />VERLOPEN
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {m.completed_date
                                  ? `Uitgevoerd ${format(new Date(m.completed_date), "d MMM yyyy", { locale: nl })}`
                                  : m.scheduled_date
                                  ? `Gepland ${format(new Date(m.scheduled_date), "d MMM yyyy", { locale: nl })}`
                                  : "Geen datum"}
                                {m.mileage_km && ` \u00B7 ${m.mileage_km.toLocaleString()} km`}
                              </p>
                              {m.description && m.description !== m.maintenance_type && (
                                <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {m.cost !== null && m.cost !== undefined && (
                              <span className="text-sm font-medium text-foreground">{"\u20AC"}{m.cost.toLocaleString()}</span>
                            )}
                            {!isCompleted && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                disabled={completeMaintenance.isPending}
                                onClick={() => {
                                  completeMaintenance.mutate(
                                    { id: m.id, vehicleId: m.vehicle_id },
                                    { onSuccess: () => toast.success("Onderhoud afgerond") }
                                  );
                                }}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-1" />Afronden
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Beschikbaarheid */}
          <TabsContent value="availability">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Weekoverzicht Beschikbaarheid</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[0, 1, 2, 3].map((weekOffset) => {
                    const ws = addDays(weekStart, weekOffset * 7);
                    return (
                      <div key={weekOffset}>
                        <p className="text-xs text-muted-foreground mb-2 font-medium">
                          Week {format(ws, "w")} — {format(ws, "d MMM", { locale: nl })}
                        </p>
                        <div className="grid grid-cols-7 gap-1.5">
                          {Array.from({ length: 7 }).map((_, dayIdx) => {
                            const d = addDays(ws, dayIdx);
                            const dateStr = format(d, "yyyy-MM-dd");
                            const dayStatus = availMap[dateStr] || "beschikbaar";
                            const color = dayStatus === "beschikbaar"
                              ? "bg-emerald-500/20 border-emerald-300"
                              : dayStatus === "niet_beschikbaar"
                              ? "bg-destructive/15 border-destructive/30"
                              : "bg-muted border-border";
                            return (
                              <div key={dayIdx} className={`rounded-lg border p-2 text-center ${color}`}>
                                <p className="text-xs text-muted-foreground">{format(d, "EEE", { locale: nl })}</p>
                                <p className="text-sm font-medium text-foreground">{format(d, "d")}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-4 mt-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded bg-emerald-500/20 border border-emerald-300" />Beschikbaar</div>
                  <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded bg-muted border border-border" />Niet ingepland</div>
                  <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded bg-destructive/15 border border-destructive/30" />Niet beschikbaar</div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Prestaties */}
          <TabsContent value="performance">
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function KPICard({ title, value, unit }: { title: string; value: string; unit: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{title}</p>
        <div className="flex items-baseline gap-1 mt-2">
          <span className="text-2xl font-semibold text-foreground">{value}</span>
          <span className="text-sm text-muted-foreground">{unit}</span>
        </div>
      </CardContent>
    </Card>
  );
}
