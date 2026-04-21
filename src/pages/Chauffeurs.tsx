import { useState, useMemo } from "react";
import {
  Plus,
  Users,
  Filter,
  Mail,
  Phone,
  MoreHorizontal,
  Edit2,
  Trash2,
  UserCheck,
  Truck,
  Bed,
  HeartPulse,
  LayoutGrid,
  Table as TableIcon,
  Download,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/SearchInput";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { QueryError } from "@/components/QueryError";
import { useDrivers, type Driver } from "@/hooks/useDrivers";
import { useDriverCertifications } from "@/hooks/useDriverCertifications";
import { useFleetVehicles } from "@/hooks/useFleet";
import { NewDriverDialog } from "@/components/drivers/NewDriverDialog";
import { DriverCertificationsSection } from "@/components/drivers/DriverCertificationsSection";
import { daysUntil } from "@/lib/validation/driverSchema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  beschikbaar: {
    label: "Beschikbaar",
    className: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
    Icon: UserCheck,
  },
  onderweg: {
    label: "Onderweg",
    className: "bg-blue-500/10 text-blue-700 border-blue-200",
    Icon: Truck,
  },
  rust: {
    label: "Rust",
    className: "bg-amber-500/10 text-amber-700 border-amber-200",
    Icon: Bed,
  },
  ziek: {
    label: "Ziek",
    className: "bg-destructive/10 text-destructive border-destructive/20",
    Icon: HeartPulse,
  },
};

type ViewMode = "cards" | "table";
type SortKey = "name" | "status" | "hours" | "expiry";

function initialsOf(name: string): string {
  const clean = name.trim().split(/\s+/);
  if (clean.length === 0) return "?";
  if (clean.length === 1) return clean[0].slice(0, 2).toUpperCase();
  return (clean[0][0] + clean[clean.length - 1][0]).toUpperCase();
}

function nextExpiry(d: Driver): { iso: string; days: number } | null {
  const candidates: Array<{ iso: string | null }> = [
    { iso: d.legitimation_expiry_date },
    { iso: d.code95_expiry_date },
  ];
  const parsed = candidates
    .map((c) => (c.iso ? { iso: c.iso, days: daysUntil(c.iso) ?? Number.POSITIVE_INFINITY } : null))
    .filter((x): x is { iso: string; days: number } => x !== null);
  if (parsed.length === 0) return null;
  parsed.sort((a, b) => a.days - b.days);
  return parsed[0];
}

