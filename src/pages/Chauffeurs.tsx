import { useState, useMemo, useEffect, useRef } from "react";
import {
  Plus,
  Users,
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
  Archive,
  ArchiveRestore,
  SlidersHorizontal,
  X,
  Rows3,
  BookmarkPlus,
  Bookmark,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/SearchInput";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent } from "@/components/ui/tabs";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryError } from "@/components/QueryError";
import { PageHeader } from "@/components/ui/PageHeader";
import { SortableHeader, type SortConfig } from "@/components/ui/SortableHeader";
import { useDrivers, type Driver } from "@/hooks/useDrivers";
import { useDriverCertifications } from "@/hooks/useDriverCertifications";
import { useDriverExternalHoursThisWeek } from "@/hooks/useDriverExternalHours";
import { useVehiclesRaw } from "@/hooks/useVehiclesRaw";
import { NewDriverDialog } from "@/components/drivers/NewDriverDialog";
import { DriverCertificationsSection } from "@/components/drivers/DriverCertificationsSection";
import { DriverCountryRestrictionsSection } from "@/components/drivers/DriverCountryRestrictionsSection";
import { DeferredMount } from "@/components/performance/DeferredMount";
import { daysUntil } from "@/lib/validation/driverSchema";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string; dot: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  beschikbaar: {
    label: "Beschikbaar",
    className: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
    Icon: UserCheck,
  },
  onderweg: {
    label: "Onderweg",
    className: "bg-blue-500/10 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
    Icon: Truck,
  },
  rust: {
    label: "Rust",
    className: "bg-amber-500/10 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
    Icon: Bed,
  },
  ziek: {
    label: "Ziek",
    className: "bg-destructive/10 text-destructive border-destructive/20",
    dot: "bg-destructive",
    Icon: HeartPulse,
  },
};

type ViewMode = "cards" | "table" | "compact";
type ActiveFilter = "active" | "archived" | "all";
type PendingAction = { driver: Driver; action: "archive" | "delete" };

type SavedView = {
  id: string;
  name: string;
  statusFilter: string;
  certFilter: string;
  vehicleFilter: string;
  activeFilter: ActiveFilter;
};

const SAVED_VIEWS_KEY = "orderflow:chauffeurs:saved-views:v1";

function isArchived(d: Driver): boolean {
  return d.is_active === false;
}

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

