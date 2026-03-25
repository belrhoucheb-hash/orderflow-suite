import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ClipboardList, Search, Filter, Loader2, ArrowUpDown,
  ArrowUp, ArrowDown, Calendar, Barcode, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

// ─── Types ───────────────────────────────────────────────────────────
interface TransportOrder {
  id: string;
  order_number: number;
  client_name: string | null;
  transport_type: string | null;
  created_at: string;
  received_at: string | null;
  status: string;
  vehicle_id: string | null;
  invoice_ref: string | null;
  barcode: string | null;
  delivery_address: string | null;
  weight_kg: number | null;
  quantity: number | null;
  unit: string | null;
}

// ─── Status config ──────────────────────────────────────────────────
const statusLabels: Record<string, string> = {
  DRAFT: "Nieuw",
  OPEN: "Open",
  PLANNED: "Ingepland",
  DELIVERED: "Afgeleverd",
  CANCELLED: "Geannuleerd",
};

const statusColors: Record<string, string> = {
  DRAFT: "bg-blue-500/10 text-blue-700 border-blue-200/60",
  OPEN: "bg-amber-500/10 text-amber-700 border-amber-200/60",
  PLANNED: "bg-primary/10 text-primary border-primary/20",
  DELIVERED: "bg-emerald-500/10 text-emerald-700 border-emerald-200/60",
  CANCELLED: "bg-muted text-muted-foreground border-border",
};

type SortField = "created_at" | "client_name" | "transport_type" | "order_number";
type SortDir = "asc" | "desc";

// ─── Main Page ───────────────────────────────────────────────────────
const Transportopdrachten = () => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["transport-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, client_name, transport_type, created_at, received_at, status, vehicle_id, invoice_ref, barcode, delivery_address, weight_kg, quantity, unit")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TransportOrder[];
    },
  });

  // Filter & sort
  const filtered = useMemo(() => {
    let result = orders;

    if (statusFilter !== "all") {
      result = result.filter((o) => o.status === statusFilter);
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (o) =>
          o.client_name?.toLowerCase().includes(q) ||
          o.transport_type?.toLowerCase().includes(q) ||
          o.invoice_ref?.toLowerCase().includes(q) ||
          o.barcode?.toLowerCase().includes(q) ||
          String(o.order_number).includes(q)
      );
    }

    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortField === "created_at") {
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else if (sortField === "client_name") {
        cmp = (a.client_name || "").localeCompare(b.client_name || "");
      } else if (sortField === "transport_type") {
        cmp = (a.transport_type || "").localeCompare(b.transport_type || "");
      } else if (sortField === "order_number") {
        cmp = a.order_number - b.order_number;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [orders, search, statusFilter, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 text-muted-foreground/40" />;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 text-primary" />
    ) : (
      <ArrowDown className="h-3 w-3 text-primary" />
    );
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((o) => o.id)));
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground font-display flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" />
            Transportopdrachten
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Overzicht van alle transportopdrachten
          </p>
        </div>
        {selectedIds.size > 0 && (
          <Badge variant="secondary" className="text-xs">
            {selectedIds.size} geselecteerd
          </Badge>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-[320px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Zoeken..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <Filter className="h-3 w-3 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">Alle statussen</SelectItem>
            {Object.entries(statusLabels).map(([k, v]) => (
              <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto text-[11px] text-muted-foreground tabular-nums">
          Totaal: <span className="font-semibold text-foreground">{filtered.length}</span>
        </div>
      </div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-xl border border-border/40 shadow-sm overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/30 bg-muted/20">
                <th className="px-3 py-2 w-8">
                  <Checkbox
                    checked={selectedIds.size === filtered.length && filtered.length > 0}
                    onCheckedChange={toggleAll}
                    className="h-3.5 w-3.5"
                  />
                </th>
                <th className="px-3 py-2 text-left">
                  <button onClick={() => toggleSort("created_at")} className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 hover:text-foreground transition-colors">
                    <Calendar className="h-3 w-3" />Datum
                    <SortIcon field="created_at" />
                  </button>
                </th>
                <th className="px-3 py-2 text-left">
                  <button onClick={() => toggleSort("transport_type")} className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 hover:text-foreground transition-colors">
                    Transporttype
                    <SortIcon field="transport_type" />
                  </button>
                </th>
                <th className="px-3 py-2 text-left">
                  <button onClick={() => toggleSort("client_name")} className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 hover:text-foreground transition-colors">
                    Naam besteller
                    <SortIcon field="client_name" />
                  </button>
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 hidden lg:table-cell">
                  Tijdstip
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 hidden md:table-cell">
                  Voertuig
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 hidden lg:table-cell">
                  Omschr.
                </th>
                <th className="px-3 py-2 text-left">
                  <button onClick={() => toggleSort("order_number")} className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 hover:text-foreground transition-colors">
                    <FileText className="h-3 w-3" />Ref. factuur
                    <SortIcon field="order_number" />
                  </button>
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 hidden xl:table-cell">
                  <span className="flex items-center gap-1">
                    <Barcode className="h-3 w-3" />Barcode
                  </span>
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {filtered.map((order, i) => (
                <motion.tr
                  key={order.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.02 }}
                  className={cn(
                    "hover:bg-muted/20 transition-colors duration-100",
                    selectedIds.has(order.id) && "bg-primary/[0.03]"
                  )}
                >
                  <td className="px-3 py-2">
                    <Checkbox
                      checked={selectedIds.has(order.id)}
                      onCheckedChange={() => toggleSelect(order.id)}
                      className="h-3.5 w-3.5"
                    />
                  </td>
                  <td className="px-3 py-2 text-[12px] text-foreground tabular-nums whitespace-nowrap">
                    {formatDate(order.created_at)}
                  </td>
                  <td className="px-3 py-2 text-[12px] text-foreground">
                    {order.transport_type || "—"}
                  </td>
                  <td className="px-3 py-2 text-[12px] font-medium text-foreground">
                    {order.client_name || "Onbekend"}
                  </td>
                  <td className="px-3 py-2 text-[12px] text-muted-foreground tabular-nums whitespace-nowrap hidden lg:table-cell">
                    {formatTime(order.created_at)}
                  </td>
                  <td className="px-3 py-2 text-[12px] text-muted-foreground hidden md:table-cell">
                    {order.vehicle_id ? (
                      <Badge variant="outline" className="text-[9px] px-1.5">Toegewezen</Badge>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[12px] text-muted-foreground truncate max-w-[120px] hidden lg:table-cell">
                    {order.quantity && order.unit
                      ? `${order.quantity} ${order.unit}`
                      : order.weight_kg
                        ? `${order.weight_kg} kg`
                        : "—"
                    }
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-[11px] font-mono text-foreground/80">
                      {order.invoice_ref || "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 hidden xl:table-cell">
                    <span className="text-[10px] font-mono text-muted-foreground tracking-wider">
                      {order.barcode || "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant="outline"
                      className={cn("text-[9px] px-1.5 py-0.5 border", statusColors[order.status])}
                    >
                      {statusLabels[order.status] || order.status}
                    </Badge>
                  </td>
                </motion.tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    Geen transportopdrachten gevonden
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
};

export default Transportopdrachten;
