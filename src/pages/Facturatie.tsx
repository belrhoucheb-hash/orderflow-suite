import { useState, useMemo, useCallback } from "react";
import { Receipt, Search, Plus, Eye, Download, Loader2, Sparkles, ArrowRight, X, Check, FileDown, Send, CreditCard, AlertCircle, ChevronDown, FileSpreadsheet, FileCode } from "lucide-react";
import { SortableHeader, type SortConfig } from "@/components/ui/SortableHeader";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useInvoices, useInvoiceById, useCreateInvoice, useUpdateInvoiceStatus, type InvoiceLine } from "@/hooks/useInvoices";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useClients } from "@/hooks/useClients";
import { downloadInvoicePDF, downloadInvoicesCSV, downloadUBL } from "@/lib/invoiceUtils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Invoice {
  id: string;
  invoice_number: string;
  client_id: string;
  client_name: string;
  status: string;
  invoice_date: string;
  due_date: string | null;
  subtotal: number;
  btw_percentage: number;
  btw_amount: number;
  total: number;
  notes: string | null;
  pdf_url: string | null;
  created_at: string;
}

const statusStyles: Record<string, string> = {
  concept: "bg-muted text-muted-foreground border-border",
  verzonden: "bg-blue-500/8 text-blue-700 border-blue-200/60",
  betaald: "bg-emerald-500/8 text-emerald-700 border-emerald-200/60",
  vervallen: "bg-red-500/8 text-red-700 border-red-200/60",
};

const statusDotColors: Record<string, string> = {
  concept: "bg-muted-foreground/40",
  verzonden: "bg-blue-500",
  betaald: "bg-emerald-500",
  vervallen: "bg-red-500",
};

const statusLabels: Record<string, string> = {
  concept: "Concept",
  verzonden: "Verzonden",
  betaald: "Betaald",
  vervallen: "Vervallen",
};

const filterOptions = ["alle", "concept", "verzonden", "betaald", "vervallen"] as const;

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate || status !== "verzonden") return false;
  return new Date(dueDate) < new Date();
}