export default function Chauffeurs() {
  const { data: drivers = [], isLoading, isError, refetch, deleteDriver } = useDrivers();
  const { data: certifications = [] } = useDriverCertifications();
  const { data: vehicles = [] } = useFleetVehicles();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [certFilter, setCertFilter] = useState("all");
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [activeTab, setActiveTab] = useState("chauffeurs");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [showDialog, setShowDialog] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<Driver | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<Driver | null>(null);

  const vehicleMap = useMemo(() => {
    const m: Record<string, { name: string; plate: string }> = {};
    for (const v of vehicles) m[v.id] = { name: v.name, plate: v.plate };
    return m;
  }, [vehicles]);

  const activeCertifications = useMemo(
    () => certifications.filter((c) => c.is_active),
    [certifications],
  );

  const certLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of certifications) map[c.code] = c.name;
    return map;
  }, [certifications]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = drivers.filter((d) => {
      const matchesSearch =
        !q ||
        d.name.toLowerCase().includes(q) ||
        (d.email?.toLowerCase().includes(q) ?? false) ||
        (d.license_number?.toLowerCase().includes(q) ?? false) ||
        (d.phone?.toLowerCase().includes(q) ?? false) ||
        (d.personnel_number?.toLowerCase().includes(q) ?? false);

      const matchesStatus = statusFilter === "all" || d.status === statusFilter;
      const matchesCert = certFilter === "all" || d.certifications.includes(certFilter);
      const matchesVehicle =
        vehicleFilter === "all" ||
        (vehicleFilter === "none" && !d.current_vehicle_id) ||
        (vehicleFilter === "any" && d.current_vehicle_id);

      return matchesSearch && matchesStatus && matchesCert && matchesVehicle;
    });

    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case "status":
          return (a.status ?? "").localeCompare(b.status ?? "");
        case "hours":
          return (b.contract_hours_per_week ?? 0) - (a.contract_hours_per_week ?? 0);
        case "expiry": {
          const aDays = nextExpiry(a)?.days ?? Number.POSITIVE_INFINITY;
          const bDays = nextExpiry(b)?.days ?? Number.POSITIVE_INFINITY;
          return aDays - bDays;
        }
        default:
          return a.name.localeCompare(b.name);
      }
    });

    return list;
  }, [drivers, search, statusFilter, certFilter, vehicleFilter, sortKey]);

  const stats = useMemo(() => {
    let expiring = 0;
    for (const d of drivers) {
      const e = nextExpiry(d);
      if (e && e.days <= 60) expiring++;
    }
    return {
      totaal: drivers.length,
      beschikbaar: drivers.filter((d) => d.status === "beschikbaar").length,
      onderweg: drivers.filter((d) => d.status === "onderweg").length,
      afwezig: drivers.filter((d) => d.status === "ziek" || d.status === "rust").length,
      verlopend: expiring,
    };
  }, [drivers]);

  const handleAdd = () => {
    setSelectedDriver(undefined);
    setShowDialog(true);
  };

  const handleEdit = (driver: Driver) => {
    setSelectedDriver(driver);
    setShowDialog(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDriver.mutateAsync(deleteTarget.id);
      toast.success(`Chauffeur ${deleteTarget.name} verwijderd`);
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err?.message ?? "Fout bij verwijderen");
    }
  };

  const exportCsv = () => {
    const header = [
      "naam",
      "personeelsnummer",
      "email",
      "telefoon",
      "status",
      "voertuig",
      "dienstverband",
      "contracturen",
      "indienst",
      "rijbewijs_tot",
      "code95_tot",
    ];
    const rows = filtered.map((d) => [
      d.name,
      d.personnel_number ?? "",
      d.email ?? "",
      d.phone ?? "",
      d.status,
      d.current_vehicle_id ? vehicleMap[d.current_vehicle_id]?.plate ?? "" : "",
      d.employment_type,
      d.contract_hours_per_week?.toString() ?? "",
      d.hire_date ?? "",
      d.legitimation_expiry_date ?? "",
      d.code95_expiry_date ?? "",
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chauffeurs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasDrivers = drivers.length > 0;

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background/50">
      <div className="flex items-center justify-between px-4 md:px-6 py-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight font-display">
            Chauffeurs
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {stats.totaal} chauffeurs, {stats.beschikbaar} beschikbaar
          </p>
        </div>
        {activeTab === "chauffeurs" ? (
          <Button
            onClick={handleAdd}
            className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 rounded-xl shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Chauffeur Toevoegen
          </Button>
        ) : null}
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col min-h-0"
      >
        <div className="px-4 md:px-6">
          <TabsList>
            <TabsTrigger value="chauffeurs">Chauffeurs</TabsTrigger>
            <TabsTrigger value="certificeringen">Certificeringen</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="chauffeurs" className="flex-1 flex flex-col min-h-0 mt-4">
          {/* KPI */}
          <div className="px-4 md:px-6 pb-6 grid grid-cols-2 sm:grid-cols-5 gap-3">
            <KpiCard label="Totaal" value={stats.totaal} color="text-blue-600" bg="bg-blue-500/8" Icon={Users} />
            <KpiCard label="Beschikbaar" value={stats.beschikbaar} color="text-emerald-600" bg="bg-emerald-500/8" Icon={UserCheck} />
            <KpiCard label="Onderweg" value={stats.onderweg} color="text-blue-500" bg="bg-blue-500/8" Icon={Truck} />
            <KpiCard label="Rust of ziek" value={stats.afwezig} color="text-amber-600" bg="bg-amber-500/8" Icon={Bed} />
            <KpiCard
              label="Verlopend 60d"
              value={stats.verlopend}
              color={stats.verlopend > 0 ? "text-destructive" : "text-muted-foreground"}
              bg={stats.verlopend > 0 ? "bg-destructive/8" : "bg-muted/20"}
              Icon={AlertTriangle}
            />
          </div>

          {/* Filters */}
          <div className="px-4 md:px-6 pb-4 flex flex-wrap items-center gap-3">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Zoek op naam, email, telefoon, rijbewijs, personeelsnr..."
              className="max-w-sm flex-1"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px] h-10 rounded-xl border-border/50 bg-card/30">
                <Filter className="h-3.5 w-3.5 mr-2 text-muted-foreground/50" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border/50">
                <SelectItem value="all">Alle statussen</SelectItem>
                <SelectItem value="beschikbaar">Beschikbaar</SelectItem>
                <SelectItem value="onderweg">Onderweg</SelectItem>
                <SelectItem value="rust">Rust</SelectItem>
                <SelectItem value="ziek">Ziek</SelectItem>
              </SelectContent>
            </Select>
            <Select value={certFilter} onValueChange={setCertFilter}>
              <SelectTrigger className="w-[170px] h-10 rounded-xl border-border/50 bg-card/30">
                <SelectValue placeholder="Certificering" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border/50">
                <SelectItem value="all">Alle cert.</SelectItem>
                {activeCertifications.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
              <SelectTrigger className="w-[150px] h-10 rounded-xl border-border/50 bg-card/30">
                <SelectValue placeholder="Voertuig" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border/50">
                <SelectItem value="all">Alle voertuigen</SelectItem>
                <SelectItem value="any">Met voertuig</SelectItem>
                <SelectItem value="none">Zonder voertuig</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
              <SelectTrigger className="w-[160px] h-10 rounded-xl border-border/50 bg-card/30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border/50">
                <SelectItem value="name">Sorteer op naam</SelectItem>
                <SelectItem value="status">Sorteer op status</SelectItem>
                <SelectItem value="hours">Sorteer op uren</SelectItem>
                <SelectItem value="expiry">Vervalt eerst</SelectItem>
              </SelectContent>
            </Select>

            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={exportCsv}
                className="h-10 rounded-xl gap-2"
              >
                <Download className="h-3.5 w-3.5" />
                CSV
              </Button>
              <div className="h-10 rounded-xl border border-border/50 bg-card/30 flex items-center p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("cards")}
                  className={`h-full px-2 rounded-lg flex items-center gap-1 text-xs ${
                    viewMode === "cards" ? "bg-primary/10 text-primary" : "text-muted-foreground"
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" /> Kaart
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className={`h-full px-2 rounded-lg flex items-center gap-1 text-xs ${
                    viewMode === "table" ? "bg-primary/10 text-primary" : "text-muted-foreground"
                  }`}
                >
                  <TableIcon className="h-3.5 w-3.5" /> Tabel
                </button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="px-4 md:px-6 pb-8 flex-1 overflow-auto">
            {isLoading ? (
              <SkeletonGrid />
            ) : isError ? (
              <QueryError
                message="Kan chauffeurs niet laden. Probeer het opnieuw."
                onRetry={() => refetch()}
              />
            ) : !hasDrivers ? (
              <div className="text-center py-20 bg-card/30 rounded-3xl border border-dashed border-border/60">
                <Users className="h-12 w-12 mx-auto text-muted-foreground/20 mb-4" />
                <p className="text-muted-foreground font-medium mb-3">
                  Nog geen chauffeurs in het systeem.
                </p>
                <Button
                  onClick={handleAdd}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 rounded-xl"
                >
                  <Plus className="h-4 w-4" />
                  Eerste chauffeur toevoegen
                </Button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20 bg-card/30 rounded-3xl border border-dashed border-border/60">
                <Users className="h-12 w-12 mx-auto text-muted-foreground/20 mb-4" />
                <p className="text-muted-foreground font-medium">
                  Geen chauffeurs die voldoen aan de filters. Pas de filters aan.
                </p>
              </div>
            ) : viewMode === "table" ? (
              <DriversTable
                drivers={filtered}
                vehicleMap={vehicleMap}
                certLabels={certLabels}
                onEdit={handleEdit}
                onDelete={(d) => setDeleteTarget(d)}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map((d) => (
                  <DriverCard
                    key={d.id}
                    driver={d}
                    vehicleMap={vehicleMap}
                    certLabels={certLabels}
                    onEdit={() => handleEdit(d)}
                    onDelete={() => setDeleteTarget(d)}
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent
          value="certificeringen"
          className="flex-1 overflow-auto mt-4 px-4 md:px-6 pb-8"
        >
          <DriverCertificationsSection />
        </TabsContent>
      </Tabs>

      <NewDriverDialog open={showDialog} onOpenChange={setShowDialog} driver={selectedDriver} />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Chauffeur verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? (
                <>
                  <span className="font-medium">{deleteTarget.name}</span> wordt uit het systeem
                  verwijderd. Gekoppelde uren en historie blijven bestaan, maar toekomstige
                  koppelingen en rapportages worden beïnvloed. Wil je doorgaan?
                </>
              ) : (
                "Weet je het zeker?"
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function KpiCard({
  label,
  value,
  color,
  bg,
  Icon,
}: {
  label: string;
  value: number;
  color: string;
  bg: string;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="border-border/40 shadow-none bg-card/50 backdrop-blur-sm">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${bg}`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
        <div>
          <p className="text-2xl font-bold font-display tracking-tight tabular-nums">{value}</p>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
            {label}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border/40 bg-card/30 p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-24 bg-muted animate-pulse rounded" />
              <div className="h-2 w-16 bg-muted animate-pulse rounded" />
            </div>
          </div>
          <div className="h-2 w-full bg-muted animate-pulse rounded" />
          <div className="h-2 w-3/4 bg-muted animate-pulse rounded" />
          <div className="h-8 w-full bg-muted animate-pulse rounded" />
        </div>
      ))}
    </div>
  );
}