function loadSavedViews(): SavedView[] {
  try {
    const raw = localStorage.getItem(SAVED_VIEWS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function generateViewId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export default function Chauffeurs() {
  const {
    data: drivers = [],
    isLoading,
    isError,
    refetch,
    deleteDriver,
    archiveDriver,
    reactivateDriver,
    updateDriverStatus,
  } = useDrivers();
  const { data: certifications = [] } = useDriverCertifications();
  const { data: vehicles = [] } = useVehiclesRaw({ includeInactive: true });
  const { hoursByDriver: actualHoursByDriver } = useDriverExternalHoursThisWeek();

  const [search, setSearch] = useState("");

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 6) return "Nacht";
    if (h < 12) return "Goedemorgen";
    if (h < 18) return "Goedemiddag";
    return "Goedenavond";
  }, []);
  const [statusFilter, setStatusFilter] = useState("all");
  const [certFilter, setCertFilter] = useState("all");
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("active");
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [activeTab, setActiveTab] = useState("chauffeurs");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [showDialog, setShowDialog] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<Driver | undefined>(undefined);
  const [restrictionDriverId, setRestrictionDriverId] = useState<string>("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => loadSavedViews());
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveDialogName, setSaveDialogName] = useState("");
  const [activeViewName, setActiveViewName] = useState<string | null>(null);
  const searchWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(savedViews));
  }, [savedViews]);

  useEffect(() => {
    if (!activeViewName) return;
    const match = savedViews.find((v) => v.name === activeViewName);
    if (!match) return;
    const isStillApplied =
      match.statusFilter === statusFilter &&
      match.certFilter === certFilter &&
      match.vehicleFilter === vehicleFilter &&
      match.activeFilter === activeFilter;
    if (!isStillApplied) setActiveViewName(null);
  }, [activeViewName, savedViews, statusFilter, certFilter, vehicleFilter, activeFilter]);

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

  const handleSort = (field: string) => {
    setSortConfig((prev) =>
      prev?.field === field
        ? { field, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { field, direction: "asc" },
    );
  };

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
      const matchesActive =
        activeFilter === "all" ||
        (activeFilter === "active" && !isArchived(d)) ||
        (activeFilter === "archived" && isArchived(d));

      return matchesSearch && matchesStatus && matchesCert && matchesVehicle && matchesActive;
    });

    list = [...list].sort((a, b) => {
      const dir = sortConfig?.direction === "desc" ? -1 : 1;
      switch (sortConfig?.field) {
        case "status":
          return dir * (a.status ?? "").localeCompare(b.status ?? "");
        case "hours":
          return dir * ((a.contract_hours_per_week ?? 0) - (b.contract_hours_per_week ?? 0));
        case "expiry": {
          const aDays = nextExpiry(a)?.days ?? Number.POSITIVE_INFINITY;
          const bDays = nextExpiry(b)?.days ?? Number.POSITIVE_INFINITY;
          return dir * (aDays - bDays);
        }
        case "name":
          return dir * a.name.localeCompare(b.name);
        default:
          return a.name.localeCompare(b.name);
      }
    });

    return list;
  }, [drivers, search, statusFilter, certFilter, vehicleFilter, activeFilter, sortConfig]);

  const stats = useMemo(() => {
    let expiring = 0;
    const expiringNames: string[] = [];
    const actieven = drivers.filter((d) => !isArchived(d));
    for (const d of actieven) {
      const e = nextExpiry(d);
      if (e && e.days <= 60) {
        expiring++;
        expiringNames.push(d.name.split(" ")[0]);
      }
    }
    let code95Soon = 0;
    for (const d of actieven) {
      if (d.code95_expiry_date) {
        const days = daysUntil(d.code95_expiry_date) ?? Number.POSITIVE_INFINITY;
        if (days <= 90) code95Soon++;
      }
    }
    return {
      actief: actieven.length,
      gearchiveerd: drivers.length - actieven.length,
      beschikbaar: actieven.filter((d) => d.status === "beschikbaar").length,
      onderweg: actieven.filter((d) => d.status === "onderweg").length,
      afwezig: actieven.filter((d) => d.status === "ziek" || d.status === "rust").length,
      verlopend: expiring,
      verlopendNames: expiringNames,
      code95Soon,
    };
  }, [drivers]);

  const activeDrivers = useMemo(
    () => drivers.filter((driver) => !isArchived(driver)),
    [drivers],
  );

  useEffect(() => {
    if (activeTab !== "landrestricties") return;
    if (restrictionDriverId && drivers.some((driver) => driver.id === restrictionDriverId)) return;
    setRestrictionDriverId(activeDrivers[0]?.id ?? drivers[0]?.id ?? "");
  }, [activeTab, activeDrivers, drivers, restrictionDriverId]);

  const heroAlert = stats.actief > 0 && stats.verlopend / stats.actief > 0.15;
  const hasActiveFilter =
    statusFilter !== "all" ||
    certFilter !== "all" ||
    vehicleFilter !== "all" ||
    activeFilter !== "active";

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const clearSelection = () => setSelectedIds(new Set());

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedIds((prev) => {
      const allSelected = filtered.length > 0 && filtered.every((d) => prev.has(d.id));
      if (allSelected) return new Set();
      return new Set(filtered.map((d) => d.id));
    });
  };

  useEffect(() => {
    clearSelection();
  }, [statusFilter, certFilter, vehicleFilter, activeFilter, search, viewMode]);

  const handleAdd = () => {
    setSelectedDriver(undefined);
    setShowDialog(true);
  };

  const handleEdit = (driver: Driver) => {
    setSelectedDriver(driver);
    setShowDialog(true);
  };

  const handleReactivate = async (driver: Driver) => {
    try {
      await reactivateDriver.mutateAsync(driver.id);
      toast.success(`Chauffeur ${driver.name} geheractiveerd`);
    } catch (err: any) {
      toast.error(err?.message ?? "Fout bij heractiveren");
    }
  };

  const handleStatusChange = async (driver: Driver, newStatus: string) => {
    if (driver.status === newStatus) return;
    try {
      await updateDriverStatus.mutateAsync({ id: driver.id, status: newStatus });
      toast.success(`${driver.name}, status gezet op ${STATUS_CONFIG[newStatus]?.label ?? newStatus}`);
    } catch (err: any) {
      toast.error(err?.message ?? "Fout bij status wijzigen");
    }
  };

  const confirmAction = async () => {
    if (!pendingAction) return;
    const { driver, action } = pendingAction;
    try {
      if (action === "archive") {
        await archiveDriver.mutateAsync(driver.id);
        toast.success(`Chauffeur ${driver.name} gearchiveerd`);
      } else {
        const res = await deleteDriver.mutateAsync(driver.id);
        const removed = (res as { removedFiles?: number } | undefined)?.removedFiles ?? 0;
        toast.success(
          removed > 0
            ? `Chauffeur ${driver.name} permanent verwijderd, ${removed} bestand${removed === 1 ? "" : "en"} opgeruimd`
            : `Chauffeur ${driver.name} permanent verwijderd`,
        );
      }
      setPendingAction(null);
    } catch (err: any) {
      toast.error(err?.message ?? "Fout bij opslaan");
    }
  };

  const bulkArchive = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await Promise.all(ids.map((id) => archiveDriver.mutateAsync(id)));
      toast.success(`${ids.length} ${ids.length === 1 ? "chauffeur" : "chauffeurs"} gearchiveerd`);
      clearSelection();
    } catch (err: any) {
      toast.error(err?.message ?? "Fout bij bulk-archiveren");
    }
  };

  const bulkReactivate = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await Promise.all(ids.map((id) => reactivateDriver.mutateAsync(id)));
      toast.success(`${ids.length} ${ids.length === 1 ? "chauffeur" : "chauffeurs"} geheractiveerd`);
      clearSelection();
    } catch (err: any) {
      toast.error(err?.message ?? "Fout bij bulk-heractiveren");
    }
  };

  const bulkExportCsv = () => {
    const selected = filtered.filter((d) => selectedIds.has(d.id));
    if (selected.length === 0) return;
    const header = [
      "naam", "personeelsnummer", "email", "telefoon", "status", "actief",
      "voertuig", "dienstverband", "contracturen", "indienst", "rijbewijs_tot", "code95_tot",
    ];
    const rows = selected.map((d) => [
      d.name,
      d.personnel_number ?? "",
      d.email ?? "",
      d.phone ?? "",
      d.status,
      isArchived(d) ? "nee" : "ja",
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
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chauffeurs-selectie-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = (scope: "current" | "all" | "code95" = "current") => {
    const source =
      scope === "all"
        ? drivers
        : scope === "code95"
          ? drivers.filter((d) => d.code95_expiry_date)
          : filtered;
    const header = [
      "naam",
      "personeelsnummer",
      "email",
      "telefoon",
      "status",
      "actief",
      "voertuig",
      "dienstverband",
      "contracturen",
      "indienst",
      "rijbewijs_tot",
      "code95_tot",
    ];
    const rows = source.map((d) => [
      d.name,
      d.personnel_number ?? "",
      d.email ?? "",
      d.phone ?? "",
      d.status,
      isArchived(d) ? "nee" : "ja",
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
    const suffix = scope === "current" ? "weergave" : scope === "all" ? "volledig" : "code95";
    a.download = `chauffeurs-${suffix}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    setStatusFilter("all");
    setCertFilter("all");
    setVehicleFilter("all");
    setActiveFilter("active");
    setActiveViewName(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTyping =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable === true;

      if (e.key === "/" && !isTyping && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const input = searchWrapperRef.current?.querySelector("input");
        if (input) {
          e.preventDefault();
          input.focus();
        }
        return;
      }

      if (e.key === "Escape") {
        if (saveDialogOpen) return;
        if (pendingAction) return;
        if (showDialog) return;
        if (selectedIds.size > 0) {
          e.preventDefault();
          clearSelection();
          return;
        }
        if (hasActiveFilter || activeViewName) {
          e.preventDefault();
          resetFilters();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveDialogOpen, pendingAction, showDialog, hasActiveFilter, activeViewName, selectedIds]);

  const openSaveDialog = () => {
    setSaveDialogName("");
    setSaveDialogOpen(true);
  };

  const confirmSaveView = () => {
    const name = saveDialogName.trim();
    if (!name) return;
    const view: SavedView = {
      id: generateViewId(),
      name,
      statusFilter,
      certFilter,
      vehicleFilter,
      activeFilter,
    };
    setSavedViews((prev) => [...prev, view]);
    setActiveViewName(name);
    setSaveDialogOpen(false);
    toast.success(`Weergave "${name}" opgeslagen`);
  };

  const applyView = (v: SavedView) => {
    setStatusFilter(v.statusFilter);
    setCertFilter(v.certFilter);
    setVehicleFilter(v.vehicleFilter);
    setActiveFilter(v.activeFilter);
    setActiveViewName(v.name);
  };

  const removeView = (id: string) => {
    setSavedViews((prev) => prev.filter((v) => v.id !== id));
  };

  const filterValue =
    certFilter !== "all"
      ? `cert:${certFilter}`
      : vehicleFilter !== "all"
        ? `vehicle:${vehicleFilter}`
        : "all";

  const onFilterChange = (v: string) => {
    if (v === "all") {
      setCertFilter("all");
      setVehicleFilter("all");
    } else if (v.startsWith("cert:")) {
      setCertFilter(v.slice(5));
      setVehicleFilter("all");
    } else if (v.startsWith("vehicle:")) {
      setVehicleFilter(v.slice(8));
      setCertFilter("all");
    }
  };

  const hasDrivers = drivers.length > 0;

  return (
    <div className="page-container">
      <PageHeader
        eyebrow={greeting}
        meta={
          <>
            {stats.actief} actief, {stats.beschikbaar} beschikbaar
            {stats.gearchiveerd > 0 ? `, ${stats.gearchiveerd} archief` : ""}
            {stats.verlopend > 0 && (
              <button
                type="button"
                onClick={() => setSortConfig({ field: "expiry", direction: "asc" })}
                className="ml-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-700 transition-colors hover:text-amber-800"
                title="Sorteer op eerst vervallende documenten"
              >
                {stats.verlopend} verlopend
              </button>
            )}
          </>
        }
        title="Chauffeurs"
        actions={activeTab === "chauffeurs" ? (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="btn-luxe">
                  <Download className="h-4 w-4" /> Export
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-xl border-border/50">
                <DropdownMenuItem className="cursor-pointer" onClick={() => exportCsv("current")}>
                  Huidige weergave ({filtered.length})
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer" onClick={() => exportCsv("all")}>
                  Volledige chauffeurlijst ({drivers.length})
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer" onClick={() => exportCsv("code95")}>
                  Code 95 compliance-rapport
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button className="btn-luxe btn-luxe--primary" onClick={handleAdd}>
              <Plus className="h-4 w-4" /> Chauffeur Toevoegen
            </button>
          </>
        ) : undefined}
      >
            <div className="inline-flex items-center gap-0.5 p-0.5 rounded-full border border-[hsl(var(--gold)/0.2)] bg-[hsl(var(--card))]">
              {[
                { value: "chauffeurs", label: "Lijst" },
                { value: "certificeringen", label: "Certificeringen" },
                { value: "landrestricties", label: "Landrestricties" },
              ].map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setActiveTab(t.value)}
                  aria-pressed={activeTab === t.value}
                  className={cn(
                    "px-4 h-7 rounded-full text-[10px] uppercase tracking-[0.18em] font-semibold transition-colors",
                    activeTab === t.value
                      ? "bg-[hsl(var(--gold-soft)/0.65)] text-[hsl(var(--gold-deep))]"
                      : "text-muted-foreground/70 hover:text-foreground",
                  )}
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {t.label}
                </button>
              ))}
            </div>
      </PageHeader>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col min-h-0"
      >
        <TabsContent value="chauffeurs" className="flex-1 flex flex-col min-h-0 mt-4 space-y-4">
          {/* Luxe KPI-strip met click-to-filter */}
          <div
            className="relative rounded-xl border border-[hsl(var(--gold)/0.18)] overflow-hidden grid grid-cols-1 lg:grid-cols-[260px_1fr]"
            style={{
              background: heroAlert
                ? "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(35 90% 92% / 0.5) 100%)"
                : "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--gold-soft)/0.18) 100%)",
              boxShadow: "inset 0 1px 0 var(--inset-highlight), 0 1px 2px hsl(var(--ink)/0.04), 0 12px 32px -16px hsl(var(--ink)/0.1)",
              fontFamily: "var(--font-display)",
            }}
          >
            <span
              aria-hidden
              className="absolute top-0 left-0 right-0 h-px"
              style={{ background: "linear-gradient(90deg, transparent, hsl(var(--gold)/0.45) 50%, transparent)" }}
            />

            {/* Hero: Actief */}
            <button
              type="button"
              onClick={() => setActiveFilter(activeFilter === "active" ? "all" : "active")}
              aria-pressed={activeFilter === "active"}
              aria-label="Filter op actief in dienst"
              className={cn(
                "relative px-7 py-7 lg:border-r border-b lg:border-b-0 border-[hsl(var(--gold)/0.18)] text-left transition-all duration-200",
                "hover:bg-[hsl(var(--gold-soft)/0.35)] focus:outline-none focus-visible:bg-[hsl(var(--gold-soft)/0.5)]",
                activeFilter === "active" && "bg-[hsl(var(--gold-soft)/0.55)]",
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <span aria-hidden className="inline-block h-[1px] w-5" style={{ background: "hsl(var(--gold)/0.5)" }} />
                <span className="text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--gold-deep))] font-semibold">
                  In dienst
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-[3.75rem] leading-none font-semibold tabular-nums tracking-tight text-foreground">
                  {stats.actief}
                </span>
                <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">
                  mensen
                </span>
              </div>
              <div className="mt-3 text-[12px] text-foreground/70">
                Actieve chauffeurs, inzetbaar deze week
              </div>
            </button>

            {/* Ticker-cellen */}
            <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-5 divide-x divide-[hsl(var(--gold)/0.12)]">
              {([
                { label: "Beschikbaar", value: stats.beschikbaar, note: "Klaar voor inzet", kind: "status", filter: "beschikbaar" },
                { label: "Onderweg",     value: stats.onderweg,     note: "Op rit",            kind: "status", filter: "onderweg" },
                { label: "Rust of ziek", value: stats.afwezig,      note: "Tijdelijk uit",     kind: "absent", filter: null },
                { label: "Code 95 < 90d", value: stats.code95Soon,   note: "Herhalen verplicht", kind: "code95", filter: null },
                { label: "Archief",       value: stats.gearchiveerd, note: "Uit dienst",       kind: "archive", filter: null },
              ] as const).map((s) => {
                const active =
                  s.kind === "status"
                    ? statusFilter === s.filter
                    : s.kind === "code95"
                      ? sortConfig?.field === "expiry"
                      : s.kind === "archive"
                        ? activeFilter === "archived"
                        : false;
                const isClickable = s.kind !== "absent";
                const onClick = () => {
                  if (s.kind === "status") {
                    setStatusFilter(active ? "all" : (s.filter as string));
                  } else if (s.kind === "code95") {
                    setSortConfig(active ? null : { field: "expiry", direction: "asc" });
                  } else if (s.kind === "archive") {
                    setActiveFilter(active ? "active" : "archived");
                  }
                };
                const Cmp: any = isClickable ? "button" : "div";
                const props = isClickable
                  ? { type: "button" as const, onClick, "aria-pressed": active }
                  : {};
                return (
                  <Cmp
                    key={s.label}
                    {...props}
                    className={cn(
                      "px-5 py-5 sm:px-6 sm:py-6 flex flex-col text-left transition-all duration-200",
                      isClickable && "hover:bg-[hsl(var(--gold-soft)/0.35)] focus:outline-none focus-visible:bg-[hsl(var(--gold-soft)/0.5)]",
                      active && "bg-[hsl(var(--gold-soft)/0.55)]",
                    )}
                  >
                    <div className="text-[9px] uppercase tracking-[0.24em] text-muted-foreground/70 font-semibold mb-2">
                      {s.label}
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span
                        className={cn(
                          "text-[1.75rem] leading-none font-semibold tabular-nums tracking-tight",
                          s.kind === "code95" && s.value > 0 ? "text-amber-700" : "text-foreground",
                        )}
                      >
                        {s.value}
                      </span>
                      <span
                        aria-hidden
                        className="ml-auto h-px w-6"
                        style={{ background: "linear-gradient(90deg, hsl(var(--gold)/0.5), transparent)" }}
                      />
                    </div>
                    <div className="mt-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/60">
                      {s.note}
                    </div>
                  </Cmp>
                );
              })}
            </div>
          </div>

          {activeFilter !== "active" && (
            <p
              className="text-[11px] text-muted-foreground/70 italic px-1"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Stats in de balk hierboven tellen alleen actieve chauffeurs mee, de lijst toont {activeFilter === "archived" ? "alleen archief" : "actief en archief"}.
            </p>
          )}

          {/* Verloop-waarschuwingsband */}
          <AnimatePresence>
            {stats.verlopend > 0 && (
              <motion.button
                type="button"
                onClick={() => setSortConfig({ field: "expiry", direction: "asc" })}
                aria-label="Sorteer op eerst vervallende documenten"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="w-full rounded-xl border border-amber-300/60 px-4 py-3 flex items-center gap-3 text-left hover:border-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--gold)/0.5)] focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-colors group"
                style={{
                  background: "linear-gradient(90deg, hsl(42 85% 95%), hsl(var(--gold-soft)/0.4) 60%, hsl(var(--gold-soft)/0.2))",
                  fontFamily: "var(--font-display)",
                }}
              >
                <div className="h-8 w-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-4 w-4 text-amber-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-amber-800 font-semibold">
                    Binnen 60 dagen
                  </div>
                  <div className="text-[13px] text-foreground/80 mt-0.5 truncate">
                    <span className="font-semibold tabular-nums">{stats.verlopend}</span>{" "}
                    {stats.verlopend === 1 ? "chauffeur heeft" : "chauffeurs hebben"} een document dat verloopt
                    {stats.verlopendNames.length > 0 && (
                      <span className="text-muted-foreground/80">
                        {" "},{" "}
                        {stats.verlopendNames.slice(0, 3).join(", ")}
                        {stats.verlopendNames.length > 3 && ` en ${stats.verlopendNames.length - 3} ${stats.verlopendNames.length - 3 === 1 ? "ander" : "anderen"}`}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-[10px] uppercase tracking-[0.16em] text-amber-800/80 group-hover:text-amber-900 font-semibold shrink-0">
                  Bekijk
                </span>
              </motion.button>
            )}
          </AnimatePresence>

          {/* Search + gebundelde filter + saved views + density-toggle */}
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
            <div ref={searchWrapperRef} className="flex items-center gap-2 flex-1 min-w-0">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Zoek op naam, email, telefoon, rijbewijs... (druk /)"
                className="flex-1 min-w-0 sm:max-w-md"
              />
              {activeViewName && (
                <span
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[11px] font-semibold border border-[hsl(var(--gold)/0.4)] whitespace-nowrap"
                  style={{
                    background: "linear-gradient(135deg, hsl(var(--gold-soft)/0.7), hsl(var(--gold-soft)/0.3))",
                    color: "hsl(var(--gold-deep))",
                    fontFamily: "var(--font-display)",
                  }}
                  title="Actieve opgeslagen weergave"
                >
                  <Bookmark className="h-3 w-3" />
                  {activeViewName}
                  <button
                    type="button"
                    onClick={() => { resetFilters(); }}
                    className="inline-flex items-center justify-center h-4 w-4 rounded-full hover:bg-[hsl(var(--gold)/0.2)] ml-0.5"
                    aria-label="Actieve weergave verlaten"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Gebundelde filter-knop */}
              <Select value={filterValue} onValueChange={onFilterChange}>
                <SelectTrigger
                  aria-label="Filters"
                  title="Filters"
                  className="relative h-10 w-10 p-0 justify-center border-transparent bg-transparent text-muted-foreground/70 hover:text-[hsl(var(--gold-deep))] focus:outline-none focus-visible:text-[hsl(var(--gold-deep))] data-[state=open]:text-[hsl(var(--gold-deep))] transition-colors shadow-none overflow-hidden [&>span[data-radix-select-value]]:hidden [&>span:not([data-keep])]:hidden [&>svg:last-child]:hidden"
                >
                  <SlidersHorizontal className="h-5 w-5" />
                  <SelectValue />
                  {(certFilter !== "all" || vehicleFilter !== "all") && (
                    <span
                      data-keep
                      aria-hidden
                      className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full"
                      style={{ background: "hsl(var(--gold-deep))" }}
                    />
                  )}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" style={{ fontSize: "var(--text-small)" }}>Alle chauffeurs</SelectItem>
                  {activeCertifications.length > 0 && (
                    <>
                      <SelectSeparator />
                      <SelectGroup>
                        <SelectLabel
                          style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-caption)" }}
                          className="uppercase tracking-[0.16em] text-[hsl(var(--gold-deep))] font-semibold select-none"
                        >
                          Certificering
                        </SelectLabel>
                        {activeCertifications.map((c) => (
                          <SelectItem key={`cert:${c.code}`} value={`cert:${c.code}`} style={{ fontSize: "var(--text-small)" }}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </>
                  )}
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel
                      style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-caption)" }}
                      className="uppercase tracking-[0.16em] text-[hsl(var(--gold-deep))] font-semibold select-none"
                    >
                      Voertuig
                    </SelectLabel>
                    <SelectItem value="vehicle:any" style={{ fontSize: "var(--text-small)" }}>Met voertuig</SelectItem>
                    <SelectItem value="vehicle:none" style={{ fontSize: "var(--text-small)" }}>Zonder voertuig</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>

              {/* Saved views */}
              {(savedViews.length > 0 || hasActiveFilter) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="h-10 w-10 inline-flex items-center justify-center text-muted-foreground/70 hover:text-[hsl(var(--gold-deep))] transition-colors"
                    aria-label="Opgeslagen weergaven"
                    title="Opgeslagen weergaven"
                  >
                    <Bookmark className="h-[18px] w-[18px]" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-xl border-border/50 min-w-[220px]">
                  {savedViews.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      Nog geen weergaven opgeslagen
                    </div>
                  ) : (
                    savedViews.map((v) => (
                      <DropdownMenuItem
                        key={v.id}
                        className="cursor-pointer flex items-center justify-between gap-2"
                        onSelect={() => applyView(v)}
                      >
                        <span className="truncate">{v.name}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeView(v.id);
                          }}
                          className="opacity-60 hover:opacity-100 hover:text-destructive"
                          aria-label={`Verwijder weergave ${v.name}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </DropdownMenuItem>
                    ))
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="cursor-pointer gap-2"
                    onSelect={() => setActiveFilter(activeFilter === "all" ? "active" : "all")}
                  >
                    <Users className="h-3.5 w-3.5" /> {activeFilter === "all" ? "Verberg archief" : "Toon actief + archief"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer gap-2"
                    onSelect={openSaveDialog}
                    disabled={!hasActiveFilter}
                  >
                    <BookmarkPlus className="h-3.5 w-3.5" /> Huidige weergave opslaan
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              )}

              {hasActiveFilter && (
                <button
                  onClick={resetFilters}
                  style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-caption)" }}
                  className="uppercase tracking-[0.14em] text-muted-foreground/70 hover:text-[hsl(var(--gold-deep))] transition-colors px-1"
                >
                  Wissen
                </button>
              )}

              {viewMode !== "table" && (
                <Select
                  value={sortConfig ? `${sortConfig.field}:${sortConfig.direction}` : "default"}
                  onValueChange={(v) => {
                    if (v === "default") {
                      setSortConfig(null);
                    } else {
                      const [field, direction] = v.split(":") as [string, "asc" | "desc"];
                      setSortConfig({ field, direction });
                    }
                  }}
                >
                  <SelectTrigger
                    aria-label="Sorteervolgorde"
                    className="h-10 w-[150px] text-xs border-[hsl(var(--gold)/0.18)]"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    <SelectValue placeholder="Sorteer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default" style={{ fontSize: "var(--text-small)" }}>Standaard</SelectItem>
                    <SelectItem value="name:asc" style={{ fontSize: "var(--text-small)" }}>Naam A→Z</SelectItem>
                    <SelectItem value="name:desc" style={{ fontSize: "var(--text-small)" }}>Naam Z→A</SelectItem>
                    <SelectItem value="status:asc" style={{ fontSize: "var(--text-small)" }}>Status</SelectItem>
                    <SelectItem value="hours:desc" style={{ fontSize: "var(--text-small)" }}>Meeste uren</SelectItem>
                    <SelectItem value="expiry:asc" style={{ fontSize: "var(--text-small)" }}>Vervalt eerst</SelectItem>
                  </SelectContent>
                </Select>
              )}

              {/* Density-toggle */}
              <div className="h-10 rounded-xl border border-[hsl(var(--gold)/0.18)] bg-card/30 flex items-center p-0.5 gap-0.5">
                {([
                  { mode: "cards" as const, Icon: LayoutGrid, label: "Kaartweergave" },
                  { mode: "compact" as const, Icon: Rows3, label: "Compacte lijst" },
                  { mode: "table" as const, Icon: TableIcon, label: "Tabelweergave" },
                ]).map(({ mode, Icon, label }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    title={label}
                    aria-label={label}
                    aria-pressed={viewMode === mode}
                    className={cn(
                      "h-full w-9 rounded-lg flex items-center justify-center transition-colors",
                      viewMode === mode
                        ? "bg-[hsl(var(--gold-soft)/0.55)] text-[hsl(var(--gold-deep))]"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Actieve filter-chips */}
          {hasActiveFilter && (
            <div className="flex flex-wrap gap-2 items-center">
              <span
                className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 font-semibold"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Actief:
              </span>
              {statusFilter !== "all" && (
                <FilterChip
                  label={STATUS_CONFIG[statusFilter]?.label ?? statusFilter}
                  onClear={() => setStatusFilter("all")}
                />
              )}
              {certFilter !== "all" && (
                <FilterChip
                  label={`Cert: ${certLabels[certFilter] ?? certFilter}`}
                  onClear={() => setCertFilter("all")}
                />
              )}
              {vehicleFilter !== "all" && (
                <FilterChip
                  label={vehicleFilter === "any" ? "Met voertuig" : "Zonder voertuig"}
                  onClear={() => setVehicleFilter("all")}
                />
              )}
              {activeFilter !== "active" && (
                <FilterChip
                  label={activeFilter === "archived" ? "Gearchiveerd" : "Incl. archief"}
                  onClear={() => setActiveFilter("active")}
                />
              )}
            </div>
          )}

          {selectedIds.size > 0 && (
            <div
              className="flex items-center justify-between gap-3 rounded-xl border border-[hsl(var(--gold)/0.35)] px-4 py-2.5"
              style={{
                background: "linear-gradient(135deg, hsl(var(--gold-soft)/0.5), hsl(var(--gold-soft)/0.2))",
                fontFamily: "var(--font-display)",
              }}
            >
              <div className="flex items-center gap-2 text-[12px] uppercase tracking-[0.16em] text-[hsl(var(--gold-deep))] font-semibold tabular-nums">
                <span>{selectedIds.size}</span>
                <span className="text-muted-foreground/70">
                  {selectedIds.size === 1 ? "chauffeur geselecteerd" : "chauffeurs geselecteerd"}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  className="btn-luxe"
                  onClick={bulkExportCsv}
                  title="Exporteer geselecteerde chauffeurs als CSV"
                >
                  <Download className="h-4 w-4" /> Export selectie
                </button>
                {activeFilter === "archived" ? (
                  <button
                    className="btn-luxe"
                    onClick={bulkReactivate}
                    title="Heractiveer geselecteerde chauffeurs"
                  >
                    <ArchiveRestore className="h-4 w-4" /> Heractiveer
                  </button>
                ) : (
                  <button
                    className="btn-luxe"
                    onClick={bulkArchive}
                    title="Archiveer geselecteerde chauffeurs"
                  >
                    <Archive className="h-4 w-4" /> Archiveer
                  </button>
                )}
                <button
                  onClick={clearSelection}
                  className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground/70 hover:text-[hsl(var(--gold-deep))] transition-colors px-2"
                  title="Selectie wissen"
                >
                  <X className="h-3.5 w-3.5" /> Wissen
                </button>
              </div>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-auto pb-8">
            {isLoading ? (
              <SkeletonGrid viewMode={viewMode} />
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
                <button className="btn-luxe btn-luxe--primary" onClick={handleAdd}>
                  <Plus className="h-4 w-4" /> Eerste chauffeur toevoegen
                </button>
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
                actualHoursByDriver={actualHoursByDriver}
                sortConfig={sortConfig}
                onSort={handleSort}
                onEdit={handleEdit}
                onArchive={(d) => setPendingAction({ driver: d, action: "archive" })}
                onReactivate={handleReactivate}
                onDelete={(d) => setPendingAction({ driver: d, action: "delete" })}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelection}
                onToggleAll={toggleAllVisible}
              />
            ) : viewMode === "compact" ? (
              <CompactList
                drivers={filtered}
                vehicleMap={vehicleMap}
                actualHoursByDriver={actualHoursByDriver}
                onEdit={handleEdit}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelection}
              />
            ) : (
              <motion.div
                layout
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  {filtered.map((d) => (
                    <motion.div
                      key={d.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <DriverCard
                        driver={d}
                        vehicleMap={vehicleMap}
                        certLabels={certLabels}
                        actualHours={actualHoursByDriver.get(d.id) ?? null}
                        onEdit={() => handleEdit(d)}
                        onArchive={() => setPendingAction({ driver: d, action: "archive" })}
                        onReactivate={() => handleReactivate(d)}
                        onDelete={() => setPendingAction({ driver: d, action: "delete" })}
                        selected={selectedIds.has(d.id)}
                        onToggleSelect={() => toggleSelection(d.id)}
                        onStatusChange={(status) => handleStatusChange(d, status)}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </div>
        </TabsContent>

        <TabsContent
          value="certificeringen"
          className="flex-1 overflow-auto mt-4 pb-8"
        >
          <DeferredMount label="Certificeringen laden">
            <DriverCertificationsSection />
          </DeferredMount>
        </TabsContent>

        <TabsContent
          value="landrestricties"
          className="flex-1 overflow-auto mt-4 pb-8"
        >
          <div className="card--luxe p-5 md:p-6 space-y-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[11px] font-display font-semibold uppercase tracking-[0.16em] text-[hsl(var(--gold-deep))]">
                  Chauffeur landrestricties
                </p>
                <h2 className="mt-2 text-xl font-semibold text-foreground">Landen blokkeren of waarschuwen per chauffeur</h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Leg per chauffeur vast naar welke landen hij niet mag rijden of waar planning eerst een waarschuwing moet tonen.
                </p>
              </div>
              <div className="w-full lg:w-[360px] space-y-2">
                <Label>Chauffeur</Label>
                <Select value={restrictionDriverId} onValueChange={setRestrictionDriverId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Kies chauffeur" />
                  </SelectTrigger>
                  <SelectContent>
                    {(activeDrivers.length > 0 ? activeDrivers : drivers).map((driver) => (
                      <SelectItem key={driver.id} value={driver.id}>
                        {driver.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {restrictionDriverId ? (
              <DeferredMount label="Landrestricties laden">
                <DriverCountryRestrictionsSection driverId={restrictionDriverId} />
              </DeferredMount>
            ) : (
              <div className="rounded-lg border-2 border-dashed border-border py-8 text-center text-xs text-muted-foreground">
                Voeg eerst een chauffeur toe om landrestricties vast te leggen.
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <NewDriverDialog open={showDialog} onOpenChange={setShowDialog} driver={selectedDriver} />

      <AlertDialog
        open={!!pendingAction}
        onOpenChange={(o) => {
          if (!o) setPendingAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction?.action === "archive"
                ? "Chauffeur archiveren?"
                : "Chauffeur permanent verwijderen?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction ? (
                pendingAction.action === "archive" ? (
                  <>
                    <span className="font-medium">{pendingAction.driver.name}</span> wordt op
                    inactief gezet, het voertuig wordt ontkoppeld en de chauffeur verdwijnt uit
                    de standaard lijst. Historie, uren en certificaten blijven bewaard en de
                    chauffeur kan later heractiveerd worden.
                  </>
                ) : (
                  <>
                    <span className="font-medium">{pendingAction.driver.name}</span> wordt
                    definitief verwijderd. Voertuigchecks, beschikbaarheid, certificaat-records
                    en alle ge&uuml;ploade documenten worden vernietigd. Dit kan niet ongedaan
                    gemaakt worden. Overweeg eerst archiveren.
                  </>
                )
              ) : (
                "Weet je het zeker?"
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmAction}
              className={
                pendingAction?.action === "delete"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
            >
              {pendingAction?.action === "archive" ? "Archiveren" : "Permanent verwijderen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Weergave opslaan</DialogTitle>
            <DialogDescription>
              Geef deze combinatie van filters een naam. Je vindt 'm later terug onder het bladwijzer-icoon.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="save-view-name" className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Naam
            </Label>
            <Input
              id="save-view-name"
              autoFocus
              value={saveDialogName}
              onChange={(e) => setSaveDialogName(e.target.value)}
              placeholder="Bijv. Code 95 verloopt deze maand"
              onKeyDown={(e) => {
                if (e.key === "Enter" && saveDialogName.trim()) confirmSaveView();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveDialogOpen(false)}>
              Annuleren
            </Button>
            <Button onClick={confirmSaveView} disabled={!saveDialogName.trim()}>
              Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-medium border border-[hsl(var(--gold)/0.35)]"
      style={{
        background: "linear-gradient(135deg, hsl(var(--gold-soft)/0.5), hsl(var(--gold-soft)/0.2))",
        color: "hsl(var(--gold-deep))",
        fontFamily: "var(--font-display)",
      }}
    >
      {label}
      <button
        type="button"
        onClick={onClear}
        className="inline-flex items-center justify-center h-4 w-4 rounded-full hover:bg-[hsl(var(--gold)/0.15)]"
        aria-label={`Filter ${label} verwijderen`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function Avatar({ name, status, size = "md" }: { name: string; status: string; size?: "sm" | "md" | "lg" }) {
  const statusCfg = STATUS_CONFIG[status];
  const dim = size === "lg" ? "h-11 w-11 text-sm" : size === "sm" ? "h-7 w-7 text-[10px]" : "h-10 w-10 text-sm";
  const dotSize = size === "lg" ? "h-3 w-3" : "h-2.5 w-2.5";
  return (
    <div className="relative shrink-0">
      <div
        className={cn(
          "rounded-full flex items-center justify-center font-bold",
          dim,
        )}
        style={{
          background: "linear-gradient(135deg, hsl(var(--gold-soft)/0.7), hsl(var(--gold)/0.2))",
          color: "hsl(var(--gold-deep))",
          boxShadow: (() => {
            const ringColor =
              status === "onderweg"
                ? "rgb(59 130 246 / 0.6)"
                : status === "beschikbaar"
                  ? "rgb(16 185 129 / 0.55)"
                  : status === "rust"
                    ? "rgb(245 158 11 / 0.5)"
                    : status === "ziek"
                      ? "hsl(var(--destructive) / 0.5)"
                      : "hsl(var(--gold) / 0.3)";
            return `0 0 0 2px hsl(var(--card)), 0 0 0 3px ${ringColor}`;
          })(),
        }}
      >
        {initialsOf(name)}
      </div>
      {statusCfg && (
        <span
          aria-label={statusCfg.label}
          className={cn(
            "absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-[hsl(var(--card))]",
            dotSize,
            statusCfg.dot,
          )}
        />
      )}
    </div>
  );
}

function SkeletonGrid({ viewMode }: { viewMode: ViewMode }) {
  if (viewMode === "table") {
    return (
      <div className="card--luxe overflow-hidden">
        <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_0.7fr_0.5fr] gap-4 px-5 py-3 border-b border-[hsl(var(--gold)/0.15)]">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="skeleton-luxe" style={{ height: 10 }} />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, r) => (
          <div
            key={r}
            className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_0.7fr_0.5fr] gap-4 px-5 py-4 border-b border-border/30 items-center"
          >
            <div className="flex items-center gap-2">
              <div className="skeleton-luxe" style={{ height: 28, width: 28, borderRadius: "999px" }} />
              <div className="skeleton-luxe" style={{ height: 12, width: 120 }} />
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton-luxe" style={{ height: 12, width: "70%" }} />
            ))}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border/40 bg-card/30 p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="skeleton-luxe" style={{ height: 40, width: 40, borderRadius: "999px" }} />
            <div className="flex-1 space-y-2">
              <div className="skeleton-luxe" style={{ height: 12, width: "70%" }} />
              <div className="skeleton-luxe" style={{ height: 10, width: "45%" }} />
            </div>
          </div>
          <div className="space-y-2">
            <div className="skeleton-luxe" style={{ height: 10, width: "80%" }} />
            <div className="skeleton-luxe" style={{ height: 10, width: "60%" }} />
          </div>
          <div className="flex gap-1.5">
            <div className="skeleton-luxe" style={{ height: 18, width: 46, borderRadius: 999 }} />
            <div className="skeleton-luxe" style={{ height: 18, width: 46, borderRadius: 999 }} />
          </div>
          <div className="skeleton-luxe" style={{ height: 32, width: "100%", borderRadius: 8 }} />
        </div>
      ))}
    </div>
  );
}

interface DriverCardProps {
  driver: Driver;
  vehicleMap: Record<string, { name: string; plate: string }>;
  certLabels: Record<string, string>;
  actualHours: number | null;
  onEdit: () => void;
  onArchive: () => void;
  onReactivate: () => void;
  onDelete: () => void;
  selected: boolean;
  onToggleSelect: () => void;
  onStatusChange: (status: string) => void;
}

function DriverCard({
  driver: d,
  vehicleMap,
  certLabels,
  actualHours,
  onEdit,
  onArchive,
  onReactivate,
  onDelete,
  selected,
  onToggleSelect,
  onStatusChange,
}: DriverCardProps) {
  const statusCfg = STATUS_CONFIG[d.status] || STATUS_CONFIG.beschikbaar;
  const StatusIcon = statusCfg.Icon;
  const vehicle = d.current_vehicle_id ? vehicleMap[d.current_vehicle_id] : null;
  const expiry = nextExpiry(d);
  const archived = isArchived(d);

  return (
    <div
      className={cn(
        "card--luxe group relative overflow-hidden transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-[0_10px_32px_-12px_hsl(var(--gold)/0.25)]",
        archived && "opacity-60",
      )}
    >
      <label
        className={cn(
          "absolute top-3 left-3 z-10 h-6 w-6 rounded-md flex items-center justify-center cursor-pointer transition-all",
          selected
            ? "bg-[hsl(var(--gold-soft)/0.8)] border border-[hsl(var(--gold)/0.5)]"
            : "bg-card/80 border border-border/40 opacity-0 group-hover:opacity-100",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          aria-label={`Selecteer ${d.name}`}
          className="h-3.5 w-3.5 cursor-pointer accent-[hsl(var(--gold-deep))]"
          checked={selected}
          onChange={onToggleSelect}
        />
      </label>
      <div className="p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar name={d.name} status={d.status} />
            <div>
              <h3
                className="font-semibold text-foreground line-clamp-1"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {d.name}
              </h3>
              <div className="mt-1 flex flex-wrap gap-1">
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Status wijzigen van ${d.name}, nu ${statusCfg.label}`}
                      className="inline-flex focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--gold)/0.5)] rounded-full"
                    >
                      <Badge
                        variant="outline"
                        className={cn(
                          "h-5 text-[10px] px-1.5 font-bold uppercase tracking-wider border-none cursor-pointer hover:opacity-80 transition-opacity",
                          statusCfg.className,
                        )}
                      >
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {statusCfg.label}
                      </Badge>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-48 p-1 rounded-xl"
                    align="start"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div
                      className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground/70 font-semibold px-2 pt-1.5 pb-1"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      Status wijzigen
                    </div>
                    {(["beschikbaar", "onderweg", "rust", "ziek"] as const).map((key) => {
                      const cfg = STATUS_CONFIG[key];
                      const Icon = cfg.Icon;
                      const isCurrent = d.status === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => onStatusChange(key)}
                          className={cn(
                            "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-left transition-colors",
                            isCurrent
                              ? "bg-[hsl(var(--gold-soft)/0.55)] text-[hsl(var(--gold-deep))] font-semibold"
                              : "hover:bg-muted/60",
                          )}
                          disabled={isCurrent}
                        >
                          <span className={cn("h-2 w-2 rounded-full", cfg.dot)} />
                          {cfg.label}
                          {isCurrent && (
                            <span className="ml-auto text-[9px] uppercase tracking-[0.14em] text-muted-foreground/60">
                              Huidig
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </PopoverContent>
                </Popover>
                {archived && (
                  <Badge
                    variant="outline"
                    className="h-5 text-[10px] px-1.5 font-bold uppercase tracking-wider border-none bg-muted text-muted-foreground"
                  >
                    <Archive className="h-3 w-3 mr-1" />
                    Gearchiveerd
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-8 w-8 p-0 hover:bg-[hsl(var(--gold-soft)/0.4)] transition-colors"
                aria-label={`Acties voor ${d.name}`}
              >
                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl border-border/50">
              <DropdownMenuItem className="gap-2 cursor-pointer" onClick={onEdit}>
                <Edit2 className="h-3.5 w-3.5" /> Bewerken
              </DropdownMenuItem>
              {archived ? (
                <DropdownMenuItem className="gap-2 cursor-pointer" onClick={onReactivate}>
                  <ArchiveRestore className="h-3.5 w-3.5" /> Heractiveren
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem className="gap-2 cursor-pointer" onClick={onArchive}>
                  <Archive className="h-3.5 w-3.5" /> Archiveren
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="gap-2 text-destructive focus:bg-destructive/5 focus:text-destructive cursor-pointer"
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" /> Hard verwijderen
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

        <div className="flex items-center justify-between rounded-xl border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.18)] px-3 py-2 text-xs">
          <span className="text-muted-foreground">Nostradamus deze week</span>
          <span className="font-semibold tabular-nums text-foreground">
            {actualHours == null ? "Nog geen import" : `${actualHours.toFixed(1)} u`}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5 min-h-[1.5rem]">
          {d.certifications.length > 0 ? (
            d.certifications.map((cert) => (
              <Badge
                key={cert}
                variant="secondary"
                className="text-xs px-2 py-0 bg-[hsl(var(--gold-soft)/0.55)] text-[hsl(var(--gold-deep))] border-none font-medium"
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
            className={cn(
              "flex items-center gap-1 text-xs",
              expiry.days < 0 ? "text-destructive" : "text-amber-700",
            )}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {expiry.days < 0
              ? `Document verlopen (${Math.abs(expiry.days)} dagen geleden)`
              : `Document verloopt over ${expiry.days} dagen`}
          </div>
        )}
      </div>

      <div
        className="px-5 py-3 border-t border-[hsl(var(--gold)/0.12)] flex items-center justify-between text-xs"
        style={{ background: "linear-gradient(180deg, transparent, hsl(var(--gold-soft)/0.2))" }}
      >
        <span
          className="text-muted-foreground font-medium uppercase tracking-[0.18em] text-[10px]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Voertuig
        </span>
        <span
          className="font-semibold text-foreground tabular-nums"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {vehicle ? vehicle.plate : "Geen koppeling"}
        </span>
      </div>
    </div>
  );
}

function CompactList({
  drivers,
  vehicleMap,
  actualHoursByDriver,
  onEdit,
  selectedIds,
  onToggleSelect,
}: {
  drivers: Driver[];
  vehicleMap: Record<string, { name: string; plate: string }>;
  actualHoursByDriver: Map<string, number>;
  onEdit: (d: Driver) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}) {
  return (
    <div className="card--luxe overflow-hidden">
      <ul className="divide-y divide-[hsl(var(--gold)/0.1)]">
        {drivers.map((d) => {
          const statusCfg = STATUS_CONFIG[d.status] ?? STATUS_CONFIG.beschikbaar;
          const vehicle = d.current_vehicle_id ? vehicleMap[d.current_vehicle_id] : null;
          const expiry = nextExpiry(d);
          const archived = isArchived(d);
          const actualHours = actualHoursByDriver.get(d.id);
          return (
            <li
              key={d.id}
              className={cn(
                "group relative flex items-center gap-3 px-4 py-2.5 hover:bg-[hsl(var(--gold-soft)/0.25)] hover:shadow-[inset_2px_0_0_0_hsl(var(--gold)/0.55)] transition-all duration-150 cursor-pointer",
                archived && "opacity-60",
              )}
              onClick={() => onEdit(d)}
            >
              <input
                type="checkbox"
                aria-label={`Selecteer ${d.name}`}
                className="h-3.5 w-3.5 cursor-pointer accent-[hsl(var(--gold-deep))] shrink-0"
                checked={selectedIds.has(d.id)}
                onClick={(e) => e.stopPropagation()}
                onChange={() => onToggleSelect(d.id)}
              />
              <Avatar name={d.name} status={d.status} size="sm" />
              <div className="flex-1 min-w-0 flex items-center gap-3">
                <span
                  className="font-semibold text-[13px] truncate"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {d.name}
                </span>
                <span
                  className={cn(
                    "text-[10px] uppercase tracking-[0.14em] font-semibold px-1.5 py-0.5 rounded",
                    statusCfg.className,
                  )}
                >
                  {statusCfg.label}
                </span>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {actualHours == null ? "geen import" : `${actualHours.toFixed(1)}u`}
                </span>
              </div>
              <span className="text-xs text-muted-foreground font-mono tabular-nums w-[90px] text-right">
                {vehicle ? vehicle.plate : "—"}
              </span>
              <span
                className={cn(
                  "text-xs tabular-nums w-[80px] text-right",
                  expiry && expiry.days < 0
                    ? "text-destructive"
                    : expiry && expiry.days < 60
                      ? "text-amber-700"
                      : "text-muted-foreground",
                )}
              >
                {expiry ? (expiry.days < 0 ? "verlopen" : `${expiry.days}d`) : "—"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DriversTable({
  drivers,
  vehicleMap,
  certLabels,
  actualHoursByDriver,
  sortConfig,
  onSort,
  onEdit,
  onArchive,
  onReactivate,
  onDelete,
  selectedIds,
  onToggleSelect,
  onToggleAll,
}: {
  drivers: Driver[];
  vehicleMap: Record<string, { name: string; plate: string }>;
  certLabels: Record<string, string>;
  actualHoursByDriver: Map<string, number>;
  sortConfig: SortConfig | null;
  onSort: (field: string) => void;
  onEdit: (d: Driver) => void;
  onArchive: (d: Driver) => void;
  onReactivate: (d: Driver) => void;
  onDelete: (d: Driver) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleAll: () => void;
}) {
  return (
    <div className="card--luxe overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr
              className="border-b border-[hsl(var(--gold)/0.2)]"
              style={{ background: "linear-gradient(180deg, hsl(var(--gold-soft)/0.4), hsl(var(--gold-soft)/0.15))" }}
            >
              <Th className="w-8 pl-4">
                <input
                  type="checkbox"
                  aria-label="Alles selecteren"
                  className="h-3.5 w-3.5 cursor-pointer accent-[hsl(var(--gold-deep))]"
                  checked={drivers.length > 0 && drivers.every((d) => selectedIds.has(d.id))}
                  ref={(el) => {
                    if (el) {
                      const some = drivers.some((d) => selectedIds.has(d.id));
                      const all = drivers.length > 0 && drivers.every((d) => selectedIds.has(d.id));
                      el.indeterminate = some && !all;
                    }
                  }}
                  onChange={onToggleAll}
                />
              </Th>
              <Th>
                <SortableHeader label="Naam" field="name" currentSort={sortConfig} onSort={onSort} />
              </Th>
              <Th>Personeelsnr</Th>
              <Th>
                <SortableHeader label="Status" field="status" currentSort={sortConfig} onSort={onSort} />
              </Th>
              <Th>Voertuig</Th>
              <Th>Dienstverband</Th>
              <Th>
                <SortableHeader label="Uren" field="hours" currentSort={sortConfig} onSort={onSort} />
              </Th>
              <Th>Certs</Th>
              <Th>
                <SortableHeader label="Vervalt" field="expiry" currentSort={sortConfig} onSort={onSort} />
              </Th>
              <Th className="text-right">Acties</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[hsl(var(--gold)/0.1)]">
            {drivers.map((d) => {
              const statusCfg = STATUS_CONFIG[d.status] ?? STATUS_CONFIG.beschikbaar;
              const vehicle = d.current_vehicle_id ? vehicleMap[d.current_vehicle_id] : null;
              const expiry = nextExpiry(d);
              const archived = isArchived(d);
              const actualHours = actualHoursByDriver.get(d.id);
              return (
                <tr
                  key={d.id}
                  className={cn(
                    "hover:bg-[hsl(var(--gold-soft)/0.22)] hover:shadow-[inset_2px_0_0_0_hsl(var(--gold)/0.45)] transition-all duration-150",
                    archived && "opacity-60",
                  )}
                >
                  <Td className="w-8 pl-4" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Selecteer ${d.name}`}
                      className="h-3.5 w-3.5 cursor-pointer accent-[hsl(var(--gold-deep))]"
                      checked={selectedIds.has(d.id)}
                      onChange={() => onToggleSelect(d.id)}
                    />
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <Avatar name={d.name} status={d.status} size="sm" />
                      <span
                        className="font-medium"
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        {d.name}
                      </span>
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
                      className={cn(
                        "h-5 text-[10px] px-1.5 font-bold uppercase tracking-wider border-none",
                        statusCfg.className,
                      )}
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
                    <div className="text-[11px] tabular-nums text-muted-foreground mt-1">
                      {actualHours == null ? "Nostradamus: —" : `Nostradamus: ${actualHours.toFixed(1)} u`}
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1 max-w-[160px]">
                      {d.certifications.slice(0, 3).map((c) => (
                        <span
                          key={c}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-[hsl(var(--gold-soft)/0.55)] text-[hsl(var(--gold-deep))]"
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
                        className={cn(
                          "text-xs tabular-nums",
                          expiry.days < 0
                            ? "text-destructive"
                            : expiry.days < 60
                              ? "text-amber-700"
                              : "text-muted-foreground",
                        )}
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
                        aria-label={`${d.name} bewerken`}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      {archived ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => onReactivate(d)}
                          aria-label={`${d.name} heractiveren`}
                        >
                          <ArchiveRestore className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => onArchive(d)}
                          aria-label={`${d.name} archiveren`}
                        >
                          <Archive className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/5"
                        onClick={() => onDelete(d)}
                        aria-label={`${d.name} hard verwijderen`}
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
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--gold-deep))]",
        className,
      )}
      style={{ fontFamily: "var(--font-display)" }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLTableCellElement>) => void;
}) {
  return (
    <td className={cn("px-4 py-3", className)} onClick={onClick}>
      {children}
    </td>
  );
}