const Facturatie = () => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const { data: invoices = [], isLoading, isError, refetch } = useInvoices();
  const queryClient = useQueryClient();
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  // Fetch full invoice with lines for the detail dialog / PDF generation
  const { data: invoiceWithLines } = useInvoiceById(selectedInvoice?.id ?? null);

  // ─── Invoice Status Flow ───
  const updateInvoiceStatus = useUpdateInvoiceStatus();
  const [showSendConfirm, setShowSendConfirm] = useState(false);

  const handleStatusChange = useCallback(async (invoiceId: string, newStatus: string, invoiceNumber: string) => {
    try {
      await updateInvoiceStatus.mutateAsync({ id: invoiceId, status: newStatus as any });
      const statusLabel = statusLabels[newStatus] || newStatus;
      toast.success(`Factuur ${invoiceNumber} bijgewerkt`, { description: `Status: ${statusLabel}` });
      // Update the selected invoice in local state so the dialog reflects the change
      setSelectedInvoice((prev) => prev ? { ...prev, status: newStatus } : null);
    } catch (e: any) {
      toast.error("Status wijzigen mislukt", { description: e.message });
    }
  }, [updateInvoiceStatus]);

  const handleDownloadPDF = useCallback(() => {
    if (!invoiceWithLines) {
      toast.error("Factuurgegevens nog niet geladen");
      return;
    }
    try {
      downloadInvoicePDF(invoiceWithLines);
      toast.success("PDF wordt gedownload");
    } catch (e: any) {
      toast.error("PDF generatie mislukt", { description: e.message });
    }
  }, [invoiceWithLines]);

  // ─── New Invoice Dialog State ───
  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const { data: clients = [] } = useClients();
  const createInvoiceMutation = useCreateInvoice();

  // Fetch uninvoiced orders for the selected client
  const { data: clientOrders = [], isLoading: isLoadingClientOrders } = useQuery({
    queryKey: ["client-uninvoiced-orders", selectedClientId],
    enabled: !!selectedClientId,
    queryFn: async () => {
      // Look up the client name from the selected client ID
      const client = clients.find((c) => c.id === selectedClientId);
      if (!client) return [];
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, client_name, weight_kg, quantity, unit, pickup_address, delivery_address, status")
        .eq("status", "DELIVERED")
        .is("invoice_id", null)
        .ilike("client_name", `%${client.name}%`)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch client rates to calculate line totals
  const { data: clientRates = [] } = useQuery({
    queryKey: ["client-rates-for-invoice", selectedClientId],
    enabled: !!selectedClientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_rates")
        .select("*")
        .eq("client_id", selectedClientId)
        .eq("is_active", true)
        .order("rate_type");
      if (error) throw error;
      return data || [];
    },
  });

  const toggleOrderSelection = useCallback((orderId: string) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }, []);

  const handleCreateInvoice = useCallback(async () => {
    if (!selectedClientId || selectedOrderIds.size === 0) return;

    // Build invoice lines from selected orders
    const lines: Omit<InvoiceLine, "id" | "invoice_id" | "created_at">[] = [];
    let sortOrder = 0;
    const selectedOrders = clientOrders.filter((o: any) => selectedOrderIds.has(o.id));

    for (const order of selectedOrders) {
      if (clientRates.length === 0) {
        // No rates configured - add a placeholder line
        lines.push({
          order_id: order.id,
          description: `Transport #${order.order_number} — ${order.pickup_address?.split(",")[0] || "?"} → ${order.delivery_address?.split(",")[0] || "?"}`,
          quantity: 1,
          unit: "rit",
          unit_price: 0,
          total: 0,
          sort_order: sortOrder++,
        });
      } else {
        for (const rate of clientRates) {
          let qty = 1;
          let unitLabel = "stuk";
          let include = false;

          switch (rate.rate_type) {
            case "per_km": { qty = 150; unitLabel = "km"; include = true; break; }
            case "per_pallet": {
              const pallets = order.quantity ?? 0;
              if (pallets > 0) { qty = pallets; unitLabel = "pallet"; include = true; }
              break;
            }
            case "per_rit": { qty = 1; unitLabel = "rit"; include = true; break; }
            case "toeslag":
            case "surcharge": { qty = 1; unitLabel = "stuk"; include = true; break; }
            default: { qty = 1; unitLabel = "stuk"; include = true; break; }
          }

          if (include) {
            const lineTotal = Math.round(qty * rate.amount * 100) / 100;
            lines.push({
              order_id: order.id,
              description: `Order #${order.order_number}: ${rate.description || rate.rate_type}`,
              quantity: qty,
              unit: unitLabel,
              unit_price: rate.amount,
              total: lineTotal,
              sort_order: sortOrder++,
            });
          }
        }
      }
    }

    try {
      const invoice = await createInvoiceMutation.mutateAsync({
        client_id: selectedClientId,
        lines,
      });
      toast.success(`Factuur ${invoice.invoice_number} aangemaakt`, {
        description: `${selectedOrderIds.size} order(s) gekoppeld`,
      });
      setShowNewInvoice(false);
      setSelectedClientId("");
      setSelectedOrderIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["uninvoiced-orders"] });
    } catch (e: any) {
      toast.error("Factuur aanmaken mislukt", { description: e.message });
    }
  }, [selectedClientId, selectedOrderIds, clientOrders, clientRates, createInvoiceMutation, queryClient]);

  const handleSort = (field: string) => {
    setSortConfig((prev) =>
      prev?.field === field
        ? { field, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { field, direction: "asc" }
    );
  };
  const navigate = useNavigate();

  // Auto invoice suggestions: delivered orders without invoice
  const { data: uninvoicedOrders = [] } = useQuery({
    queryKey: ["uninvoiced-orders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders")
        .select("id, order_number, client_name, weight_kg, quantity, unit, delivery_address, billing_status")
        .eq("status", "DELIVERED")
        .is("invoice_id", null)
        .or("billing_status.is.null,billing_status.eq.GEREED,billing_status.eq.NIET_GEREED")
        .order("updated_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = useMemo(() => {
    const result = (invoices as Invoice[]).filter((inv) => {
      const matchesSearch =
        inv.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
        inv.client_name.toLowerCase().includes(search.toLowerCase());

      let effectiveStatus = inv.status;
      if (isOverdue(inv.due_date, inv.status)) {
        effectiveStatus = "vervallen";
      }

      const matchesStatus =
        statusFilter === "alle" || effectiveStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });

    if (!sortConfig) return result;

    const { field, direction } = sortConfig;
    return [...result].sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";
      switch (field) {
        case "invoice_number": aVal = a.invoice_number.toLowerCase(); bVal = b.invoice_number.toLowerCase(); break;
        case "client_name": aVal = a.client_name.toLowerCase(); bVal = b.client_name.toLowerCase(); break;
        case "total": aVal = a.total; bVal = b.total; break;
        case "status": {
          const aStatus = isOverdue(a.due_date, a.status) ? "vervallen" : a.status;
          const bStatus = isOverdue(b.due_date, b.status) ? "vervallen" : b.status;
          aVal = aStatus; bVal = bStatus; break;
        }
        default: return 0;
      }
      if (aVal < bVal) return direction === "asc" ? -1 : 1;
      if (aVal > bVal) return direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [invoices, search, statusFilter, sortConfig]);

  // ─── Export handlers ───
  const handleExportCSV = useCallback(() => {
    if (filtered.length === 0) {
      toast.error("Geen facturen om te exporteren");
      return;
    }
    downloadInvoicesCSV(filtered as any);
    toast.success("CSV export gedownload", { description: `${filtered.length} facturen geexporteerd` });
  }, [filtered]);

  const handleExportUBL = useCallback(async () => {
    if (filtered.length === 0) {
      toast.error("Geen facturen om te exporteren");
      return;
    }
    let exportCount = 0;
    for (const inv of filtered) {
      const { data: fullInvoice, error } = await supabase
        .from("invoices")
        .select("*, invoice_lines(*)")
        .eq("id", inv.id)
        .single();

      if (error || !fullInvoice) continue;

      if (fullInvoice.invoice_lines) {
        fullInvoice.invoice_lines.sort((a: any, b: any) => a.sort_order - b.sort_order);
      }

      downloadUBL(fullInvoice as any);
      exportCount++;
    }
    toast.success("UBL export gedownload", { description: `${exportCount} XML-bestanden geexporteerd` });
  }, [filtered]);

  const stats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let totaalOpenstaand = 0;
    let dezeMaandGefactureerd = 0;
    let betaaldDezeMaand = 0;
    let vervallenCount = 0;

    (invoices as Invoice[]).forEach((inv) => {
      const invDate = new Date(inv.invoice_date);
      const isThisMonth =
        invDate.getMonth() === currentMonth &&
        invDate.getFullYear() === currentYear;

      if (inv.status === "verzonden") {
        totaalOpenstaand += inv.total;
      }

      if (isOverdue(inv.due_date, inv.status)) {
        vervallenCount++;
      }

      if (isThisMonth && (inv.status === "verzonden" || inv.status === "betaald")) {
        dezeMaandGefactureerd += inv.total;
      }

      if (inv.status === "betaald" && isThisMonth) {
        betaaldDezeMaand += inv.total;
      }
    });

    return { totaalOpenstaand, dezeMaandGefactureerd, betaaldDezeMaand, vervallenCount };
  }, [invoices]);

  if (isLoading) {
    return <LoadingState message="Facturen laden..." />;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-foreground mb-1">Kan gegevens niet laden</p>
        <p className="text-xs text-muted-foreground mb-3">Controleer je verbinding</p>
        <button onClick={() => refetch()} className="text-xs text-primary hover:underline">Opnieuw proberen</button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <PageHeader
        title="Facturatie"
        subtitle={`${invoices.length} facturen in totaal`}
        actions={
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2 rounded-xl h-10 px-4">
                  <FileDown className="h-4 w-4" />
                  Exporteer
                  <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={handleExportCSV} className="gap-2 cursor-pointer">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  Export CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportUBL} className="gap-2 cursor-pointer">
                  <FileCode className="h-4 w-4 text-blue-600" />
                  Export UBL (XML)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button className="gap-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm h-10 px-5"
              onClick={() => { setShowNewInvoice(true); setSelectedClientId(""); setSelectedOrderIds(new Set()); }}>
              <Plus className="h-4 w-4" /> Nieuwe factuur
            </Button>
          </div>
        }
      />

      {/* Auto invoice suggestions */}
      {uninvoicedOrders.length > 0 && (
        <div className="rounded-xl border border-green-200 bg-green-50/50 p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-green-800">{uninvoicedOrders.length} afgeleverde orders zonder factuur</p>
              <p className="text-xs text-green-600 mt-0.5">Deze orders zijn afgeleverd en kunnen gefactureerd worden.</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {uninvoicedOrders.slice(0, 5).map((order: any) => (
                  <Link key={order.id} to={`/orders/${order.id}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-white border border-green-200 rounded-lg px-2.5 py-1.5 hover:border-green-400 transition-colors">
                    #{order.order_number} — {order.client_name}
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Totaal openstaand",
            value: formatCurrency(stats.totaalOpenstaand),
            icon: Receipt,
            color: "text-blue-600",
            bg: "bg-blue-500/8",
          },
          {
            label: "Deze maand gefactureerd",
            value: formatCurrency(stats.dezeMaandGefactureerd),
            icon: Receipt,
            color: "text-primary",
            bg: "bg-primary/8",
          },
          {
            label: "Betaald deze maand",
            value: formatCurrency(stats.betaaldDezeMaand),
            icon: Receipt,
            color: "text-emerald-600",
            bg: "bg-emerald-500/8",
          },
          {
            label: "Vervallen",
            value: String(stats.vervallenCount),
            icon: Receipt,
            color: "text-red-600",
            bg: "bg-red-500/8",
          },
        ].map((stat) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card rounded-xl border border-border/40 p-4 flex items-center gap-3"
          >
            <div
              className={cn(
                "h-9 w-9 rounded-lg flex items-center justify-center",
                stat.bg
              )}
            >
              <stat.icon className={cn("h-4.5 w-4.5", stat.color)} />
            </div>
            <div>
              <p className="text-xl font-semibold font-display tabular-nums">
                {stat.value}
              </p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
          <input
            placeholder="Zoek op factuurnummer of klant..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-10 pr-4 rounded-xl border border-border/50 bg-card text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring/40 transition-all"
          />
        </div>
        <div className="flex rounded-xl border border-border/50 bg-card p-1 gap-0.5 overflow-x-auto max-w-full">
          {filterOptions.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 whitespace-nowrap",
                statusFilter === s
                  ? "bg-foreground text-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {s === "alle" ? "Alle" : statusLabels[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Table Card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-card rounded-xl shadow-sm border border-border/40 overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th className="px-4 py-2.5 text-left">
                  <SortableHeader label="Factuurnummer" field="invoice_number" currentSort={sortConfig} onSort={handleSort} />
                </th>
                <th className="px-4 py-2.5 text-left">
                  <SortableHeader label="Klant" field="client_name" currentSort={sortConfig} onSort={handleSort} />
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60 hidden md:table-cell">
                  Datum
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60 hidden md:table-cell">
                  Vervaldatum
                </th>
                <th className="px-4 py-2.5 text-right">
                  <SortableHeader label="Bedrag" field="total" currentSort={sortConfig} onSort={handleSort} className="justify-end" />
                </th>
                <th className="px-4 py-2.5 text-left">
                  <SortableHeader label="Status" field="status" currentSort={sortConfig} onSort={handleSort} />
                </th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                  Acties
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              <AnimatePresence mode="popLayout">
                {filtered.map((invoice, idx) => {
                  const overdue = isOverdue(invoice.due_date, invoice.status);
                  const effectiveStatus = overdue ? "vervallen" : invoice.status;

                  return (
                    <motion.tr
                      key={invoice.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ delay: idx * 0.02 }}
                      onClick={() => setSelectedInvoice(invoice)}
                      className="hover:bg-muted/20 transition-colors duration-100 group cursor-pointer"
                    >
                      <td className="px-4 py-2">
                        <span className="font-mono text-sm font-medium text-foreground flex items-center gap-1.5">
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full shrink-0",
                              statusDotColors[effectiveStatus]
                            )}
                          />
                          {invoice.invoice_number}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm text-foreground/80">
                        {invoice.client_name}
                      </td>
                      <td className="px-4 py-2 text-sm text-muted-foreground hidden md:table-cell">
                        {formatDate(invoice.invoice_date)}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-2 text-sm hidden md:table-cell",
                          overdue
                            ? "text-red-600 font-medium"
                            : "text-muted-foreground"
                        )}
                      >
                        {invoice.due_date ? formatDate(invoice.due_date) : "—"}
                      </td>
                      <td className="px-4 py-2 text-sm text-foreground/80 text-right tabular-nums font-medium">
                        {formatCurrency(invoice.total)}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border",
                            statusStyles[effectiveStatus]
                          )}
                        >
                          <span
                            className={cn(
                              "h-1 w-1 rounded-full",
                              statusDotColors[effectiveStatus]
                            )}
                          />
                          {statusLabels[effectiveStatus]}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedInvoice(invoice); }}
                            className="p-1.5 rounded-md hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          {invoice.pdf_url && (
                            <a
                              href={invoice.pdf_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="p-1.5 rounded-md hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center">
                    <Receipt className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">
                      Geen facturen gevonden
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/30 bg-muted/20">
          <p className="text-xs text-muted-foreground">
            {filtered.length} van {invoices.length} facturen
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            Totaal: {formatCurrency(filtered.reduce((s, inv) => s + inv.total, 0))}
          </p>
        </div>
      </motion.div>

      {/* Invoice Detail Dialog */}
      <Dialog open={!!selectedInvoice} onOpenChange={(open) => !open && setSelectedInvoice(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Factuur {selectedInvoice?.invoice_number}</DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Klant</p>
                  <p className="font-medium">{selectedInvoice.client_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border", statusStyles[isOverdue(selectedInvoice.due_date, selectedInvoice.status) ? "vervallen" : selectedInvoice.status])}>
                    {statusLabels[isOverdue(selectedInvoice.due_date, selectedInvoice.status) ? "vervallen" : selectedInvoice.status]}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Factuurdatum</p>
                  <p>{formatDate(selectedInvoice.invoice_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Vervaldatum</p>
                  <p className={isOverdue(selectedInvoice.due_date, selectedInvoice.status) ? "text-red-600 font-medium" : ""}>
                    {selectedInvoice.due_date ? formatDate(selectedInvoice.due_date) : "—"}
                  </p>
                </div>
              </div>
              <div className="border-t border-border/30 pt-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotaal</span>
                  <span>{formatCurrency(selectedInvoice.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-muted-foreground">BTW ({selectedInvoice.btw_percentage}%)</span>
                  <span>{formatCurrency(selectedInvoice.btw_amount)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold mt-2 pt-2 border-t border-border/30">
                  <span>Totaal</span>
                  <span>{formatCurrency(selectedInvoice.total)}</span>
                </div>
              </div>
              {selectedInvoice.notes && (
                <div className="text-sm">
                  <p className="text-xs text-muted-foreground mb-1">Notities</p>
                  <p className="text-muted-foreground">{selectedInvoice.notes}</p>
                </div>
              )}
              {/* Download PDF button */}
              <div className="pt-2 border-t border-border/30">
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={handleDownloadPDF}
                  disabled={!invoiceWithLines}
                >
                  <FileDown className="h-4 w-4" />
                  {invoiceWithLines ? "Download PDF" : "Laden..."}
                </Button>
              </div>

              {/* Status action buttons */}
              {(() => {
                const effectiveStatus = isOverdue(selectedInvoice.due_date, selectedInvoice.status) ? "vervallen" : selectedInvoice.status;
                return (
                  <div className="pt-2 border-t border-border/30 space-y-2">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Status wijzigen</p>

                    {effectiveStatus === "concept" && (
                      <Button
                        className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={() => setShowSendConfirm(true)}
                        disabled={updateInvoiceStatus.isPending}
                      >
                        {updateInvoiceStatus.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Markeer als verzonden
                      </Button>
                    )}

                    {effectiveStatus === "verzonden" && (
                      <>
                        <Button
                          className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => handleStatusChange(selectedInvoice.id, "betaald", selectedInvoice.invoice_number)}
                          disabled={updateInvoiceStatus.isPending}
                        >
                          {updateInvoiceStatus.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                          Markeer als betaald
                        </Button>
                        <Button
                          variant="outline"
                          className="w-full gap-2 border-red-200 text-red-700 hover:bg-red-50"
                          onClick={() => handleStatusChange(selectedInvoice.id, "vervallen", selectedInvoice.invoice_number)}
                          disabled={updateInvoiceStatus.isPending}
                        >
                          {updateInvoiceStatus.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertCircle className="h-4 w-4" />}
                          Markeer als vervallen
                        </Button>
                      </>
                    )}

                    {effectiveStatus === "vervallen" && (
                      <Button
                        className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => handleStatusChange(selectedInvoice.id, "betaald", selectedInvoice.invoice_number)}
                        disabled={updateInvoiceStatus.isPending}
                      >
                        {updateInvoiceStatus.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                        Markeer als betaald
                      </Button>
                    )}

                    {effectiveStatus === "betaald" && (
                      <p className="text-xs text-emerald-600 text-center py-1">Betaald — geen verdere acties</p>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Send Confirmation Dialog */}
      <Dialog open={showSendConfirm} onOpenChange={setShowSendConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-blue-600" />
              Factuur markeren als verzonden?
            </DialogTitle>
            <DialogDescription>
              Door deze factuur als verzonden te markeren, geef je aan dat de factuur naar de klant is gestuurd. Dit kan niet ongedaan gemaakt worden.
            </DialogDescription>
          </DialogHeader>
          {selectedInvoice && (
            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
              <p><strong>Factuur:</strong> {selectedInvoice.invoice_number}</p>
              <p><strong>Klant:</strong> {selectedInvoice.client_name}</p>
              <p><strong>Bedrag:</strong> {formatCurrency(selectedInvoice.total)}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSendConfirm(false)}>
              Annuleren
            </Button>
            <Button
              className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => {
                if (selectedInvoice) {
                  handleStatusChange(selectedInvoice.id, "verzonden", selectedInvoice.invoice_number);
                }
                setShowSendConfirm(false);
              }}
              disabled={updateInvoiceStatus.isPending}
            >
              {updateInvoiceStatus.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Bevestig verzenden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Invoice Dialog */}
      <Dialog open={showNewInvoice} onOpenChange={setShowNewInvoice}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nieuwe factuur aanmaken</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {/* Client selector */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Klant</label>
              <select
                value={selectedClientId}
                onChange={(e) => { setSelectedClientId(e.target.value); setSelectedOrderIds(new Set()); }}
                className="w-full h-10 px-3 rounded-lg border border-border/50 bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
              >
                <option value="">Selecteer een klant...</option>
                {clients.filter((c) => c.is_active).map((client) => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
            </div>

            {/* Uninvoiced orders for this client */}
            {selectedClientId && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Onverfactureerde orders
                </label>
                {isLoadingClientOrders ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : clientOrders.length === 0 ? (
                  <div className="text-center py-6 bg-muted/30 rounded-lg border border-border/30">
                    <p className="text-sm text-muted-foreground">Geen onverfactureerde orders voor deze klant</p>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto rounded-lg border border-border/30 p-2">
                    {clientOrders.map((order: any) => (
                      <label
                        key={order.id}
                        className={cn(
                          "flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors",
                          selectedOrderIds.has(order.id) ? "bg-primary/5 border border-primary/20" : "hover:bg-muted/40 border border-transparent"
                        )}
                      >
                        <Checkbox
                          checked={selectedOrderIds.has(order.id)}
                          onCheckedChange={() => toggleOrderSelection(order.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-mono font-medium">#{order.order_number}</span>
                            {order.quantity > 0 && (
                              <span className="text-xs text-muted-foreground">{order.quantity} {order.unit || "stuks"}</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {order.pickup_address?.split(",")[0] || "?"} → {order.delivery_address?.split(",")[0] || "?"}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Summary */}
            {selectedOrderIds.size > 0 && (
              <div className="bg-muted/30 rounded-lg p-3 border border-border/30">
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{selectedOrderIds.size}</span> order(s) geselecteerd
                  {clientRates.length === 0 && (
                    <span className="text-amber-600 ml-2">— geen tarieven geconfigureerd, lege regels worden aangemaakt</span>
                  )}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowNewInvoice(false)}>
                Annuleren
              </Button>
              <Button
                onClick={handleCreateInvoice}
                disabled={!selectedClientId || selectedOrderIds.size === 0 || createInvoiceMutation.isPending}
                className="gap-2"
              >
                {createInvoiceMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Factuur aanmaken
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Facturatie;