interface DriverCardProps {
  driver: Driver;
  vehicleMap: Record<string, { name: string; plate: string }>;
  certLabels: Record<string, string>;
  onEdit: () => void;
  onDelete: () => void;
}

function DriverCard({ driver: d, vehicleMap, certLabels, onEdit, onDelete }: DriverCardProps) {
  const statusCfg = STATUS_CONFIG[d.status] || STATUS_CONFIG.beschikbaar;
  const StatusIcon = statusCfg.Icon;
  const vehicle = d.current_vehicle_id ? vehicleMap[d.current_vehicle_id] : null;
  const expiry = nextExpiry(d);

  return (
    <Card className="group hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 border-border/40 overflow-hidden bg-card/50">
      <CardContent className="p-0">
        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                {initialsOf(d.name)}
              </div>
              <div>
                <h3 className="font-semibold text-foreground line-clamp-1">{d.name}</h3>
                <Badge
                  variant="outline"
                  className={`mt-1 h-5 text-xs px-1.5 font-bold uppercase tracking-wider border-none ${statusCfg.className}`}
                >
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {statusCfg.label}
                </Badge>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-8 w-8 p-0 hover:bg-primary/5 transition-colors"
                >
                  <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-xl border-border/50">
                <DropdownMenuItem
                  className="gap-2 focus:bg-primary/5 cursor-pointer"
                  onClick={onEdit}
                >
                  <Edit2 className="h-3.5 w-3.5" /> Bewerken
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2 text-destructive focus:bg-destructive/5 focus:text-destructive cursor-pointer"
                  onClick={onDelete}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Verwijderen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="space-y-2">
            {d.email && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                <span className="truncate">{d.email}</span>
              </div>
            )}
            {d.phone && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Phone className="h-3.5 w-3.5" />
                <span>{d.phone}</span>
              </div>
            )}
            {d.personnel_number && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <UserCheck className="h-3.5 w-3.5" />
                <span className="font-mono">{d.personnel_number}</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 min-h-[1.5rem]">
            {d.certifications.length > 0 ? (
              d.certifications.map((cert) => (
                <Badge
                  key={cert}
                  variant="secondary"
                  className="text-xs px-2 py-0 bg-primary/5 text-primary border-none font-medium"
                >
                  {certLabels[cert] ?? cert}
                </Badge>
              ))
            ) : (
              <span className="text-xs text-muted-foreground italic">Geen certificeringen</span>
            )}
          </div>

          {expiry && expiry.days <= 60 && (
            <div
              className={`flex items-center gap-1 text-xs ${
                expiry.days < 0 ? "text-destructive" : "text-amber-600"
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {expiry.days < 0
                ? `Document verlopen (${Math.abs(expiry.days)} dagen geleden)`
                : `Document verloopt over ${expiry.days} dagen`}
            </div>
          )}
        </div>

        <div className="px-5 py-3 bg-muted/20 border-t border-border/20 flex items-center justify-between text-xs">
          <span className="text-muted-foreground font-medium uppercase tracking-widest">
            Voertuig
          </span>
          <span className="font-semibold text-foreground">
            {vehicle ? vehicle.plate : "Geen koppeling"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function DriversTable({
  drivers,
  vehicleMap,
  certLabels,
  onEdit,
  onDelete,
}: {
  drivers: Driver[];
  vehicleMap: Record<string, { name: string; plate: string }>;
  certLabels: Record<string, string>;
  onEdit: (d: Driver) => void;
  onDelete: (d: Driver) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border/40 bg-card/30">
      <table className="w-full text-sm">
        <thead className="bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <Th>Naam</Th>
            <Th>Personeelsnr</Th>
            <Th>Status</Th>
            <Th>Voertuig</Th>
            <Th>Dienstverband</Th>
            <Th>Uren</Th>
            <Th>Certs</Th>
            <Th>Vervalt</Th>
            <Th className="text-right">Acties</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/30">
          {drivers.map((d) => {
            const statusCfg = STATUS_CONFIG[d.status] ?? STATUS_CONFIG.beschikbaar;
            const vehicle = d.current_vehicle_id ? vehicleMap[d.current_vehicle_id] : null;
            const expiry = nextExpiry(d);
            return (
              <tr key={d.id} className="hover:bg-muted/20">
                <Td>
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-[11px]">
                      {initialsOf(d.name)}
                    </div>
                    <span className="font-medium">{d.name}</span>
                  </div>
                </Td>
                <Td>
                  <span className="font-mono text-xs text-muted-foreground">
                    {d.personnel_number ?? "—"}
                  </span>
                </Td>
                <Td>
                  <Badge
                    variant="outline"
                    className={`h-5 text-[10px] px-1.5 font-bold uppercase tracking-wider border-none ${statusCfg.className}`}
                  >
                    {statusCfg.label}
                  </Badge>
                </Td>
                <Td>
                  <span className="font-mono text-xs">{vehicle ? vehicle.plate : "—"}</span>
                </Td>
                <Td>
                  <span className="capitalize text-xs">{d.employment_type}</span>
                </Td>
                <Td>
                  <span className="tabular-nums text-xs">
                    {d.contract_hours_per_week ?? "—"}
                  </span>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1 max-w-[160px]">
                    {d.certifications.slice(0, 3).map((c) => (
                      <span
                        key={c}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-primary/5 text-primary"
                      >
                        {certLabels[c] ?? c}
                      </span>
                    ))}
                    {d.certifications.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{d.certifications.length - 3}
                      </span>
                    )}
                  </div>
                </Td>
                <Td>
                  {expiry ? (
                    <span
                      className={
                        expiry.days < 0
                          ? "text-xs text-destructive"
                          : expiry.days < 60
                          ? "text-xs text-amber-600"
                          : "text-xs text-muted-foreground"
                      }
                    >
                      {expiry.days < 0 ? "verlopen" : `${expiry.days}d`}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => onEdit(d)}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/5"
                      onClick={() => onDelete(d)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 text-left font-semibold ${className ?? ""}`}>{children}</th>;
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 ${className ?? ""}`}>{children}</td>;
}
